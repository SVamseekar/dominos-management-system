package com.dominos.user.dto;

import com.dominos.shared.enums.UserType;
import com.dominos.shared.model.Address;
import com.dominos.shared.model.WorkSchedule;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

public class UserCreateRequest {
    @NotNull
    private UserType type;
    
    @NotNull
    @Size(min = 2, max = 100)
    private String name;
    
    @NotNull
    @Email
    private String email;
    
    @NotNull
    @Pattern(regexp = "^[6-9]\\d{9}$", message = "Invalid Indian phone number")
    private String phone;
    
    @NotNull
    @Size(min = 6, max = 50)
    private String password;
    
    private Address address;
    private String storeId;
    private String role;
    private List<String> permissions;
    private WorkSchedule schedule;
    
    public UserCreateRequest() {}
    
    public UserType getType() { return type; }
    public void setType(UserType type) { this.type = type; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    
    public Address getAddress() { return address; }
    public void setAddress(Address address) { this.address = address; }
    
    public String getStoreId() { return storeId; }
    public void setStoreId(String storeId) { this.storeId = storeId; }
    
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    
    public List<String> getPermissions() { return permissions; }
    public void setPermissions(List<String> permissions) { this.permissions = permissions; }
    
    public WorkSchedule getSchedule() { return schedule; }
    public void setSchedule(WorkSchedule schedule) { this.schedule = schedule; }
}