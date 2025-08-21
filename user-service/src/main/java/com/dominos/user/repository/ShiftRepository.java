package com.dominos.user.repository;

import com.dominos.shared.entity.Shift;
import com.dominos.shared.enums.ShiftStatus;
import com.dominos.shared.enums.ShiftType;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ShiftRepository extends MongoRepository<Shift, String> {
    
    @Query("{'employeeId': ?0, 'scheduledStart': {$lte: ?1}, 'scheduledEnd': {$gte: ?1}, 'status': {$in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS']}}")
    Optional<Shift> findCurrentShiftForEmployee(String employeeId, LocalDateTime dateTime);
    
    List<Shift> findByEmployeeIdAndScheduledStartBetween(String employeeId, LocalDateTime start, LocalDateTime end);
    
    List<Shift> findByStoreIdAndScheduledStartBetween(String storeId, LocalDateTime start, LocalDateTime end);
    
    @Query("{'storeId': ?0, 'scheduledStart': {$gte: ?1, $lte: ?2}, 'status': ?3}")
    List<Shift> findByStoreAndDateRangeAndStatus(String storeId, LocalDateTime start, LocalDateTime end, ShiftStatus status);
    
    @Query("{'employeeId': ?0, 'status': 'IN_PROGRESS'}")
    Optional<Shift> findActiveShiftByEmployee(String employeeId);
    
    List<Shift> findByTypeAndStoreIdAndScheduledStartBetween(ShiftType type, String storeId, LocalDateTime start, LocalDateTime end);
    
    @Query("{'storeId': ?0, 'scheduledStart': {$gte: ?1, $lt: ?2}}")
    List<Shift> findTodayShiftsByStore(String storeId, LocalDateTime startOfDay, LocalDateTime endOfDay);
    
    long countByEmployeeIdAndStatusAndScheduledStartBetween(String employeeId, ShiftStatus status, LocalDateTime start, LocalDateTime end);
}