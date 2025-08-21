package com.dominos.shared.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import com.dominos.shared.enums.WorkingSessionStatus;
import com.dominos.shared.model.Location;
import com.dominos.shared.model.SessionViolation;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.time.Duration;
import java.util.List;
import java.util.ArrayList;

@Document(collection = "working_sessions")
@CompoundIndex(def = "{'employeeId': 1, 'date': -1}")
@CompoundIndex(def = "{'storeId': 1, 'date': -1}")
@CompoundIndex(def = "{'employeeId': 1, 'isActive': 1}")
@CompoundIndex(def = "{'status': 1}")
public class WorkingSession {
    
    @Id
    private String id;
    
    @NotNull
    @Field("employeeId")
    @Indexed
    private String employeeId;
    
    @NotNull
    @Field("storeId")
    @Indexed
    private String storeId;
    
    @NotNull
    @Field("date")
    @Indexed
    private LocalDate date;
    
    @NotNull
    @Field("loginTime")
    private LocalDateTime loginTime;
    
    @Field("logoutTime")
    private LocalDateTime logoutTime;
    
    @Field("totalHours")
    private Double totalHours;
    
    @Field("isActive")
    private boolean isActive = true;
    
    @Field("breakDurationMinutes")
    private Long breakDurationMinutes = 0L;
    
    @Field("notes")
    private String notes;
    
    // NEW ENHANCED FIELDS
    @Field("shiftId")
    private String shiftId;  // Reference to scheduled shift
    
    @Field("status")
    private WorkingSessionStatus status = WorkingSessionStatus.ACTIVE;
    
    @Field("clockInLocation")
    private Location clockInLocation;
    
    @Field("clockOutLocation") 
    private Location clockOutLocation;
    
    @Field("requiresApproval")
    private boolean requiresApproval = false;
    
    @Field("approvedBy")
    private String approvedBy;
    
    @Field("approvalTime")
    private LocalDateTime approvalTime;
    
    @Field("violations")
    private List<SessionViolation> violations = new ArrayList<>();
    
    @Field("createdAt")
    private LocalDateTime createdAt = LocalDateTime.now();
    
    @Field("lastModified")
    private LocalDateTime lastModified = LocalDateTime.now();
    
    @Field("mandatoryBreakTaken")
    private boolean mandatoryBreakTaken = false;
    
    @Field("overtimeApproved")
    private boolean overtimeApproved = false;
    
    @Field("emergencySession")
    private boolean emergencySession = false;
    
    // Constructors
    public WorkingSession() {}
    
    public WorkingSession(String employeeId, String storeId, LocalDateTime loginTime) {
        this.employeeId = employeeId;
        this.storeId = storeId;
        this.loginTime = loginTime;
        this.date = loginTime.toLocalDate();
        this.status = WorkingSessionStatus.ACTIVE;
        this.createdAt = LocalDateTime.now();
        this.lastModified = LocalDateTime.now();
    }
    
    // Business Logic Methods
    public void calculateTotalHours() {
        if (loginTime != null && logoutTime != null) {
            Duration duration = Duration.between(loginTime, logoutTime);
            long totalMinutes = duration.toMinutes() - breakDurationMinutes;
            this.totalHours = Math.max(0, totalMinutes) / 60.0; // Ensure non-negative
            this.lastModified = LocalDateTime.now();
        }
    }
    
    public boolean isSessionComplete() {
        return logoutTime != null && !isActive;
    }
    
    public Duration getWorkingDuration() {
        if (loginTime == null) return Duration.ZERO;
        
        LocalDateTime endTime = logoutTime != null ? logoutTime : LocalDateTime.now();
        Duration totalDuration = Duration.between(loginTime, endTime);
        Duration workingDuration = totalDuration.minusMinutes(breakDurationMinutes);
        
        // Ensure non-negative duration
        return workingDuration.isNegative() ? Duration.ZERO : workingDuration;
    }
    
    public boolean isValidSession() {
        if (loginTime == null) return false;
        
        Duration sessionLength = getWorkingDuration();
        
        // Clear existing validation-related violations
        if (violations != null) {
            violations.removeIf(v -> v.getViolationType().startsWith("VALIDATION_"));
        }
        
        // Session should not exceed 16 hours
        if (sessionLength.toHours() > 16) {
            addViolation(new SessionViolation("VALIDATION_EXCESSIVE_HOURS", 
                "Session exceeds maximum 16 hours: " + sessionLength.toHours()));
            return false;
        }
        
        // Session should be at least 30 minutes if completed
        if (logoutTime != null && sessionLength.toMinutes() < 30) {
            addViolation(new SessionViolation("VALIDATION_TOO_SHORT", 
                "Session less than 30 minutes: " + sessionLength.toMinutes()));
            return false;
        }
        
        // Check break compliance for long shifts
        if (sessionLength.toHours() > 6 && breakDurationMinutes < 30 && !mandatoryBreakTaken) {
            addViolation(new SessionViolation("VALIDATION_INSUFFICIENT_BREAKS", 
                "Long shift requires minimum 30 minutes break"));
            return false;
        }
        
        return violations.stream().noneMatch(v -> v.getViolationType().startsWith("VALIDATION_"));
    }
    
