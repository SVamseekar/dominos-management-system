package com.dominos.user.controller;

import com.dominos.user.dto.WorkingSessionResponse;
import com.dominos.user.dto.WorkingHoursReport;
import com.dominos.user.service.WorkingSessionService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users/sessions")
@Tag(name = "Working Sessions", description = "Employee working hours and session management")
@SecurityRequirement(name = "bearerAuth")
public class WorkingSessionController {
    
    @Autowired
    private WorkingSessionService sessionService;
    
    @PostMapping("/start")
    @Operation(summary = "Start working session")
    @PreAuthorize("hasRole('STAFF') or hasRole('DRIVER') or hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<WorkingSessionResponse> startSession(
            @RequestHeader("X-User-Id") String employeeId,
            @RequestHeader("X-Store-Id") String storeId) {
        var session = sessionService.startSession(employeeId, storeId);
        return ResponseEntity.ok(mapToResponse(session));
    }
    
    @PostMapping("/end")
    @Operation(summary = "End working session")
    @PreAuthorize("hasRole('STAFF') or hasRole('DRIVER') or hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<WorkingSessionResponse> endSession(@RequestHeader("X-User-Id") String employeeId) {
        var session = sessionService.endSession(employeeId);
        return ResponseEntity.ok(mapToResponse(session));
    }
    
    @PostMapping("/{employeeId}/break")
    @Operation(summary = "Add break time to session")
    @PreAuthorize("#employeeId == authentication.name or hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<WorkingSessionResponse> addBreakTime(
            @PathVariable String employeeId,
            @RequestBody Map<String, Long> request) {
        Long breakMinutes = request.get("breakMinutes");
        var session = sessionService.addBreakTime(employeeId, breakMinutes);
        return ResponseEntity.ok(mapToResponse(session));
    }
    
    @GetMapping("/current")
    @Operation(summary = "Get current working session")
    public ResponseEntity<WorkingSessionResponse> getCurrentSession(@RequestHeader("X-User-Id") String employeeId) {
        WorkingSessionResponse session = sessionService.getCurrentSession(employeeId);
        return ResponseEntity.ok(session);
    }
    
    @GetMapping("/{employeeId}")
    @Operation(summary = "Get employee working sessions")
    @PreAuthorize("#employeeId == authentication.name or hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<List<WorkingSessionResponse>> getEmployeeSessions(
            @PathVariable String employeeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        List<WorkingSessionResponse> sessions = sessionService.getEmployeeSessions(employeeId, startDate, endDate);
        return ResponseEntity.ok(sessions);
    }
    
    @GetMapping("/store/{storeId}")
    @Operation(summary = "Get store working sessions")
    @PreAuthorize("hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<List<WorkingSessionResponse>> getStoreSessions(
            @PathVariable String storeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        List<WorkingSessionResponse> sessions = sessionService.getStoreSessions(storeId, startDate, endDate);
        return ResponseEntity.ok(sessions);
    }
    
    @GetMapping("/{employeeId}/report")
    @Operation(summary = "Generate working hours report")
    @PreAuthorize("#employeeId == authentication.name or hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<WorkingHoursReport> getWorkingHoursReport(
            @PathVariable String employeeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        WorkingHoursReport report = sessionService.generateEmployeeReport(employeeId, startDate, endDate);
        return ResponseEntity.ok(report);
    }
    
    @GetMapping("/store/{storeId}/active")
    @Operation(summary = "Get active sessions for store")
    @PreAuthorize("hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<List<WorkingSessionResponse>> getActiveStoreSessions(@PathVariable String storeId) {
        List<WorkingSessionResponse> sessions = sessionService.getActiveSessionsForStore(storeId);
        return ResponseEntity.ok(sessions);
    }
    
    @GetMapping("/{employeeId}/status")
    @Operation(summary = "Check if employee is currently working")
    public ResponseEntity<Map<String, Object>> getEmployeeWorkingStatus(@PathVariable String employeeId) {
        boolean isWorking = sessionService.isEmployeeCurrentlyWorking(employeeId);
        Duration currentDuration = sessionService.getCurrentWorkingDuration(employeeId);
        
        return ResponseEntity.ok(Map.of(
            "isWorking", isWorking,
            "currentWorkingDuration", currentDuration
        ));
    }
    
    private WorkingSessionResponse mapToResponse(com.dominos.shared.entity.WorkingSession session) {
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