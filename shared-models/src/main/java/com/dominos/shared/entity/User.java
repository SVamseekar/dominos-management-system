package com.dominos.shared.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.index.Indexed;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.dominos.shared.enums.UserType;
import com.dominos.shared.model.Address;
import com.dominos.shared.model.WorkSchedule;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Document(collection = "users")
public class User {
    
    @Id
    private String id;
    
    @NotNull
    @Field("type")
    @Indexed
    private UserType type;
    
    @NotNull
    @Field("personalInfo")
    private PersonalInfo personalInfo;
    
    @Field("preferences")
    private CustomerPreferences preferences;
    
    @Field("employeeDetails")
    private EmployeeDetails employeeDetails;
    
    @Field("createdAt")
    @Indexed
    private LocalDateTime createdAt = LocalDateTime.now();
    
    @Field("lastLogin")
    private LocalDateTime lastLogin;
    
    @Field("isActive")
    private boolean isActive = true;
    
    // Constructors
    public User() {}
    
    public User(UserType type, PersonalInfo personalInfo) {
        this.type = type;
        this.personalInfo = personalInfo;
    }
    
    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public UserType getType() { return type; }
    public void setType(UserType type) { this.type = type; }
    
    public PersonalInfo getPersonalInfo() { return personalInfo; }
    public void setPersonalInfo(PersonalInfo personalInfo) { this.personalInfo = personalInfo; }
    
    public CustomerPreferences getPreferences() { return preferences; }
    public void setPreferences(CustomerPreferences preferences) { this.preferences = preferences; }
    
    public EmployeeDetails getEmployeeDetails() { return employeeDetails; }
    public void setEmployeeDetails(EmployeeDetails employeeDetails) { this.employeeDetails = employeeDetails; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    
    public LocalDateTime getLastLogin() { return lastLogin; }
    public void setLastLogin(LocalDateTime lastLogin) { this.lastLogin = lastLogin; }
    
    public boolean isActive() { return isActive; }
    public void setActive(boolean active) { isActive = active; }
    
    // Helper methods
    public boolean isEmployee() {
        return type == UserType.STAFF || type == UserType.DRIVER || 
               type == UserType.MANAGER || type == UserType.ASSISTANT_MANAGER;
    }
    
    public boolean canTakeOrders() {
        return type == UserType.MANAGER || type == UserType.ASSISTANT_MANAGER;
    }
    
    // Nested classes
    public static class PersonalInfo {
        @NotNull
        private String name;
        
        @NotNull
        @Email
        @Indexed(unique = true)
        private String email;
        
        @NotNull
        @Pattern(regexp = "^[6-9]\\d{9}$", message = "Invalid Indian phone number")
        @Indexed(unique = true)
        private String phone;
        
        private Address address;
        
        @JsonIgnore
        private String passwordHash;
        
        // Constructors, getters and setters
        public PersonalInfo() {}
        
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        
        public String getPhone() { return phone; }
        public void setPhone(String phone) { this.phone = phone; }
        
        public Address getAddress() { return address; }
        public void setAddress(Address address) { this.address = address; }
        
        public String getPasswordHash() { return passwordHash; }
        public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    }
    
    public static class CustomerPreferences {
        private List<String> favoriteOrders;
        private List<String> paymentMethods;
        private Map<String, Object> dietaryRestrictions;
        
        // Constructors, getters and setters
        public CustomerPreferences() {}
        
        public List<String> getFavoriteOrders() { return favoriteOrders; }
        public void setFavoriteOrders(List<String> favoriteOrders) { this.favoriteOrders = favoriteOrders; }
        
        public List<String> getPaymentMethods() { return paymentMethods; }
        public void setPaymentMethods(List<String> paymentMethods) { this.paymentMethods = paymentMethods; }
        
        public Map<String, Object> getDietaryRestrictions() { return dietaryRestrictions; }
        public void setDietaryRestrictions(Map<String, Object> dietaryRestrictions) { this.dietaryRestrictions = dietaryRestrictions; }
    }
    
    public static class EmployeeDetails {
        @Indexed
        private String storeId;
        private String role;
        private List<String> permissions;
        private WorkSchedule schedule;
        
        // Constructors, getters and setters
        public EmployeeDetails() {}
        
        public String getStoreId() { return storeId; }
        public void setStoreId(String storeId) { this.storeId = storeId; }
        
        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }
        
        public List<String> getPermissions() { return permissions; }
        public void setPermissions(List<String> permissions) { this.permissions = permissions; }
        
        public WorkSchedule getSchedule() { return schedule; }
        public void setSchedule(WorkSchedule schedule) { this.schedule = schedule; }
    }
}