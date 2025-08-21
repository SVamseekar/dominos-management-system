package com.dominos.user.repository;

import com.dominos.shared.entity.Store;
import com.dominos.shared.enums.StoreStatus;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface StoreRepository extends MongoRepository<Store, String> {
    
    Optional<Store> findByCode(String code);
    
    List<Store> findByStatus(StoreStatus status);
    
    List<Store> findByRegionId(String regionId);
    
    List<Store> findByAreaManagerId(String areaManagerId);
    
    @Query("{'address.city': ?0, 'status': 'ACTIVE'}")
    List<Store> findActivStoresByCity(String city);
    
    @Query("{'status': 'ACTIVE', 'configuration.acceptsOnlineOrders': true}")
    List<Store> findOnlineOrderEnabledStores();
    
    boolean existsByCode(String code);
}