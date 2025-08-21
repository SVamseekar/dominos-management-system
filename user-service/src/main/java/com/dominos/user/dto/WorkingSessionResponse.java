package com.dominos.user.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Duration;

public class WorkingSessionResponse {
    private String id;
    private String employeeId;
    private String storeId;
    private LocalDate date;
    private LocalDateTime loginTime;
    private LocalDateTime logoutTime;
    private Double totalHours;
    private boolean isActive;
    private Long breakDurationMinutes;
    private String notes;
    private Duration currentWorkingDuration;
    
    public WorkingSessionResponse() {}
    
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public String getEmployeeId() { return employeeId; }
    public void setEmployeeId(String employeeId) { this.employeeId = employeeId; }
    
    public String getStoreId() { return storeId; }
    public void setStoreId(String storeId) { this.storeId = storeId; }
    
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
    
    public LocalDateTime getLoginTime() { return loginTime; }
    public void setLoginTime(LocalDateTime loginTime) { this.loginTime = loginTime; }
    
    public LocalDateTime getLogoutTime() { return logoutTime; }
    public void setLogoutTime(LocalDateTime logoutTime) { this.logoutTime = logoutTime; }
    
    public Double getTotalHours() { return totalHours; }
    public void setTotalHours(Double totalHours) { this.totalHours = totalHours; }
    
    public boolean isActive() { return isActive; }
    public void setActive(boolean active) { isActive = active; }
    
    public Long getBreakDurationMinutes() { return breakDurationMinutes; }
    public void setBreakDurationMinutes(Long breakDurationMinutes) { this.breakDurationMinutes = breakDurationMinutes; }
    
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    
    public Duration getCurrentWorkingDuration() { return currentWorkingDuration; }
    public void setCurrentWorkingDuration(Duration currentWorkingDuration) { this.currentWorkingDuration = currentWorkingDuration; }
}