    public void addViolation(SessionViolation violation) {
        if (violations == null) {
            violations = new ArrayList<>();
        }
        
        // Avoid duplicate violations
        boolean exists = violations.stream()
                .anyMatch(v -> v.getViolationType().equals(violation.getViolationType()));
        
        if (!exists) {
            violations.add(violation);
            this.requiresApproval = true;
            this.lastModified = LocalDateTime.now();
        }
    }
    
    public boolean requiresManagerApproval() {
        return requiresApproval || 
               (violations != null && !violations.isEmpty()) || 
               getWorkingDuration().toHours() > 12 ||
               hasLocationViolations() ||
               isOvertimeSession();
    }
    
    public boolean hasLocationViolations() {
        if (violations == null) return false;
        return violations.stream()
                .anyMatch(v -> v.getViolationType().contains("LOCATION") || 
                              v.getViolationType().contains("REMOTE"));
    }
    
    public boolean isOvertimeSession() {
        return getWorkingDuration().toHours() > 8; // Standard 8-hour day
    }
    
    public boolean isLongShift() {
        return getWorkingDuration().toHours() > 10;
    }
    
    public double getOvertimeHours() {
        double totalHours = getWorkingDuration().toMinutes() / 60.0;
        return Math.max(0, totalHours - 8); // Overtime after 8 hours
    }
    
    public void markMandatoryBreakTaken() {
        this.mandatoryBreakTaken = true;
        this.lastModified = LocalDateTime.now();
    }
    
    public void approveOvertime(String approverId) {
        this.overtimeApproved = true;
        this.approvedBy = approverId;
        this.approvalTime = LocalDateTime.now();
        this.lastModified = LocalDateTime.now();
    }
    
    public void markAsEmergencySession(String reason) {
        this.emergencySession = true;
        this.notes = (notes != null ? notes + "; " : "") + "Emergency session: " + reason;
        addViolation(new SessionViolation("EMERGENCY_SESSION", reason));
        this.lastModified = LocalDateTime.now();
    }
    
    public boolean canEndSession() {
        // Basic validation - session must be active and have login time
        if (!isActive || loginTime == null) {
            return false;
        }
        
        // Must have worked at least 15 minutes (to prevent accidental clock-ins)
        Duration worked = getWorkingDuration();
        return worked.toMinutes() >= 15;
    }
    
    public void validateLocationProximity(Location storeLocation, double maxDistanceKm) {
        if (clockInLocation != null && storeLocation != null) {
            double distance = clockInLocation.getDistanceFrom(storeLocation);
            if (distance > maxDistanceKm) {
                addViolation(new SessionViolation("REMOTE_CLOCKIN", 
                    String.format("Clock in location %.2f km from store (max: %.2f km)", 
                                distance, maxDistanceKm)));
            }
        }
        
        if (clockOutLocation != null && storeLocation != null) {
            double distance = clockOutLocation.getDistanceFrom(storeLocation);
            if (distance > maxDistanceKm) {
                addViolation(new SessionViolation("REMOTE_CLOCKOUT", 
                    String.format("Clock out location %.2f km from store (max: %.2f km)", 
                                distance, maxDistanceKm)));
            }
        }
    }
    
    public SessionSummary getSummary() {
        return new SessionSummary(
            id, employeeId, date, 
            getWorkingDuration(), 
            totalHours, 
            breakDurationMinutes,
            violations != null ? violations.size() : 0,
            requiresManagerApproval(),
            status
        );
    }
    
    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public String getEmployeeId() { return employeeId; }
    public void setEmployeeId(String employeeId) { this.employeeId = employeeId; }
    
    public String getStoreId() { return storeId; }
    public void setStoreId(String storeId) { this.storeId = storeId; }
    
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
    
    public LocalDateTime getLoginTime() { return loginTime; }
    public void setLoginTime(LocalDateTime loginTime) { 
        this.loginTime = loginTime;
        if (loginTime != null) {
            this.date = loginTime.toLocalDate();
        }
        this.lastModified = LocalDateTime.now();
    }
    
    public LocalDateTime getLogoutTime() { return logoutTime; }
    public void setLogoutTime(LocalDateTime logoutTime) { 
        this.logoutTime = logoutTime;
        this.lastModified = LocalDateTime.now();
        calculateTotalHours();
    }
    
