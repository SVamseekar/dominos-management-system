package com.dominos.shared.model;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public class Address {
    @NotNull
    private String street;
    
    @NotNull
    private String city;
    
    @NotNull
    private String state;
    
    @NotNull
    @Pattern(regexp = "^[1-9][0-9]{5}$", message = "Invalid Indian PIN code")
    private String pincode;
    
    private String landmark;
    private Double latitude;
    private Double longitude;
    
    public Address() {}
    
    // Getters and Setters
    public String getStreet() { return street; }
    public void setStreet(String street) { this.street = street; }
    
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    
    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }
    
    public String getLandmark() { return landmark; }
    public void setLandmark(String landmark) { this.landmark = landmark; }
    
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
}