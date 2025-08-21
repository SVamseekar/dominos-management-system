package com.dominos.shared.model;

import java.time.LocalTime;
import java.util.Map;

public class WorkSchedule {
    private Map<String, ShiftTime> weeklySchedule;
    private Integer maxHoursPerWeek;
    
    public WorkSchedule() {}
    
    // Getters and setters
    public Map<String, ShiftTime> getWeeklySchedule() { 
        return weeklySchedule; 
    }
    
    public void setWeeklySchedule(Map<String, ShiftTime> weeklySchedule) { 
        this.weeklySchedule = weeklySchedule; 
    }
    
    public Integer getMaxHoursPerWeek() { 
        return maxHoursPerWeek; 
    }
    
    public void setMaxHoursPerWeek(Integer maxHoursPerWeek) { 
        this.maxHoursPerWeek = maxHoursPerWeek; 
    }
    
    public static class ShiftTime {
        private LocalTime startTime;
        private LocalTime endTime;
        private boolean isWorkingDay;
        
        public ShiftTime() {}
        
        // Getters and setters
        public LocalTime getStartTime() { return startTime; }
        public void setStartTime(LocalTime startTime) { this.startTime = startTime; }
        
        public LocalTime getEndTime() { return endTime; }
        public void setEndTime(LocalTime endTime) { this.endTime = endTime; }
        
        public boolean isWorkingDay() { return isWorkingDay; }
        public void setWorkingDay(boolean workingDay) { isWorkingDay = workingDay; }
    }
}