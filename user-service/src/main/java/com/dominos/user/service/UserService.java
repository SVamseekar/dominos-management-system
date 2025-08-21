package com.dominos.user.service;

import com.dominos.shared.entity.User;
import com.dominos.shared.entity.WorkingSession;
import com.dominos.shared.enums.UserType;
import com.dominos.user.dto.LoginRequest;
import com.dominos.user.dto.LoginResponse;
import com.dominos.user.dto.UserCreateRequest;
import com.dominos.user.dto.UserResponse;
import com.dominos.user.repository.UserRepository;
import com.dominos.user.repository.WorkingSessionRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Map;
import java.util.HashMap;
import java.util.stream.Collectors;

@Service
@Transactional
public class UserService {
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private WorkingSessionRepository sessionRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Autowired
    private JwtService jwtService;
    
    @Autowired
    private WorkingSessionService sessionService;
    
    public UserResponse createUser(UserCreateRequest request) {
        validateUserCreation(request);
        
        User user = new User();
        user.setType(request.getType());
        
        User.PersonalInfo personalInfo = new User.PersonalInfo();
        personalInfo.setName(request.getName());
        personalInfo.setEmail(request.getEmail());
        personalInfo.setPhone(request.getPhone());
        personalInfo.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        personalInfo.setAddress(request.getAddress());
        user.setPersonalInfo(personalInfo);
        
        if (user.isEmployee()) {
            User.EmployeeDetails employeeDetails = new User.EmployeeDetails();
            employeeDetails.setStoreId(request.getStoreId());
            employeeDetails.setRole(request.getRole());
            employeeDetails.setPermissions(request.getPermissions());
            employeeDetails.setSchedule(request.getSchedule());
            user.setEmployeeDetails(employeeDetails);
        }
        
        User savedUser = userRepository.save(user);
        return mapToUserResponse(savedUser);
    }
    
    public LoginResponse authenticate(LoginRequest request) {
        User user = userRepository.findByPersonalInfoEmail(request.getEmail())
                .orElseThrow(() -> new RuntimeException("Invalid credentials"));
        
        if (!passwordEncoder.matches(request.getPassword(), user.getPersonalInfo().getPasswordHash())) {
            throw new RuntimeException("Invalid credentials");
        }
        
        if (!user.isActive()) {
            throw new RuntimeException("Account is deactivated");
        }
        
        user.setLastLogin(LocalDateTime.now());
        userRepository.save(user);
        
        String storeId = user.isEmployee() ? user.getEmployeeDetails().getStoreId() : null;
        String accessToken = jwtService.generateAccessToken(user.getId(), user.getType().name(), storeId);
        String refreshToken = jwtService.generateRefreshToken(user.getId());
        
        // Start working session for employees
        if (user.isEmployee()) {
            sessionService.startSession(user.getId(), storeId);
        }
        
        return new LoginResponse(accessToken, refreshToken, mapToUserResponse(user));
    }
    
    public void logout(String userId) {
        User user = getUserById(userId);
        if (user.isEmployee()) {
            sessionService.endSession(userId);
        }
    }
    
    @Cacheable(value = "users", key = "#userId")
    public User getUserById(String userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
    }
    
    public UserResponse getUserResponseById(String userId) {
        return mapToUserResponse(getUserById(userId));
    }
    
    public List<UserResponse> getUsersByType(UserType type) {
        return userRepository.findByType(type).stream()
                .map(this::mapToUserResponse)
                .toList();
    }
    
    public List<UserResponse> getStoreEmployees(String storeId) {
        return userRepository.findByStoreId(storeId).stream()
                .map(this::mapToUserResponse)
                .toList();
    }
    
    public List<UserResponse> getActiveManagers() {
        return userRepository.findActiveManagersAndAssistants(UserType.MANAGER, UserType.ASSISTANT_MANAGER)
                .stream()
                .map(this::mapToUserResponse)
                .toList();
    }
    
    @CacheEvict(value = "users", key = "#userId")
    public UserResponse updateUser(String userId, UserCreateRequest request) {
        User user = getUserById(userId);
        
        user.getPersonalInfo().setName(request.getName());
        user.getPersonalInfo().setPhone(request.getPhone());
        user.getPersonalInfo().setAddress(request.getAddress());
        
        if (request.getPassword() != null && !request.getPassword().isEmpty()) {
            user.getPersonalInfo().setPasswordHash(passwordEncoder.encode(request.getPassword()));
        }
        
        if (user.isEmployee() && request.getStoreId() != null) {
            user.getEmployeeDetails().setStoreId(request.getStoreId());
            user.getEmployeeDetails().setRole(request.getRole());
            user.getEmployeeDetails().setPermissions(request.getPermissions());
            user.getEmployeeDetails().setSchedule(request.getSchedule());
        }
        
        User updatedUser = userRepository.save(user);
        return mapToUserResponse(updatedUser);
    }
    
