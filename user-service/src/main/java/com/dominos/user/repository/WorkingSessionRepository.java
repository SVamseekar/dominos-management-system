package com.dominos.user.repository;

import com.dominos.shared.entity.WorkingSession;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface WorkingSessionRepository extends MongoRepository<WorkingSession, String> {
    
    Optional<WorkingSession> findByEmployeeIdAndIsActive(String employeeId, boolean isActive);
    
    List<WorkingSession> findByEmployeeIdAndDateBetween(String employeeId, LocalDate startDate, LocalDate endDate);
    
    List<WorkingSession> findByStoreIdAndDateBetween(String storeId, LocalDate startDate, LocalDate endDate);
    
    @Query("{'employeeId': ?0, 'date': ?1}")
    List<WorkingSession> findByEmployeeIdAndDate(String employeeId, LocalDate date);
    
    @Query("{'storeId': ?0, 'date': ?1, 'isActive': false}")
    List<WorkingSession> findCompletedSessionsByStoreAndDate(String storeId, LocalDate date);
    
    @Query("{'employeeId': ?0, 'isActive': true}")
    Optional<WorkingSession> findActiveSessionByEmployeeId(String employeeId);
    
    @Query("{'storeId': ?0, 'isActive': true}")
    List<WorkingSession> findActiveSessionsByStoreId(String storeId);
    
    @Query("{'date': {$gte: ?0, $lte: ?1}, 'totalHours': {$ne: null}}")
    List<WorkingSession> findSessionsInDateRange(LocalDate startDate, LocalDate endDate);
    
    @Query("{'employeeId': ?0, 'loginTime': {$gte: ?1, $lt: ?2}}")
    List<WorkingSession> findByEmployeeIdAndLoginTimeBetween(String employeeId, LocalDateTime start, LocalDateTime end);
    
    @Query(value = "{'employeeId': ?0, 'totalHours': {$ne: null}}", 
           sort = "{'date': -1}")
    List<WorkingSession> findRecentCompletedSessions(String employeeId);

    // Add these methods to existing WorkingSessionRepository

    @Query("{'employeeId': ?0}")
    List<WorkingSession> findAllActiveSessionsByEmployeeId(String employeeId);

    @Query("{'employeeId': ?0, 'loginTime': {$gte: ?1, $lt: ?2}, 'logoutTime': {$ne: null}}")
    Optional<WorkingSession> findLastCompletedSession(String employeeId, LocalDate date);

    @Query("{'employeeId': ?0, 'loginTime': {$lt: ?2}, 'logoutTime': {$gt: ?1}}")
    List<WorkingSession> findConflictingSessions(String employeeId, LocalDateTime startTime, LocalDateTime endTime);

    @Query("{'status': 'PENDING_APPROVAL'}")
    List<WorkingSession> findSessionsPendingApproval();

    @Query("{'storeId': ?0, 'status': 'PENDING_APPROVAL'}")
    List<WorkingSession> findStorSessionsPendingApproval(String storeId);

    @Query("{'employeeId': ?0, 'violations': {$exists: true, $ne: []}}")
    List<WorkingSession> findSessionsWithViolations(String employeeId);
    
}
