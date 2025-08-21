package com.dominos.user.dto;

public class LoginResponse {
    private String accessToken;
    private String refreshToken;
    private UserResponse user;
    
    public LoginResponse() {}
    
    public LoginResponse(String accessToken, String refreshToken, UserResponse user) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.user = user;
    }
    
    public String getAccessToken() { return accessToken; }
    public void setAccessToken(String accessToken) { this.accessToken = accessToken; }
    
    public String getRefreshToken() { return refreshToken; }
    public void setRefreshToken(String refreshToken) { this.refreshToken = refreshToken; }
    
    public UserResponse getUser() { return user; }
    public void setUser(UserResponse user) { this.user = user; }
}