    @CacheEvict(value = "users", key = "#userId")
    public void deactivateUser(String userId) {
        User user = getUserById(userId);
        user.setActive(false);
        userRepository.save(user);
        
        // End any active working session
        if (user.isEmployee()) {
            sessionService.endSession(userId);
        }
    }
    
    public boolean canUserTakeOrders(String userId) {
        User user = getUserById(userId);
        return user.canTakeOrders();
    }
    
    public String refreshAccessToken(String refreshToken) {
        String userId = jwtService.extractUserId(refreshToken);
        if (jwtService.isTokenExpired(refreshToken)) {
            throw new RuntimeException("Refresh token expired");
        }
        
        User user = getUserById(userId);
        String storeId = user.isEmployee() ? user.getEmployeeDetails().getStoreId() : null;
        return jwtService.generateAccessToken(userId, user.getType().name(), storeId);
    }
    
    public void changePassword(String userId, String currentPassword, String newPassword) {
        User user = getUserById(userId);
        
        if (!passwordEncoder.matches(currentPassword, user.getPersonalInfo().getPasswordHash())) {
            throw new RuntimeException("Current password is incorrect");
        }
        
        user.getPersonalInfo().setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }
    
    public List<UserResponse> searchUsers(String name, String email, String phone, UserType type, String storeId) {
        // This would typically use MongoDB query builders or custom repository methods
        // For simplicity, we'll filter after fetching
        List<User> allUsers = userRepository.findAll();
        
        return allUsers.stream()
                .filter(user -> name == null || user.getPersonalInfo().getName().toLowerCase().contains(name.toLowerCase()))
                .filter(user -> email == null || user.getPersonalInfo().getEmail().toLowerCase().contains(email.toLowerCase()))
                .filter(user -> phone == null || user.getPersonalInfo().getPhone().contains(phone))
                .filter(user -> type == null || user.getType() == type)
                .filter(user -> storeId == null || (user.getEmployeeDetails() != null && storeId.equals(user.getEmployeeDetails().getStoreId())))
                .map(this::mapToUserResponse)
                .toList();
    }
    
    public Map<String, Object> getUserStatistics() {
        List<User> allUsers = userRepository.findAll();
        
        Map<UserType, Long> usersByType = allUsers.stream()
                .collect(Collectors.groupingBy(User::getType, Collectors.counting()));
        
        long activeUsers = allUsers.stream()
                .filter(User::isActive)
                .count();
        
        long inactiveUsers = allUsers.size() - activeUsers;
        
        long recentLogins = allUsers.stream()
                .filter(user -> user.getLastLogin() != null && 
                       user.getLastLogin().isAfter(LocalDateTime.now().minusDays(7)))
                .count();
        
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalUsers", allUsers.size());
        stats.put("activeUsers", activeUsers);
        stats.put("inactiveUsers", inactiveUsers);
        stats.put("recentLogins", recentLogins);
        stats.put("usersByType", usersByType);
        
        return stats;
    }
    
    private void validateUserCreation(UserCreateRequest request) {
        if (userRepository.existsByPersonalInfoEmail(request.getEmail())) {
            throw new RuntimeException("Email already exists");
        }
        
        if (userRepository.existsByPersonalInfoPhone(request.getPhone())) {
            throw new RuntimeException("Phone number already exists");
        }
        
        if (request.getType() != UserType.CUSTOMER && request.getStoreId() == null) {
            throw new RuntimeException("Store ID required for employees");
        }
    }
    
    private UserResponse mapToUserResponse(User user) {
        UserResponse response = new UserResponse();
        response.setId(user.getId());
        response.setType(user.getType());
        response.setName(user.getPersonalInfo().getName());
        response.setEmail(user.getPersonalInfo().getEmail());
        response.setPhone(user.getPersonalInfo().getPhone());
        response.setAddress(user.getPersonalInfo().getAddress());
        response.setCreatedAt(user.getCreatedAt());
        response.setLastLogin(user.getLastLogin());
        response.setActive(user.isActive());
        
        if (user.isEmployee() && user.getEmployeeDetails() != null) {
            response.setStoreId(user.getEmployeeDetails().getStoreId());
            response.setRole(user.getEmployeeDetails().getRole());
            response.setPermissions(user.getEmployeeDetails().getPermissions());
        }
        
        return response;
    }
}