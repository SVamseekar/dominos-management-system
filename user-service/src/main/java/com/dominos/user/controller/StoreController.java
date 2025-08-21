package com.dominos.user.controller;

import com.dominos.shared.entity.Store;
import com.dominos.shared.enums.StoreStatus;
import com.dominos.user.service.StoreService;
import com.dominos.user.service.AccessControlService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/stores")
@Tag(name = "Store Management", description = "Store operations and configuration")
@SecurityRequirement(name = "bearerAuth")
public class StoreController {
    
    @Autowired
    private StoreService storeService;
    
    @Autowired
    private AccessControlService accessControlService;
    
    @GetMapping("/{storeId}")
    @Operation(summary = "Get store by ID")
    public ResponseEntity<Store> getStore(@PathVariable String storeId) {
        Store store = storeService.getStore(storeId);
        return ResponseEntity.ok(store);
    }
    
    @GetMapping("/code/{storeCode}")
    @Operation(summary = "Get store by code")
    public ResponseEntity<Store> getStoreByCode(@PathVariable String storeCode) {
        Store store = storeService.getStoreByCode(storeCode);
        return ResponseEntity.ok(store);
    }
    
    @GetMapping
    @Operation(summary = "Get all active stores")
    public ResponseEntity<List<Store>> getActiveStores() {
        List<Store> stores = storeService.getActiveStores();
        return ResponseEntity.ok(stores);
    }
    
    @GetMapping("/region/{regionId}")
    @Operation(summary = "Get stores by region")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<List<Store>> getStoresByRegion(@PathVariable String regionId) {
        List<Store> stores = storeService.getStoresByRegion(regionId);
        return ResponseEntity.ok(stores);
    }
    
    @GetMapping("/nearby")
    @Operation(summary = "Find stores in delivery radius")
    public ResponseEntity<List<Store>> getNearbyStores(
            @RequestParam double latitude,
            @RequestParam double longitude) {
        List<Store> stores = storeService.getStoresInDeliveryRadius(latitude, longitude);
        return ResponseEntity.ok(stores);
    }
    
    @PostMapping
    @Operation(summary = "Create new store")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<Store> createStore(@Valid @RequestBody Store store) {
        Store savedStore = storeService.saveStore(store);
        return ResponseEntity.ok(savedStore);
    }
    
    @PutMapping("/{storeId}")
    @Operation(summary = "Update store")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<Store> updateStore(
            @PathVariable String storeId,
            @Valid @RequestBody Store store) {
        store.setId(storeId);
        Store updatedStore = storeService.saveStore(store);
        return ResponseEntity.ok(updatedStore);
    }
    
    @GetMapping("/{storeId}/operational-status")
    @Operation(summary = "Check if store is operational")
    public ResponseEntity<Map<String, Boolean>> getOperationalStatus(@PathVariable String storeId) {
        boolean isOperational = storeService.validateStoreOperational(storeId);
        return ResponseEntity.ok(Map.of("isOperational", isOperational));
    }
    
    @GetMapping("/{storeId}/metrics")
    @Operation(summary = "Get store metrics")
    @PreAuthorize("hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<Map<String, Object>> getStoreMetrics(@PathVariable String storeId) {
        Map<String, Object> metrics = storeService.getStoreMetrics(storeId);
        return ResponseEntity.ok(metrics);
    }
    
    @PostMapping("/{storeId}/access-check")
    @Operation(summary = "Validate order taking access")
    public ResponseEntity<AccessControlService.OrderTakingPermission> validateOrderAccess(
            @PathVariable String storeId,
            @RequestHeader("X-User-Id") String userId) {
        AccessControlService.OrderTakingPermission permission = 
            accessControlService.validateOrderTakingAccess(userId, storeId);
        return ResponseEntity.ok(permission);
    }
}