package com.dominos.user.service;

import com.dominos.shared.entity.WorkingSession;
import com.dominos.user.dto.WorkingSessionResponse;
import com.dominos.user.dto.WorkingHoursReport;
import com.dominos.user.repository.WorkingSessionRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Transactional
public class WorkingSessionService {
    
    @Autowired
    private WorkingSessionRepository sessionRepository;
    
    public WorkingSession startSession(String employeeId, String storeId) {
        sessionRepository.findActiveSessionByEmployeeId(employeeId)
                .ifPresent(session -> {
                    session.setLogoutTime(LocalDateTime.now());
                    session.setActive(false);
                    session.calculateTotalHours();
                    sessionRepository.save(session);
                });
        
        WorkingSession session = new WorkingSession(employeeId, storeId, LocalDateTime.now());
        return sessionRepository.save(session);
    }
    
    public WorkingSession endSession(String employeeId) {
        WorkingSession session = sessionRepository.findActiveSessionByEmployeeId(employeeId)
                .orElseThrow(() -> new RuntimeException("No active session found"));
        
        session.setLogoutTime(LocalDateTime.now());
        session.setActive(false);
        session.calculateTotalHours();
        
        return sessionRepository.save(session);
    }
    
    public WorkingSession addBreakTime(String employeeId, long breakMinutes) {
        WorkingSession session = sessionRepository.findActiveSessionByEmployeeId(employeeId)
                .orElseThrow(() -> new RuntimeException("No active session found"));
        
        session.setBreakDurationMinutes(session.getBreakDurationMinutes() + breakMinutes);
        return sessionRepository.save(session);
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
                .filter(s -> s.getTotalHours() != null)
                .mapToDouble(WorkingSession::getTotalHours)
                .sum();
        
        long totalDays = sessions.stream()
                .filter(s -> s.getTotalHours() != null)
                .count();
        
        double averageHours = totalDays > 0 ? totalHours / totalDays : 0;
        
        Map<LocalDate, Double> dailyHours = sessions.stream()
                .filter(s -> s.getTotalHours() != null)
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