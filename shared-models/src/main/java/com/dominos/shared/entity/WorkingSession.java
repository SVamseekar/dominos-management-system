package com.dominos.shared.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.index.CompoundIndex;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.time.Duration;

@Document(collection = "working_sessions")
@CompoundIndex(def = "{'employeeId': 1, 'date': -1}")
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
    
    @Field("breakDuration")
    private Long breakDurationMinutes = 0L;
    
    @Field("notes")
    private String notes;
    
    // Constructors
    public WorkingSession() {}
    
    public WorkingSession(String employeeId, String storeId, LocalDateTime loginTime) {
        this.employeeId = employeeId;
        this.storeId = storeId;
        this.loginTime = loginTime;
        this.date = loginTime.toLocalDate();
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
    }
    
    public LocalDateTime getLogoutTime() { return logoutTime; }
    public void setLogoutTime(LocalDateTime logoutTime) { 
        this.logoutTime = logoutTime;
        calculateTotalHours();
    }
    
    public Double getTotalHours() { return totalHours; }
    public void setTotalHours(Double totalHours) { this.totalHours = totalHours; }
    
    public boolean isActive() { return isActive; }
    public void setActive(boolean active) { isActive = active; }
    
    public Long getBreakDurationMinutes() { return breakDurationMinutes; }
    public void setBreakDurationMinutes(Long breakDurationMinutes) { this.breakDurationMinutes = breakDurationMinutes; }
    
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    
    // Helper methods
    public void calculateTotalHours() {
        if (loginTime != null && logoutTime != null) {
            Duration duration = Duration.between(loginTime, logoutTime);
            long totalMinutes = duration.toMinutes() - breakDurationMinutes;
            this.totalHours = totalMinutes / 60.0;
        }
    }
    
    public boolean isSessionComplete() {
        return logoutTime != null;
    }
    
    public Duration getWorkingDuration() {
        if (loginTime == null) return Duration.ZERO;
        
        LocalDateTime endTime = logoutTime != null ? logoutTime : LocalDateTime.now();
        return Duration.between(loginTime, endTime).minusMinutes(breakDurationMinutes);
    }
}