package com.dominos.user.repository;

import com.dominos.shared.entity.User;
import com.dominos.shared.enums.UserType;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends MongoRepository<User, String> {
    
    Optional<User> findByPersonalInfoEmail(String email);
    
    Optional<User> findByPersonalInfoPhone(String phone);
    
    boolean existsByPersonalInfoEmail(String email);
    
    boolean existsByPersonalInfoPhone(String phone);
    
    List<User> findByType(UserType type);
    
    List<User> findByTypeAndIsActive(UserType type, boolean isActive);
    
    @Query("{'employeeDetails.storeId': ?0}")
    List<User> findByStoreId(String storeId);
    
    @Query("{'employeeDetails.storeId': ?0, 'type': ?1}")
    List<User> findByStoreIdAndType(String storeId, UserType type);
    
    @Query("{'employeeDetails.storeId': ?0, 'type': {$in: ?1}}")
    List<User> findByStoreIdAndTypeIn(String storeId, List<UserType> types);
    
    @Query("{'type': {$in: [?0, ?1]}, 'isActive': true}")
    List<User> findActiveManagersAndAssistants(UserType manager, UserType assistantManager);
    
    @Query("{'lastLogin': {$gte: ?0}}")
    List<User> findUsersLoggedInAfter(LocalDateTime dateTime);
    
    @Query("{'type': {$ne: 'CUSTOMER'}, 'isActive': true}")
    List<User> findAllActiveEmployees();
}