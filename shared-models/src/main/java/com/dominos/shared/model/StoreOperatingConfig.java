package com.dominos.shared.model;

import com.dominos.shared.entity.Store;  // ADD THIS IMPORT
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.Month;
import java.time.Year;
import java.util.HashMap;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;

public class StoreOperatingConfig {
    
    public static final LocalTime STANDARD_OPENING_TIME = LocalTime.of(11, 0); // 11:00 AM
    public static final LocalTime STANDARD_CLOSING_TIME = LocalTime.of(23, 0); // 11:00 PM
    
    public static Store.OperatingHours createStandardOperatingHours() {
        Store.OperatingHours operatingHours = new Store.OperatingHours();
        
        // Set 11 AM - 11 PM for all 7 days
        Map<DayOfWeek, TimeSlot> weeklySchedule = new HashMap<>();
        TimeSlot standardHours = new TimeSlot(STANDARD_OPENING_TIME, STANDARD_CLOSING_TIME, true);
        
        weeklySchedule.put(DayOfWeek.MONDAY, standardHours);
        weeklySchedule.put(DayOfWeek.TUESDAY, standardHours);
        weeklySchedule.put(DayOfWeek.WEDNESDAY, standardHours);
        weeklySchedule.put(DayOfWeek.THURSDAY, standardHours);
        weeklySchedule.put(DayOfWeek.FRIDAY, standardHours);
        weeklySchedule.put(DayOfWeek.SATURDAY, standardHours);
        weeklySchedule.put(DayOfWeek.SUNDAY, standardHours);
        
        operatingHours.setWeeklySchedule(weeklySchedule);
        
        // Christmas Day closure
        List<SpecialHours> specialHours = new ArrayList<>();
        specialHours.add(createChristmasClosureHours());
        operatingHours.setSpecialHours(specialHours);
        
        return operatingHours;
    }
    
    public static SpecialHours createChristmasClosureHours() {
        LocalDate christmasDate = LocalDate.of(2024, Month.DECEMBER, 25);
        SpecialHours christmas = new SpecialHours();
        christmas.setDate(christmasDate);
        christmas.setReason("Christmas Day - Annual Holiday");
        christmas.setClosed(true);
        christmas.setRecurring(true);
        christmas.setPriority(10);
        christmas.setDescription("Closed for Christmas Day celebration. We'll be back tomorrow!");
        
        return christmas;
    }
    
    public static int calculateOperatingDaysInYear(int year) {
        int totalDaysInYear = Year.of(year).length(); // 365 or 366 for leap years
        int closureDays = 1; // Only Christmas Day
        return totalDaysInYear - closureDays;
    }
    
    public static boolean isChristmasDay(LocalDate date) {
        return date.getMonth() == Month.DECEMBER && date.getDayOfMonth() == 25;
    }
    
    public static boolean shouldBeOperationalOnDate(LocalDate date) {
        return !isChristmasDay(date);
    }
}