package com.dominos.user.service;

import com.dominos.shared.entity.Store;
import com.dominos.shared.enums.StoreStatus;
import com.dominos.user.repository.StoreRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.HashMap;

@Service
@Transactional
public class StoreService {
    
    @Autowired
    private StoreRepository storeRepository;
    
    @Cacheable(value = "stores", key = "#storeId")
    public Store getStore(String storeId) {
        return storeRepository.findById(storeId)
                .orElseThrow(() -> new RuntimeException("Store not found: " + storeId));
    }
    
    public Store getStoreByCode(String storeCode) {
        return storeRepository.findByCode(storeCode)
                .orElseThrow(() -> new RuntimeException("Store not found with code: " + storeCode));
    }
    
    public List<Store> getActiveStores() {
        return storeRepository.findByStatus(StoreStatus.ACTIVE);
    }
    
    public List<Store> getStoresByRegion(String regionId) {
        return storeRepository.findByRegionId(regionId);
    }
    
    public List<Store> getStoresInDeliveryRadius(double latitude, double longitude) {
        List<Store> allStores = getActiveStores();
        return allStores.stream()
                .filter(store -> store.isWithinDeliveryRadius(latitude, longitude))
                .toList();
    }
    
    @CacheEvict(value = "stores", key = "#store.id")
    public Store saveStore(Store store) {
        store.setLastModified(LocalDateTime.now());
        return storeRepository.save(store);
    }
    
    public boolean validateStoreOperational(String storeId) {
        Store store = getStore(storeId);
        return store.isOperational(LocalDateTime.now());
    }
    
    public Map<String, Object> getStoreMetrics(String storeId) {
        Store store = getStore(storeId);
        Map<String, Object> metrics = new HashMap<>();
        
        metrics.put("storeId", storeId);
        metrics.put("storeName", store.getName());
        metrics.put("isOperational", store.isOperational(LocalDateTime.now()));
        metrics.put("status", store.getStatus());
        metrics.put("deliveryRadius", store.getConfiguration().getDeliveryRadiusKm());
        metrics.put("maxConcurrentOrders", store.getConfiguration().getMaxConcurrentOrders());
        
        return metrics;
    }
}