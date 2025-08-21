// File: shared-models/src/main/java/com/dominos/shared/entity/Shift.java
package com.dominos.shared.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import com.dominos.shared.enums.ShiftType;
import com.dominos.shared.enums.ShiftStatus;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.time.Duration;

@Document(collection = "shifts")
@CompoundIndex(def = "{'storeId': 1, 'scheduledStart': 1}")
@CompoundIndex(def = "{'employeeId': 1, 'scheduledStart': 1}")
public class Shift {
    
    @Id
    private String id;
    
    @NotNull
    @Field("storeId")
    @Indexed
    private String storeId;
    
    @NotNull
    @Field("employeeId")
    @Indexed
    private String employeeId;
    
    @NotNull
    @Field("type")
    private ShiftType type;
    
    @NotNull
    @Field("scheduledStart")
    @Indexed
    private LocalDateTime scheduledStart;
    
    @NotNull
    @Field("scheduledEnd")
    private LocalDateTime scheduledEnd;
    
    @Field("actualStart")
    private LocalDateTime actualStart;
    
    @Field("actualEnd")
    private LocalDateTime actualEnd;
    
    @Field("status")
    private ShiftStatus status = ShiftStatus.SCHEDULED;
    
    @Field("roleRequired")
    private String roleRequired;
    
    @Field("isMandatory")
    private boolean isMandatory = true;
    
    @Field("notes")
    private String notes;
    
    @Field("createdAt")
    private LocalDateTime createdAt = LocalDateTime.now();
    
    @Field("createdBy")
    private String createdBy;
    
    // Constructors
    public Shift() {}
    
    public Shift(String storeId, String employeeId, ShiftType type, 
                 LocalDateTime scheduledStart, LocalDateTime scheduledEnd) {
        this.storeId = storeId;
        this.employeeId = employeeId;
        this.type = type;
        this.scheduledStart = scheduledStart;
        this.scheduledEnd = scheduledEnd;
    }
    
    // Business Logic Methods
    public boolean isCurrentlyActive() {
        LocalDateTime now = LocalDateTime.now();
        return status == ShiftStatus.IN_PROGRESS && 
               !now.isBefore(actualStart != null ? actualStart : scheduledStart) &&
               (actualEnd == null || now.isBefore(actualEnd));
    }
    
    public boolean canStartAt(LocalDateTime time) {
        Duration earlyThreshold = Duration.ofMinutes(15);
        Duration lateThreshold = Duration.ofMinutes(30);
        
        LocalDateTime earliestStart = scheduledStart.minus(earlyThreshold);
        LocalDateTime latestStart = scheduledStart.plus(lateThreshold);
        
        return !time.isBefore(earliestStart) && !time.isAfter(latestStart);
    }
    
    public Duration getScheduledDuration() {
        return Duration.between(scheduledStart, scheduledEnd);
    }
    
    public Duration getActualDuration() {
        if (actualStart == null) return Duration.ZERO;
        LocalDateTime end = actualEnd != null ? actualEnd : LocalDateTime.now();
        return Duration.between(actualStart, end);
    }
    
    public boolean isOvertime() {
        Duration actual = getActualDuration();
        Duration scheduled = getScheduledDuration();
        return actual.toMinutes() > scheduled.toMinutes() + 15;
    }
    
    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public String getStoreId() { return storeId; }
    public void setStoreId(String storeId) { this.storeId = storeId; }
    
    public String getEmployeeId() { return employeeId; }
    public void setEmployeeId(String employeeId) { this.employeeId = employeeId; }
    
    public ShiftType getType() { return type; }
    public void setType(ShiftType type) { this.type = type; }
    
    public LocalDateTime getScheduledStart() { return scheduledStart; }
    public void setScheduledStart(LocalDateTime scheduledStart) { this.scheduledStart = scheduledStart; }
    
    public LocalDateTime getScheduledEnd() { return scheduledEnd; }
    public void setScheduledEnd(LocalDateTime scheduledEnd) { this.scheduledEnd = scheduledEnd; }
    
    public LocalDateTime getActualStart() { return actualStart; }
    public void setActualStart(LocalDateTime actualStart) { this.actualStart = actualStart; }
    
    public LocalDateTime getActualEnd() { return actualEnd; }
    public void setActualEnd(LocalDateTime actualEnd) { this.actualEnd = actualEnd; }
    
    public ShiftStatus getStatus() { return status; }
    public void setStatus(ShiftStatus status) { this.status = status; }
    
    public String getRoleRequired() { return roleRequired; }
    public void setRoleRequired(String roleRequired) { this.roleRequired = roleRequired; }
    
    public boolean isMandatory() { return isMandatory; }
    public void setMandatory(boolean mandatory) { isMandatory = mandatory; }
    
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
}