    public Double getTotalHours() { return totalHours; }
    public void setTotalHours(Double totalHours) { 
        this.totalHours = totalHours;
        this.lastModified = LocalDateTime.now();
    }
    
    public boolean isActive() { return isActive; }
    public void setActive(boolean active) { 
        isActive = active;
        this.lastModified = LocalDateTime.now();
    }
    
    public Long getBreakDurationMinutes() { return breakDurationMinutes; }
    public void setBreakDurationMinutes(Long breakDurationMinutes) { 
        this.breakDurationMinutes = breakDurationMinutes;
        this.lastModified = LocalDateTime.now();
    }
    
    public String getNotes() { return notes; }
    public void setNotes(String notes) { 
        this.notes = notes;
        this.lastModified = LocalDateTime.now();
    }
    
    // NEW ENHANCED GETTERS AND SETTERS
    public String getShiftId() { return shiftId; }
    public void setShiftId(String shiftId) { 
        this.shiftId = shiftId;
        this.lastModified = LocalDateTime.now();
    }
    
    public WorkingSessionStatus getStatus() { return status; }
    public void setStatus(WorkingSessionStatus status) { 
        this.status = status;
        this.lastModified = LocalDateTime.now();
    }
    
    public Location getClockInLocation() { return clockInLocation; }
    public void setClockInLocation(Location clockInLocation) { 
        this.clockInLocation = clockInLocation;
        this.lastModified = LocalDateTime.now();
    }
    
    public Location getClockOutLocation() { return clockOutLocation; }
    public void setClockOutLocation(Location clockOutLocation) { 
        this.clockOutLocation = clockOutLocation;
        this.lastModified = LocalDateTime.now();
    }
    
    public boolean isRequiresApproval() { return requiresApproval; }
    public void setRequiresApproval(boolean requiresApproval) { 
        this.requiresApproval = requiresApproval;
        this.lastModified = LocalDateTime.now();
    }
    
    public String getApprovedBy() { return approvedBy; }
    public void setApprovedBy(String approvedBy) { 
        this.approvedBy = approvedBy;
        this.lastModified = LocalDateTime.now();
    }
    
    public LocalDateTime getApprovalTime() { return approvalTime; }
    public void setApprovalTime(LocalDateTime approvalTime) { 
        this.approvalTime = approvalTime;
        this.lastModified = LocalDateTime.now();
    }
    
    public List<SessionViolation> getViolations() { return violations; }
    public void setViolations(List<SessionViolation> violations) { 
        this.violations = violations;
        this.lastModified = LocalDateTime.now();
    }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    
    public LocalDateTime getLastModified() { return lastModified; }
    public void setLastModified(LocalDateTime lastModified) { this.lastModified = lastModified; }
    
    public boolean isMandatoryBreakTaken() { return mandatoryBreakTaken; }
    public void setMandatoryBreakTaken(boolean mandatoryBreakTaken) { 
        this.mandatoryBreakTaken = mandatoryBreakTaken;
        this.lastModified = LocalDateTime.now();
    }
    
    public boolean isOvertimeApproved() { return overtimeApproved; }
    public void setOvertimeApproved(boolean overtimeApproved) { 
        this.overtimeApproved = overtimeApproved;
        this.lastModified = LocalDateTime.now();
    }
    
    public boolean isEmergencySession() { return emergencySession; }
    public void setEmergencySession(boolean emergencySession) { 
        this.emergencySession = emergencySession;
        this.lastModified = LocalDateTime.now();
    }
    
    // Inner class for session summary
    public static class SessionSummary {
        private final String sessionId;
        private final String employeeId;
        private final LocalDate date;
        private final Duration workingDuration;
        private final Double totalHours;
        private final Long breakMinutes;
        private final int violationCount;
        private final boolean requiresApproval;
        private final WorkingSessionStatus status;
        
        public SessionSummary(String sessionId, String employeeId, LocalDate date, 
                            Duration workingDuration, Double totalHours, Long breakMinutes,
                            int violationCount, boolean requiresApproval, WorkingSessionStatus status) {
            this.sessionId = sessionId;
            this.employeeId = employeeId;
            this.date = date;
            this.workingDuration = workingDuration;
            this.totalHours = totalHours;
            this.breakMinutes = breakMinutes;
            this.violationCount = violationCount;
            this.requiresApproval = requiresApproval;
            this.status = status;
        }
        
        // Getters
        public String getSessionId() { return sessionId; }
        public String getEmployeeId() { return employeeId; }
        public LocalDate getDate() { return date; }
        public Duration getWorkingDuration() { return workingDuration; }
        public Double getTotalHours() { return totalHours; }
        public Long getBreakMinutes() { return breakMinutes; }
        public int getViolationCount() { return violationCount; }
        public boolean isRequiresApproval() { return requiresApproval; }
        public WorkingSessionStatus getStatus() { return status; }
    }
}