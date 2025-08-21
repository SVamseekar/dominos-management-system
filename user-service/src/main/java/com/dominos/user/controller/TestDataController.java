package com.dominos.user.controller;

import com.dominos.shared.entity.Store;
import com.dominos.shared.enums.StoreStatus;
import com.dominos.shared.model.Address;
import com.dominos.user.service.StoreService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/test-data")
@Tag(name = "Test Data", description = "Endpoints for creating test data")
public class TestDataController {
    
    @Autowired
    private StoreService storeService;
    
    @PostMapping("/create-default-store")
    @Operation(summary = "Create default test store")
    public ResponseEntity<Map<String, Object>> createDefaultStore() {
        try {
            // Create default store
            Store store = new Store();
            store.setName("Domino's Banjara Hills");
            store.setCode("DOM001");
            store.setPhoneNumber("9876543200");
            store.setRegionId("SOUTH");
            store.setStatus(StoreStatus.ACTIVE);
            store.setOpeningDate(LocalDateTime.now());
            
            // Set address
            Address address = new Address();
            address.setStreet("Road No. 12, Banjara Hills");
            address.setCity("Hyderabad");
            address.setState("Telangana");
            address.setPincode("500034");
            address.setLatitude(17.4126);
            address.setLongitude(78.4482);
            store.setAddress(address);
            
            // Set configuration
            Store.StoreConfiguration config = new Store.StoreConfiguration();
            config.setDeliveryRadiusKm(5.0);
            config.setMaxConcurrentOrders(50);
            config.setEstimatedPrepTimeMinutes(25);
            config.setAcceptsOnlineOrders(true);
            config.setAcceptsCashPayments(true);
            config.setMaxDeliveryTimeMinutes(30);
            config.setMinimumOrderValueINR(99.0);
            store.setConfiguration(config);
            
            Store savedStore = storeService.saveStore(store);
            
            return ResponseEntity.ok(Map.of(
                "message", "Default store created successfully",
                "storeId", savedStore.getId(),
                "storeCode", savedStore.getCode(),
                "storeName", savedStore.getName()
            ));
            
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of(
                "message", "Store might already exist: " + e.getMessage(),
                "storeCode", "DOM001"
            ));
        }
    }
    
    @PostMapping("/create-test-stores")
    @Operation(summary = "Create multiple test stores")
    public ResponseEntity<Map<String, Object>> createTestStores() {
        try {
            // Store 1: Banjara Hills
            createStoreIfNotExists("DOM001", "Domino's Banjara Hills", "Hyderabad", "500034", 17.4126, 78.4482);
            
            // Store 2: Jubilee Hills
            createStoreIfNotExists("DOM002", "Domino's Jubilee Hills", "Hyderabad", "500033", 17.4239, 78.4738);
            
            // Store 3: Gachibowli
            createStoreIfNotExists("DOM003", "Domino's Gachibowli", "Hyderabad", "500032", 17.4435, 78.3772);
            
            return ResponseEntity.ok(Map.of(
                "message", "Test stores created successfully",
                "stores", new String[]{"DOM001", "DOM002", "DOM003"}
            ));
            
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of(
                "message", "Test stores creation completed with some duplicates",
                "error", e.getMessage()
            ));
        }
    }
    
    private void createStoreIfNotExists(String code, String name, String city, String pincode, 
                                      double latitude, double longitude) {
        try {
            Store store = new Store();
            store.setName(name);
            store.setCode(code);
            store.setPhoneNumber("987654320" + code.substring(3)); // Different phone for each
            store.setRegionId("SOUTH");
            store.setStatus(StoreStatus.ACTIVE);
            store.setOpeningDate(LocalDateTime.now());
            
            Address address = new Address();
            address.setStreet("Commercial Area");
            address.setCity(city);
            address.setState("Telangana");
            address.setPincode(pincode);
            address.setLatitude(latitude);
            address.setLongitude(longitude);
            store.setAddress(address);
            
            Store.StoreConfiguration config = new Store.StoreConfiguration();
            config.setDeliveryRadiusKm(5.0);
            config.setMaxConcurrentOrders(50);
            config.setAcceptsOnlineOrders(true);
            store.setConfiguration(config);
            
            storeService.saveStore(store);
        } catch (Exception e) {
            // Store might already exist, which is fine
        }
    }
}