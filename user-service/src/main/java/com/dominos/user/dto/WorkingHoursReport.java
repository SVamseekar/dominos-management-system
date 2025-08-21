package com.dominos.user.dto;

import java.time.LocalDate;
import java.util.Map;

public class WorkingHoursReport {
    private String employeeId;
    private LocalDate startDate;
    private LocalDate endDate;
    private double totalHours;
    private int totalDays;
    private double averageHoursPerDay;
    private Map<LocalDate, Double> dailyHours;
    
    public WorkingHoursReport() {}
    
    public String getEmployeeId() { return employeeId; }
    public void setEmployeeId(String employeeId) { this.employeeId = employeeId; }
    
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }
    
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }
    
    public double getTotalHours() { return totalHours; }
    public void setTotalHours(double totalHours) { this.totalHours = totalHours; }
    
    public int getTotalDays() { return totalDays; }
    public void setTotalDays(int totalDays) { this.totalDays = totalDays; }
    
    public double getAverageHoursPerDay() { return averageHoursPerDay; }
    public void setAverageHoursPerDay(double averageHoursPerDay) { this.averageHoursPerDay = averageHoursPerDay; }
    
    public Map<LocalDate, Double> getDailyHours() { return dailyHours; }
    public void setDailyHours(Map<LocalDate, Double> dailyHours) { this.dailyHours = dailyHours; }
}