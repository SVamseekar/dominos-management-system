package com.dominos.shared.model;

import java.time.LocalTime;

public class TimeSlot {
    private LocalTime startTime;
    private LocalTime endTime;
    private boolean isOpen;
    
    public TimeSlot() {}
    
    public TimeSlot(LocalTime startTime, LocalTime endTime) {
        this.startTime = startTime;
        this.endTime = endTime;
        this.isOpen = true;
    }
    
    public TimeSlot(LocalTime startTime, LocalTime endTime, boolean isOpen) {
        this.startTime = startTime;
        this.endTime = endTime;
        this.isOpen = isOpen;
    }
    
    public boolean isWithin(LocalTime time) {
        if (!isOpen || time == null) return false;
        
        // Handle overnight hours (e.g., 23:00 - 01:00)
        if (startTime.isAfter(endTime)) {
            return time.isAfter(startTime) || time.isBefore(endTime);
        }
        
        return !time.isBefore(startTime) && !time.isAfter(endTime);
    }
    
    // Getters and setters
    public LocalTime getStartTime() { return startTime; }
    public void setStartTime(LocalTime startTime) { this.startTime = startTime; }
    
    public LocalTime getEndTime() { return endTime; }
    public void setEndTime(LocalTime endTime) { this.endTime = endTime; }
    
    public boolean isOpen() { return isOpen; }
    public void setOpen(boolean open) { isOpen = open; }
}