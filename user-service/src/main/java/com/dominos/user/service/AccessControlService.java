package com.dominos.user.service;

import com.dominos.shared.entity.User;
import com.dominos.shared.enums.UserType;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class AccessControlService {
    
    @Autowired
    private UserService userService;
    
    public OrderTakingPermission validateOrderTakingAccess(String userId, String storeId) {
        try {
            User user = userService.getUserById(userId);
            
            // Basic role check
            if (!user.canTakeOrders()) {
                return OrderTakingPermission.denied("Insufficient role permissions. Only managers and assistant managers can take orders.");
            }
            
            // Account status check
            if (!user.isActive()) {
                return OrderTakingPermission.denied("User account is deactivated");
            }
            
            // Store assignment check for employees
            if (user.isEmployee()) {
                if (user.getEmployeeDetails() == null || 
                    !user.getEmployeeDetails().getStoreId().equals(storeId)) {
                    return OrderTakingPermission.denied("Not assigned to this store");
                }
            }
            
            return OrderTakingPermission.allowed("Access granted");
            
        } catch (Exception e) {
            return OrderTakingPermission.denied("Access validation failed: " + e.getMessage());
        }
    }
    
    public boolean canAccessStore(String userId, String storeId) {
        try {
            User user = userService.getUserById(userId);
            
            if (!user.isEmployee()) {
                return false;
            }
            
            return user.getEmployeeDetails().getStoreId().equals(storeId);
        } catch (Exception e) {
            return false;
        }
    }
    
    public boolean canManageEmployees(String userId) {
        try {
            User user = userService.getUserById(userId);
            return user.getType() == UserType.MANAGER || user.getType() == UserType.ASSISTANT_MANAGER;
        } catch (Exception e) {
            return false;
        }
    }
    
    public static class OrderTakingPermission {
        private final boolean allowed;
        private final String reason;
        private final LocalDateTime checkedAt;
        
        private OrderTakingPermission(boolean allowed, String reason) {
            this.allowed = allowed;
            this.reason = reason;
            this.checkedAt = LocalDateTime.now();
        }
        
        public static OrderTakingPermission allowed(String reason) {
            return new OrderTakingPermission(true, reason);
        }
        
        public static OrderTakingPermission denied(String reason) {
            return new OrderTakingPermission(false, reason);
        }
        
        public boolean isAllowed() { return allowed; }
        public String getReason() { return reason; }
        public LocalDateTime getCheckedAt() { return checkedAt; }
    }
}