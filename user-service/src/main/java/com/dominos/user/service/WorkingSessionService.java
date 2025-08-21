package com.dominos.user.service;

import com.dominos.shared.entity.WorkingSession;
import com.dominos.shared.entity.Shift;
import com.dominos.shared.enums.WorkingSessionStatus;
import com.dominos.shared.model.Location;
import com.dominos.shared.model.SessionViolation;
import com.dominos.user.dto.WorkingSessionResponse;
import com.dominos.user.dto.WorkingHoursReport;
import com.dominos.user.repository.WorkingSessionRepository;
import com.dominos.user.service.ShiftValidationService.ShiftValidationResult;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class WorkingSessionService {
    
    @Autowired
    private WorkingSessionRepository sessionRepository;
    
    @Autowired
    private ShiftValidationService shiftValidationService;
    
    @Autowired
    private StoreService storeService;
    
    @Autowired
    private NotificationService notificationService;
    
    public WorkingSession startSession(String employeeId, String storeId) {
        return startSessionWithLocation(employeeId, storeId, null);
    }
    
    public WorkingSession startSessionWithLocation(String employeeId, String storeId, Location clockInLocation) {
        LocalDateTime startTime = LocalDateTime.now();
        
        // Step 1: Handle any existing active sessions
        handleExistingActiveSessions(employeeId, startTime);
        
        // Step 2: Validate shift and business rules
        ShiftValidationResult validation = shiftValidationService
            .validateSessionStart(employeeId, storeId, startTime);
        
        // Step 3: Validate store operational status
        if (!storeService.validateStoreOperational(storeId)) {
            throw new RuntimeException("Store is not operational");
        }
        
        // Step 4: Create new session
        WorkingSession session = new WorkingSession(employeeId, storeId, startTime);
        
        if (validation.getShift() != null) {
            session.setShiftId(validation.getShift().getId());
        }
        
        if (clockInLocation != null) {
            session.setClockInLocation(clockInLocation);
            validateClockInLocation(session, storeId, clockInLocation);
        }
        
        if ("WARNING".equals(validation.getSeverity())) {
            session.addViolation(new SessionViolation("UNSCHEDULED_SHIFT", validation.getMessage()));
        }
        
        return sessionRepository.save(session);
    }
    
    private void handleExistingActiveSessions(String employeeId, LocalDateTime currentTime) {
        Optional<WorkingSession> existingSession = sessionRepository
            .findActiveSessionByEmployeeId(employeeId);
        
        if (existingSession.isPresent()) {
            WorkingSession existing = existingSession.get();
            
            // Check if it's a reasonable continuation (same day, short gap)
            Duration gap = Duration.between(existing.getLoginTime(), currentTime);
            
            if (gap.toHours() < 1 && existing.getDate().equals(currentTime.toLocalDate())) {
                // Likely a quick re-login, continue existing session
                return;
            }
            
            // Handle abandoned session
            if (gap.toHours() > 12) {
                // Auto-close very old sessions
                existing.setLogoutTime(existing.getLoginTime().plusHours(8)); // Assume 8-hour day
                existing.setStatus(WorkingSessionStatus.AUTO_CLOSED);
                existing.addViolation(new SessionViolation("AUTO_CLOSED", 
                    "Session auto-closed due to extended duration"));
            } else {
                // Recent session, needs manager approval
                existing.setLogoutTime(currentTime.minusMinutes(1));
                existing.setStatus(WorkingSessionStatus.PENDING_APPROVAL);
                existing.addViolation(new SessionViolation("MISSING_LOGOUT", 
                    "Previous session not properly closed"));
                
                // Notify manager
                notificationService.notifyManager(existing.getStoreId(), 
                    "Employee " + employeeId + " session requires approval");
            }
            
            existing.setActive(false);
            existing.calculateTotalHours();
            sessionRepository.save(existing);
        }
    }
    
    private void validateClockInLocation(WorkingSession session, String storeId, Location clockInLocation) {
        // Get store location and validate proximity
        var store = storeService.getStore(storeId);
        if (store.getAddress().getLatitude() != null && store.getAddress().getLongitude() != null) {
            Location storeLocation = new Location(
                store.getAddress().getLatitude(), 
                store.getAddress().getLongitude()
            );
            
            double distance = clockInLocation.getDistanceFrom(storeLocation);
            
            // Allow clock in within 100 meters of store
            if (distance > 0.1) { // 0.1 km = 100 meters
                session.addViolation(new SessionViolation("REMOTE_CLOCKIN", 
                    "Clock in location is " + String.format("%.2f", distance) + " km from store"));
            }
        }
    }
    
    public WorkingSession endSession(String employeeId) {
        return endSessionWithLocation(employeeId, null);
    }
    
    public WorkingSession endSessionWithLocation(String employeeId, Location clockOutLocation) {
        WorkingSession session = sessionRepository.findActiveSessionByEmployeeId(employeeId)
                .orElseThrow(() -> new RuntimeException("No active session found"));
        
        LocalDateTime endTime = LocalDateTime.now();
        
        // Validate shift timing
        shiftValidationService.validateSessionEnd(employeeId, endTime);
        
        session.setLogoutTime(endTime);
        session.setActive(false);
        
        if (clockOutLocation != null) {
            session.setClockOutLocation(clockOutLocation);
        }
        
        session.calculateTotalHours();
        
        // Validate session business rules
        validateSessionCompletion(session);
        
        // Determine final status
        if (session.requiresManagerApproval()) {
            session.setStatus(WorkingSessionStatus.PENDING_APPROVAL);
            notificationService.notifyManager(session.getStoreId(), 
                "Session requires approval for employee: " + employeeId);
        } else {
            session.setStatus(WorkingSessionStatus.COMPLETED);
        }
        
        return sessionRepository.save(session);
    }
    
    private void validateSessionCompletion(WorkingSession session) {
        Duration sessionLength = session.getWorkingDuration();
        
        // Validate session length
        if (sessionLength.toHours() > 12) {
            session.addViolation(new SessionViolation("EXCESSIVE_HOURS", 
                "Session exceeds 12 hours: " + sessionLength.toHours()));
        }
        
        if (sessionLength.toMinutes() < 30) {
            session.addViolation(new SessionViolation("TOO_SHORT", 
                "Session less than 30 minutes: " + sessionLength.toMinutes()));
        }
        
        // Validate break compliance for long shifts
        if (sessionLength.toHours() > 6 && session.getBreakDurationMinutes() < 30) {
            session.addViolation(new SessionViolation("INSUFFICIENT_BREAKS", 
                "Long shift requires minimum 30 minutes break"));
        }
    }
    
    public WorkingSession addBreakTime(String employeeId, long breakMinutes) {
        WorkingSession session = sessionRepository.findActiveSessionByEmployeeId(employeeId)
                .orElseThrow(() -> new RuntimeException("No active session found"));
        
        // Validate break request
        validateBreakRequest(session, breakMinutes);
        
        session.setBreakDurationMinutes(session.getBreakDurationMinutes() + breakMinutes);
        return sessionRepository.save(session);
    }
    
    private void validateBreakRequest(WorkingSession session, long breakMinutes) {
        Duration currentDuration = session.getWorkingDuration();
        long currentBreaks = session.getBreakDurationMinutes();
        
        // Maximum break validation (25% of shift duration)
        long maxAllowedBreaks = currentDuration.toMinutes() / 4;
        if (currentBreaks + breakMinutes > maxAllowedBreaks) {
            throw new RuntimeException("Break time exceeds maximum allowed: " + maxAllowedBreaks + " minutes");
        }
        
        // Minimum work time before break
        if (currentDuration.toMinutes() < 120) {
            throw new RuntimeException("Must work minimum 2 hours before taking break");
        }
    }
    
    public WorkingSessionResponse getCurrentSession(String employeeId) {
        return sessionRepository.findActiveSessionByEmployeeId(employeeId)
                .map(this::mapToResponse)
                .orElse(null);
    }
    
    public List<WorkingSessionResponse> getEmployeeSessions(String employeeId, LocalDate startDate, LocalDate endDate) {
        return sessionRepository.findByEmployeeIdAndDateBetween(employeeId, startDate, endDate)
                .stream()
                .map(this::mapToResponse)
                .toList();
    }
    
    public List<WorkingSessionResponse> getStoreSessions(String storeId, LocalDate startDate, LocalDate endDate) {
        return sessionRepository.findByStoreIdAndDateBetween(storeId, startDate, endDate)
                .stream()
                .map(this::mapToResponse)
                .toList();
    }
    
    public WorkingHoursReport generateEmployeeReport(String employeeId, LocalDate startDate, LocalDate endDate) {
        List<WorkingSession> sessions = sessionRepository.findByEmployeeIdAndDateBetween(employeeId, startDate, endDate);
        
        double totalHours = sessions.stream()
                .filter(s -> s.getTotalHours() != null && s.getStatus() != WorkingSessionStatus.REJECTED)
                .mapToDouble(WorkingSession::getTotalHours)
                .sum();
        
        long totalDays = sessions.stream()
                .filter(s -> s.getTotalHours() != null && s.getStatus() != WorkingSessionStatus.REJECTED)
                .count();
        
        double averageHours = totalDays > 0 ? totalHours / totalDays : 0;
        
        Map<LocalDate, Double> dailyHours = sessions.stream()
                .filter(s -> s.getTotalHours() != null && s.getStatus() != WorkingSessionStatus.REJECTED)
                .collect(Collectors.toMap(
                    WorkingSession::getDate,
                    WorkingSession::getTotalHours,
                    Double::sum
                ));
        
        WorkingHoursReport report = new WorkingHoursReport();
        report.setEmployeeId(employeeId);
        report.setStartDate(startDate);
        report.setEndDate(endDate);
        report.setTotalHours(totalHours);
        report.setTotalDays((int) totalDays);
        report.setAverageHoursPerDay(averageHours);
        report.setDailyHours(dailyHours);
        
        return report;
    }
    
    public List<WorkingSessionResponse> getActiveSessionsForStore(String storeId) {
        return sessionRepository.findActiveSessionsByStoreId(storeId)
                .stream()
                .map(this::mapToResponse)
                .toList();
    }
    
    public boolean isEmployeeCurrentlyWorking(String employeeId) {
        return sessionRepository.findActiveSessionByEmployeeId(employeeId).isPresent();
    }
    
    public Duration getCurrentWorkingDuration(String employeeId) {
        return sessionRepository.findActiveSessionByEmployeeId(employeeId)
                .map(WorkingSession::getWorkingDuration)
                .orElse(Duration.ZERO);
    }
    
    @Transactional
    public void approveSession(String sessionId, String managerId) {
        WorkingSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        
        session.setStatus(WorkingSessionStatus.APPROVED);
        session.setApprovedBy(managerId);
        session.setApprovalTime(LocalDateTime.now());
        session.setRequiresApproval(false);
        
        sessionRepository.save(session);
    }
    
    @Transactional
    public void rejectSession(String sessionId, String managerId, String reason) {
        WorkingSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        
        session.setStatus(WorkingSessionStatus.REJECTED);
        session.setApprovedBy(managerId);
        session.setApprovalTime(LocalDateTime.now());
        session.addViolation(new SessionViolation("MANAGER_REJECTION", reason));
        
        sessionRepository.save(session);
    }
    
    private WorkingSessionResponse mapToResponse(WorkingSession session) {
        WorkingSessionResponse response = new WorkingSessionResponse();
        response.setId(session.getId());
        response.setEmployeeId(session.getEmployeeId());
        response.setStoreId(session.getStoreId());
        response.setDate(session.getDate());
        response.setLoginTime(session.getLoginTime());
        response.setLogoutTime(session.getLogoutTime());
        response.setTotalHours(session.getTotalHours());
        response.setActive(session.isActive());
        response.setBreakDurationMinutes(session.getBreakDurationMinutes());
        response.setNotes(session.getNotes());
        
        if (session.isActive()) {
            response.setCurrentWorkingDuration(session.getWorkingDuration());
        }
        
        return response;
    }
}