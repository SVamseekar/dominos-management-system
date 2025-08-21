package com.dominos.shared.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.index.Indexed;
import com.dominos.shared.model.Address;
import com.dominos.shared.enums.StoreStatus;
import com.dominos.shared.model.TimeSlot;
import com.dominos.shared.model.SpecialHours;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDateTime;
import java.time.DayOfWeek;
import java.util.Map;
import java.util.List;

@Document(collection = "stores")
public class Store {
    
    @Id
    private String id;
    
    @NotNull
    @Field("name")
    private String name;
    
    @NotNull
    @Field("code")
    @Indexed(unique = true)
    @Pattern(regexp = "^DOM\\d{3}$", message = "Store code must be format DOM001")
    private String code;
    
    @NotNull
    @Field("address")
    private Address address;
    
    @NotNull
    @Field("phoneNumber")
    @Pattern(regexp = "^[6-9]\\d{9}$", message = "Invalid Indian phone number")
    private String phoneNumber;
    
    @Field("regionId")
    @Indexed
    private String regionId;
    
    @Field("areaManagerId")
    @Indexed
    private String areaManagerId;
    
    @Field("status")
    @Indexed
    private StoreStatus status = StoreStatus.ACTIVE;
    
    @Field("operatingHours")
    private OperatingHours operatingHours;
    
    @Field("configuration")
    private StoreConfiguration configuration;
    
    @Field("openingDate")
    private LocalDateTime openingDate;
    
    @Field("createdAt")
    private LocalDateTime createdAt = LocalDateTime.now();
    
    @Field("lastModified")
    private LocalDateTime lastModified = LocalDateTime.now();
    
    // Constructors
    public Store() {}
    
    public Store(String name, String code, Address address, String phoneNumber) {
        this.name = name;
        this.code = code;
        this.address = address;
        this.phoneNumber = phoneNumber;
        this.configuration = new StoreConfiguration();
        this.operatingHours = new OperatingHours();
    }
    
    // Business Logic Methods
    public boolean isOperational(LocalDateTime dateTime) {
        if (status != StoreStatus.ACTIVE) {
            return false;
        }
        
        if (operatingHours == null) {
            return true;
        }
        
        return operatingHours.isOpenAt(dateTime);
    }
    
    public boolean isWithinDeliveryRadius(double latitude, double longitude) {
        if (configuration == null || address == null) {
            return false;
        }
        
        double distance = calculateDistance(
            address.getLatitude(), address.getLongitude(),
            latitude, longitude
        );
        
        return distance <= configuration.getDeliveryRadiusKm();
    }
    
    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371;
        
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c;
    }
    
    // Getters and Setters (add all standard getters/setters)
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    
    public Address getAddress() { return address; }
    public void setAddress(Address address) { this.address = address; }
    
    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
    
    public String getRegionId() { return regionId; }
    public void setRegionId(String regionId) { this.regionId = regionId; }
    
    public String getAreaManagerId() { return areaManagerId; }
    public void setAreaManagerId(String areaManagerId) { this.areaManagerId = areaManagerId; }
    
    public StoreStatus getStatus() { return status; }
    public void setStatus(StoreStatus status) { this.status = status; }
    
    public OperatingHours getOperatingHours() { return operatingHours; }
    public void setOperatingHours(OperatingHours operatingHours) { this.operatingHours = operatingHours; }
    
    public StoreConfiguration getConfiguration() { return configuration; }
    public void setConfiguration(StoreConfiguration configuration) { this.configuration = configuration; }
    
    public LocalDateTime getOpeningDate() { return openingDate; }
    public void setOpeningDate(LocalDateTime openingDate) { this.openingDate = openingDate; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    
    public LocalDateTime getLastModified() { return lastModified; }
    public void setLastModified(LocalDateTime lastModified) { this.lastModified = lastModified; }
    
    // Nested Classes
    public static class OperatingHours {
        private Map<DayOfWeek, TimeSlot> weeklySchedule;
        private List<SpecialHours> specialHours;
        
        public boolean isOpenAt(LocalDateTime dateTime) {
            DayOfWeek day = dateTime.getDayOfWeek();
            
            if (specialHours != null) {
                for (SpecialHours special : specialHours) {
                    if (special.appliesTo(dateTime.toLocalDate())) {
                        return special.isOpenAt(dateTime.toLocalTime());
                    }
                }
            }
            
            if (weeklySchedule != null && weeklySchedule.containsKey(day)) {
                TimeSlot timeSlot = weeklySchedule.get(day);
                return timeSlot.isWithin(dateTime.toLocalTime());
            }
            
            return false;
        }
        
        public Map<DayOfWeek, TimeSlot> getWeeklySchedule() { return weeklySchedule; }
        public void setWeeklySchedule(Map<DayOfWeek, TimeSlot> weeklySchedule) { this.weeklySchedule = weeklySchedule; }
        
        public List<SpecialHours> getSpecialHours() { return specialHours; }
        public void setSpecialHours(List<SpecialHours> specialHours) { this.specialHours = specialHours; }
    }
    
    public static class StoreConfiguration {
        private double deliveryRadiusKm = 5.0;
        private int maxConcurrentOrders = 50;
        private int estimatedPrepTimeMinutes = 25;
        private boolean acceptsOnlineOrders = true;
        private boolean acceptsCashPayments = true;
        private int maxDeliveryTimeMinutes = 30;
        private double minimumOrderValueINR = 99.0;
        
        public double getDeliveryRadiusKm() { return deliveryRadiusKm; }
        public void setDeliveryRadiusKm(double deliveryRadiusKm) { this.deliveryRadiusKm = deliveryRadiusKm; }
        
        public int getMaxConcurrentOrders() { return maxConcurrentOrders; }
        public void setMaxConcurrentOrders(int maxConcurrentOrders) { this.maxConcurrentOrders = maxConcurrentOrders; }
        
        public int getEstimatedPrepTimeMinutes() { return estimatedPrepTimeMinutes; }
        public void setEstimatedPrepTimeMinutes(int estimatedPrepTimeMinutes) { this.estimatedPrepTimeMinutes = estimatedPrepTimeMinutes; }
        
        public boolean isAcceptsOnlineOrders() { return acceptsOnlineOrders; }
        public void setAcceptsOnlineOrders(boolean acceptsOnlineOrders) { this.acceptsOnlineOrders = acceptsOnlineOrders; }
        
        public boolean isAcceptsCashPayments() { return acceptsCashPayments; }
        public void setAcceptsCashPayments(boolean acceptsCashPayments) { this.acceptsCashPayments = acceptsCashPayments; }
        
        public int getMaxDeliveryTimeMinutes() { return maxDeliveryTimeMinutes; }
        public void setMaxDeliveryTimeMinutes(int maxDeliveryTimeMinutes) { this.maxDeliveryTimeMinutes = maxDeliveryTimeMinutes; }
        
        public double getMinimumOrderValueINR() { return minimumOrderValueINR; }
        public void setMinimumOrderValueINR(double minimumOrderValueINR) { this.minimumOrderValueINR = minimumOrderValueINR; }
    }
}