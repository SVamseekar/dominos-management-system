package com.dominos.user.service;

import com.dominos.shared.entity.Shift;
import com.dominos.shared.entity.WorkingSession;
import com.dominos.shared.enums.ShiftStatus;
import com.dominos.user.repository.ShiftRepository;
import com.dominos.user.repository.WorkingSessionRepository;
import com.dominos.user.exception.ShiftViolationException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

@Service
public class ShiftValidationService {
    
    @Autowired
    private ShiftRepository shiftRepository;
    
    @Autowired
    private WorkingSessionRepository sessionRepository;
    
    public ShiftValidationResult validateSessionStart(String employeeId, String storeId, LocalDateTime startTime) {
        // Find current shift for employee
        Optional<Shift> currentShift = findCurrentShift(employeeId, startTime);
        
        if (currentShift.isEmpty()) {
            return ShiftValidationResult.warning("No scheduled shift found, proceeding with unscheduled session");
        }
        
        Shift shift = currentShift.get();
        
        // Validate store assignment
        if (!shift.getStoreId().equals(storeId)) {
            throw new ShiftViolationException(
                "Employee scheduled for different store: " + shift.getStoreId());
        }
        
        // Validate timing
        if (!shift.canStartAt(startTime)) {
            Duration earlyBy = Duration.between(startTime, shift.getScheduledStart());
            Duration lateBy = Duration.between(shift.getScheduledStart(), startTime);
            
            if (!startTime.isBefore(shift.getScheduledStart())) {
                throw new ShiftViolationException(
                    "Starting too early. Shift starts at: " + shift.getScheduledStart());
            } else if (lateBy.toMinutes() > 30) {
                throw new ShiftViolationException(
                    "Starting too late. Shift started at: " + shift.getScheduledStart());
            }
        }
        
        // Check for conflicting sessions
        List<WorkingSession> conflictingSessions = sessionRepository
            .findConflictingSessions(employeeId, startTime, shift.getScheduledEnd());
        
        if (!conflictingSessions.isEmpty()) {
            throw new ShiftViolationException("Conflicting work session detected");
        }
        
        // Validate rest period from previous shift
        validateRestPeriod(employeeId, startTime);
        
        return ShiftValidationResult.success(shift);
    }
    
    private Optional<Shift> findCurrentShift(String employeeId, LocalDateTime time) {
        return shiftRepository.findCurrentShiftForEmployee(employeeId, time);
    }
    
    private void validateRestPeriod(String employeeId, LocalDateTime startTime) {
        Optional<WorkingSession> lastSession = sessionRepository
            .findLastCompletedSession(employeeId, startTime.toLocalDate().minusDays(1));
        
        if (lastSession.isPresent()) {
            WorkingSession previous = lastSession.get();
            if (previous.getLogoutTime() != null) {
                Duration restPeriod = Duration.between(previous.getLogoutTime(), startTime);
                
                if (restPeriod.toHours() < 8) {
                    throw new ShiftViolationException(
                        "Insufficient rest period. Minimum 8 hours required. Last logout: " 
                        + previous.getLogoutTime());
                }
            }
        }
    }
    
    public void validateSessionEnd(String employeeId, LocalDateTime endTime) {
        Optional<Shift> currentShift = findCurrentShift(employeeId, endTime);
        
        if (currentShift.isPresent()) {
            Shift shift = currentShift.get();
            
            // Check if ending too early
            Duration remaining = Duration.between(endTime, shift.getScheduledEnd());
            if (remaining.toMinutes() > 30) {
                // Log early departure but allow it
                // Could require manager approval for early departures
            }
        }
    }
    
    public static class ShiftValidationResult {
        private final boolean isValid;
        private final String message;
        private final Shift shift;
        private final String severity; // SUCCESS, WARNING, ERROR
        
        private ShiftValidationResult(boolean isValid, String message, Shift shift, String severity) {
            this.isValid = isValid;
            this.message = message;
            this.shift = shift;
            this.severity = severity;
        }
        
        public static ShiftValidationResult success(Shift shift) {
            return new ShiftValidationResult(true, "Shift validation successful", shift, "SUCCESS");
        }
        
        public static ShiftValidationResult warning(String message) {
            return new ShiftValidationResult(true, message, null, "WARNING");
        }
        
        public static ShiftValidationResult error(String message) {
            return new ShiftValidationResult(false, message, null, "ERROR");
        }
        
        // Getters
        public boolean isValid() { return isValid; }
        public String getMessage() { return message; }
        public Shift getShift() { return shift; }
        public String getSeverity() { return severity; }
    }
}