package com.dominos.shared.model;

import java.time.LocalDate;
import java.time.LocalTime;

public class SpecialHours {
    private LocalDate date;
    private String reason;
    private TimeSlot timeSlot;
    private boolean isClosed;
    private String description;
    private boolean isRecurring;
    private int priority;
    
    public SpecialHours() {}
    
    public boolean appliesTo(LocalDate date) {
        if (this.date == null || date == null) return false;
        
        if (isRecurring) {
            return this.date.getMonth() == date.getMonth() && 
                   this.date.getDayOfMonth() == date.getDayOfMonth();
        } else {
            return this.date.equals(date);
        }
    }
    
    public boolean isOpenAt(LocalTime time) {
        if (isClosed) return false;
        if (timeSlot == null) return true;
        return timeSlot.isWithin(time);
    }
    
    // Getters and setters
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
    
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    
    public TimeSlot getTimeSlot() { return timeSlot; }
    public void setTimeSlot(TimeSlot timeSlot) { this.timeSlot = timeSlot; }
    
    public boolean isClosed() { return isClosed; }
    public void setClosed(boolean closed) { isClosed = closed; }
    
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    
    public boolean isRecurring() { return isRecurring; }
    public void setRecurring(boolean recurring) { isRecurring = recurring; }
    
    public int getPriority() { return priority; }
    public void setPriority(int priority) { this.priority = priority; }
}