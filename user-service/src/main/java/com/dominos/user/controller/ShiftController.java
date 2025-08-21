package com.dominos.user.controller;

import com.dominos.shared.entity.Shift;
import com.dominos.shared.enums.ShiftStatus;
import com.dominos.user.service.ShiftService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/shifts")
@Tag(name = "Shift Management", description = "Employee shift scheduling and management")
@SecurityRequirement(name = "bearerAuth")
public class ShiftController {
    
    @Autowired
    private ShiftService shiftService;
    
    @PostMapping
    @Operation(summary = "Create new shift")
    @PreAuthorize("hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<Shift> createShift(@Valid @RequestBody Shift shift) {
        Shift savedShift = shiftService.createShift(shift);
        return ResponseEntity.ok(savedShift);
    }
    
    @GetMapping("/{shiftId}")
    @Operation(summary = "Get shift by ID")
    public ResponseEntity<Shift> getShift(@PathVariable String shiftId) {
        Shift shift = shiftService.getShift(shiftId);
        return ResponseEntity.ok(shift);
    }
    
    @PutMapping("/{shiftId}")
    @Operation(summary = "Update shift")
    @PreAuthorize("hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<Shift> updateShift(
            @PathVariable String shiftId,
            @Valid @RequestBody Shift shift) {
        shift.setId(shiftId);
        Shift updatedShift = shiftService.updateShift(shift);
        return ResponseEntity.ok(updatedShift);
    }
    
    @DeleteMapping("/{shiftId}")
    @Operation(summary = "Cancel shift")
    @PreAuthorize("hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<Void> cancelShift(@PathVariable String shiftId) {
        shiftService.cancelShift(shiftId);
        return ResponseEntity.ok().build();
    }
    
    @GetMapping("/employee/{employeeId}")
    @Operation(summary = "Get employee shifts")
    @PreAuthorize("#employeeId == authentication.name or hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<List<Shift>> getEmployeeShifts(
            @PathVariable String employeeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        List<Shift> shifts = shiftService.getEmployeeShifts(employeeId, startDate, endDate);
        return ResponseEntity.ok(shifts);
    }
    
    @GetMapping("/store/{storeId}")
    @Operation(summary = "Get store shifts")
    @PreAuthorize("hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<List<Shift>> getStoreShifts(
            @PathVariable String storeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        List<Shift> shifts = shiftService.getStoreShifts(storeId, date);
        return ResponseEntity.ok(shifts);
    }
    
    @GetMapping("/employee/{employeeId}/current")
    @Operation(summary = "Get current shift for employee")
    public ResponseEntity<Shift> getCurrentShift(@PathVariable String employeeId) {
        Shift shift = shiftService.getCurrentShift(employeeId);
        return ResponseEntity.ok(shift);
    }
    
    @PostMapping("/{shiftId}/confirm")
    @Operation(summary = "Confirm shift attendance")
    @PreAuthorize("#shiftId == @shiftService.getShift(#shiftId).employeeId or hasRole('MANAGER')")
    public ResponseEntity<Shift> confirmShift(@PathVariable String shiftId) {
        Shift shift = shiftService.confirmShift(shiftId);
        return ResponseEntity.ok(shift);
    }
    
    @PostMapping("/{shiftId}/start")
    @Operation(summary = "Start shift")
    @PreAuthorize("#shiftId == @shiftService.getShift(#shiftId).employeeId")
    public ResponseEntity<Shift> startShift(@PathVariable String shiftId) {
        Shift shift = shiftService.startShift(shiftId);
        return ResponseEntity.ok(shift);
    }
    
    @PostMapping("/{shiftId}/complete")
    @Operation(summary = "Complete shift")
    @PreAuthorize("#shiftId == @shiftService.getShift(#shiftId).employeeId or hasRole('MANAGER')")
    public ResponseEntity<Shift> completeShift(@PathVariable String shiftId) {
        Shift shift = shiftService.completeShift(shiftId);
        return ResponseEntity.ok(shift);
    }
    
    @GetMapping("/store/{storeId}/coverage")
    @Operation(summary = "Check shift coverage for store")
    @PreAuthorize("hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<Map<String, Object>> getShiftCoverage(
            @PathVariable String storeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        Map<String, Object> coverage = shiftService.getShiftCoverage(storeId, date);
        return ResponseEntity.ok(coverage);
    }
}