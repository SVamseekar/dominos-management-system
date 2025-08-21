package com.dominos.user.controller;

import com.dominos.shared.enums.UserType;
import com.dominos.user.dto.*;
import com.dominos.user.service.UserService;

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
@RequestMapping("/api/users")
@Tag(name = "User Management", description = "User registration, authentication, and management")
public class UserController {
    
    @Autowired
    private UserService userService;
    
    @PostMapping("/register")
    @Operation(summary = "Register new user")
    public ResponseEntity<UserResponse> register(@Valid @RequestBody UserCreateRequest request) {
        UserResponse user = userService.createUser(request);
        return ResponseEntity.ok(user);
    }
    
    @PostMapping("/login")
    @Operation(summary = "User login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = userService.authenticate(request);
        return ResponseEntity.ok(response);
    }
    
    @PostMapping("/logout")
    @Operation(summary = "User logout")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<Void> logout(@RequestHeader("X-User-Id") String userId) {
        userService.logout(userId);
        return ResponseEntity.ok().build();
    }
    
    @PostMapping("/refresh")
    @Operation(summary = "Refresh access token")
    public ResponseEntity<Map<String, String>> refreshToken(@RequestBody Map<String, String> request) {
        String refreshToken = request.get("refreshToken");
        String newAccessToken = userService.refreshAccessToken(refreshToken);
        return ResponseEntity.ok(Map.of("accessToken", newAccessToken));
    }
    
    @GetMapping("/{userId}")
    @Operation(summary = "Get user by ID")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<UserResponse> getUser(@PathVariable String userId) {
        UserResponse user = userService.getUserResponseById(userId);
        return ResponseEntity.ok(user);
    }
    
    @PutMapping("/{userId}")
    @Operation(summary = "Update user")
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("#userId == authentication.name or hasRole('MANAGER')")
    public ResponseEntity<UserResponse> updateUser(
            @PathVariable String userId,
            @Valid @RequestBody UserCreateRequest request) {
        UserResponse user = userService.updateUser(userId, request);
        return ResponseEntity.ok(user);
    }
    
    @DeleteMapping("/{userId}")
    @Operation(summary = "Deactivate user")
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<Void> deactivateUser(@PathVariable String userId) {
        userService.deactivateUser(userId);
        return ResponseEntity.ok().build();
    }
    
    @GetMapping("/type/{type}")
    @Operation(summary = "Get users by type")
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<List<UserResponse>> getUsersByType(@PathVariable UserType type) {
        List<UserResponse> users = userService.getUsersByType(type);
        return ResponseEntity.ok(users);
    }
    
    @GetMapping("/store/{storeId}")
    @Operation(summary = "Get store employees")
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<List<UserResponse>> getStoreEmployees(@PathVariable String storeId) {
        List<UserResponse> employees = userService.getStoreEmployees(storeId);
        return ResponseEntity.ok(employees);
    }
    
    @GetMapping("/managers")
    @Operation(summary = "Get active managers")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<List<UserResponse>> getActiveManagers() {
        List<UserResponse> managers = userService.getActiveManagers();
        return ResponseEntity.ok(managers);
    }
    
    @GetMapping("/{userId}/can-take-orders")
    @Operation(summary = "Check if user can take orders")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<Map<String, Boolean>> canTakeOrders(@PathVariable String userId) {
        boolean canTakeOrders = userService.canUserTakeOrders(userId);
        return ResponseEntity.ok(Map.of("canTakeOrders", canTakeOrders));
    }
    
    @GetMapping("/profile")
    @Operation(summary = "Get current user profile")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<UserResponse> getCurrentUserProfile(@RequestHeader("X-User-Id") String userId) {
        UserResponse user = userService.getUserResponseById(userId);
        return ResponseEntity.ok(user);
    }
    
    @PutMapping("/profile")
    @Operation(summary = "Update current user profile")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<UserResponse> updateCurrentUserProfile(
            @RequestHeader("X-User-Id") String userId,
            @Valid @RequestBody UserCreateRequest request) {
        UserResponse user = userService.updateUser(userId, request);
        return ResponseEntity.ok(user);
    }
    
    @PostMapping("/change-password")
    @Operation(summary = "Change user password")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<Map<String, String>> changePassword(
            @RequestHeader("X-User-Id") String userId,
            @RequestBody Map<String, String> request) {
        String currentPassword = request.get("currentPassword");
        String newPassword = request.get("newPassword");
        
        userService.changePassword(userId, currentPassword, newPassword);
        return ResponseEntity.ok(Map.of("message", "Password changed successfully"));
    }
    
    @GetMapping("/search")
    @Operation(summary = "Search users")
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('MANAGER') or hasRole('ASSISTANT_MANAGER')")
    public ResponseEntity<List<UserResponse>> searchUsers(
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String email,
            @RequestParam(required = false) String phone,
            @RequestParam(required = false) UserType type,
            @RequestParam(required = false) String storeId) {
        List<UserResponse> users = userService.searchUsers(name, email, phone, type, storeId);
        return ResponseEntity.ok(users);
    }
    
    @GetMapping("/stats")
    @Operation(summary = "Get user statistics")
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<Map<String, Object>> getUserStats() {
        Map<String, Object> stats = userService.getUserStatistics();
        return ResponseEntity.ok(stats);
    }
}