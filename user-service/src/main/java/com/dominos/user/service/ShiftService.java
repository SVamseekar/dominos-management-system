package com.dominos.user.service;

import com.dominos.shared.entity.Shift;
import com.dominos.shared.enums.ShiftStatus;
import com.dominos.shared.enums.ShiftType;
import com.dominos.user.repository.ShiftRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.HashMap;

@Service
@Transactional
public class ShiftService {
    
    @Autowired
    private ShiftRepository shiftRepository;
    
    @Autowired
    private NotificationService notificationService;
    
    public Shift createShift(Shift shift) {
        validateShiftCreation(shift);
        shift.setCreatedAt(LocalDateTime.now());
        return shiftRepository.save(shift);
    }
    
    public Shift getShift(String shiftId) {
        return shiftRepository.findById(shiftId)
                .orElseThrow(() -> new RuntimeException("Shift not found: " + shiftId));
    }
    
    public Shift updateShift(Shift shift) {
        Shift existing = getShift(shift.getId());
        
        // Only allow updates if shift hasn't started
        if (existing.getStatus() == ShiftStatus.IN_PROGRESS || 
            existing.getStatus() == ShiftStatus.COMPLETED) {
            throw new RuntimeException("Cannot update shift that has started or completed");
        }
        
        validateShiftCreation(shift);
        return shiftRepository.save(shift);
    }
    
    public void cancelShift(String shiftId) {
        Shift shift = getShift(shiftId);
        
        if (shift.getStatus() == ShiftStatus.IN_PROGRESS) {
            throw new RuntimeException("Cannot cancel shift that is in progress");
        }
        
        shift.setStatus(ShiftStatus.CANCELLED);
        shiftRepository.save(shift);
        
        // Notify employee of cancellation
        notificationService.notifyEmployee(shift.getEmployeeId(), 
            "Your shift on " + shift.getScheduledStart() + " has been cancelled");
    }
    
    public List<Shift> getEmployeeShifts(String employeeId, LocalDate startDate, LocalDate endDate) {
        LocalDateTime start = startDate.atStartOfDay();
        LocalDateTime end = endDate.atTime(LocalTime.MAX);
        return shiftRepository.findByEmployeeIdAndScheduledStartBetween(employeeId, start, end);
    }
    
    public List<Shift> getStoreShifts(String storeId, LocalDate date) {
        LocalDateTime start = date.atStartOfDay();
        LocalDateTime end = date.atTime(LocalTime.MAX);
        return shiftRepository.findByStoreIdAndScheduledStartBetween(storeId, start, end);
    }
    
    public Shift getCurrentShift(String employeeId) {
        return shiftRepository.findCurrentShiftForEmployee(employeeId, LocalDateTime.now())
                .orElse(null);
    }
    
    public Shift confirmShift(String shiftId) {
        Shift shift = getShift(shiftId);
        
        if (shift.getStatus() != ShiftStatus.SCHEDULED) {
            throw new RuntimeException("Can only confirm scheduled shifts");
        }
        
        shift.setStatus(ShiftStatus.CONFIRMED);
        return shiftRepository.save(shift);
    }
    
    public Shift startShift(String shiftId) {
        Shift shift = getShift(shiftId);
        
        if (!shift.canStartAt(LocalDateTime.now())) {
            throw new RuntimeException("Shift cannot be started at this time");
        }
        
        shift.setStatus(ShiftStatus.IN_PROGRESS);
        shift.setActualStart(LocalDateTime.now());
        return shiftRepository.save(shift);
    }
    
    public Shift completeShift(String shiftId) {
        Shift shift = getShift(shiftId);
        
        if (shift.getStatus() != ShiftStatus.IN_PROGRESS) {
            throw new RuntimeException("Can only complete shifts that are in progress");
        }
        
        shift.setStatus(ShiftStatus.COMPLETED);
        shift.setActualEnd(LocalDateTime.now());
        return shiftRepository.save(shift);
    }
    
    public Map<String, Object> getShiftCoverage(String storeId, LocalDate date) {
        List<Shift> shifts = getStoreShifts(storeId, date);
        
        Map<String, Object> coverage = new HashMap<>();
        coverage.put("totalShifts", shifts.size());
        
        long confirmedShifts = shifts.stream()
                .filter(s -> s.getStatus() == ShiftStatus.CONFIRMED || 
                           s.getStatus() == ShiftStatus.IN_PROGRESS ||
                           s.getStatus() == ShiftStatus.COMPLETED)
                .count();
        
        long missedShifts = shifts.stream()
                .filter(s -> s.getStatus() == ShiftStatus.MISSED)
                .count();
        
        coverage.put("confirmedShifts", confirmedShifts);
        coverage.put("missedShifts", missedShifts);
        coverage.put("coveragePercentage", shifts.isEmpty() ? 0 : (confirmedShifts * 100.0 / shifts.size()));
        
        return coverage;
    }
    
    private void validateShiftCreation(Shift shift) {
        // Validate shift duration
        if (shift.getScheduledEnd().isBefore(shift.getScheduledStart())) {
            throw new RuntimeException("Shift end time must be after start time");
        }
        
        // Validate shift duration (max 12 hours)
        if (shift.getScheduledDuration().toHours() > 12) {
            throw new RuntimeException("Shift duration cannot exceed 12 hours");
        }
        
        // Check for overlapping shifts for the same employee
        List<Shift> overlappingShifts = shiftRepository.findByEmployeeIdAndScheduledStartBetween(
            shift.getEmployeeId(), 
            shift.getScheduledStart().minusHours(1), 
            shift.getScheduledEnd().plusHours(1)
        );
        
        overlappingShifts = overlappingShifts.stream()
                .filter(s -> !s.getId().equals(shift.getId())) // Exclude current shift for updates
                .filter(s -> s.getStatus() != ShiftStatus.CANCELLED)
                .toList();
        
        if (!overlappingShifts.isEmpty()) {
            throw new RuntimeException("Employee has overlapping shifts");
        }
    }
}