package com.dominos.user.integration;

import com.dominos.shared.enums.UserType;
import com.dominos.user.dto.LoginRequest;
import com.dominos.user.dto.UserCreateRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureWebMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@Testcontainers
@AutoConfigureWebMvc
class UserServiceIntegrationTest {
    
    @Container
    static MongoDBContainer mongoDBContainer = new MongoDBContainer("mongo:7.0")
            .withExposedPorts(27017);
    
    @Autowired
    private WebApplicationContext context;
    
    @Autowired
    private ObjectMapper objectMapper;
    
    private MockMvc mockMvc;
    
    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.mongodb.uri", mongoDBContainer::getReplicaSetUrl);
        registry.add("spring.data.redis.host", () -> "localhost");
        registry.add("spring.data.redis.port", () -> "6379");
    }
    
    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
    }
    
    @Test
    void testUserRegistrationAndLogin() throws Exception {
        // Create user request
        UserCreateRequest createRequest = new UserCreateRequest();
        createRequest.setType(UserType.CUSTOMER);
        createRequest.setName("Integration Test User");
        createRequest.setEmail("integration@test.com");
        createRequest.setPhone("9876543210");
        createRequest.setPassword("password123");
        
        // Register user
        mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Integration Test User"))
                .andExpect(jsonPath("$.email").value("integration@test.com"))
                .andExpect(jsonPath("$.type").value("CUSTOMER"));
        
        // Login with created user
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("integration@test.com");
        loginRequest.setPassword("password123");
        
        mockMvc.perform(post("/api/users/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").exists())
                .andExpect(jsonPath("$.refreshToken").exists())
                .andExpect(jsonPath("$.user.email").value("integration@test.com"));
    }
    
    @Test
    void testEmployeeRegistration() throws Exception {
        // Create employee request
        UserCreateRequest createRequest = new UserCreateRequest();
        createRequest.setType(UserType.STAFF);
        createRequest.setName("Staff Member");
        createRequest.setEmail("staff@test.com");
        createRequest.setPhone("9876543211");
        createRequest.setPassword("password123");
        createRequest.setStoreId("store001");
        createRequest.setRole("Kitchen Staff");
        
        // Register employee
        mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Staff Member"))
                .andExpect(jsonPath("$.type").value("STAFF"))
                .andExpect(jsonPath("$.storeId").value("store001"))
                .andExpect(jsonPath("$.role").value("Kitchen Staff"));
    }
    
    @Test
    void testManagerRegistrationAndOrderPermissions() throws Exception {
        // Create manager request
        UserCreateRequest managerRequest = new UserCreateRequest();
        managerRequest.setType(UserType.MANAGER);
        managerRequest.setName("Store Manager");
        managerRequest.setEmail("manager@test.com");
        managerRequest.setPhone("9876543212");
        managerRequest.setPassword("password123");
        managerRequest.setStoreId("store001");
        managerRequest.setRole("Store Manager");
        
        // Register manager
        MvcResult registerResult = mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(managerRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("MANAGER"))
                .andReturn();
        
        // Extract user ID from response
        String responseContent = registerResult.getResponse().getContentAsString();
        JsonNode userResponse = objectMapper.readTree(responseContent);
        String userId = userResponse.get("id").asText();
        
        // Test order taking permissions
        mockMvc.perform(get("/api/users/" + userId + "/can-take-orders"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canTakeOrders").value(true));
    }
    
    @Test
    void testWorkingSessionFlow() throws Exception {
        // First register an employee
        UserCreateRequest employeeRequest = new UserCreateRequest();
        employeeRequest.setType(UserType.STAFF);
        employeeRequest.setName("Test Employee");
        employeeRequest.setEmail("employee@test.com");
        employeeRequest.setPhone("9876543213");
        employeeRequest.setPassword("password123");
        employeeRequest.setStoreId("store001");
        employeeRequest.setRole("Staff");
        
        mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(employeeRequest)))
                .andExpect(status().isOk());
        
        // Login to get tokens and user ID
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("employee@test.com");
        loginRequest.setPassword("password123");
        
        MvcResult loginResult = mockMvc.perform(post("/api/users/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andReturn();
        
        String loginResponse = loginResult.getResponse().getContentAsString();
        JsonNode loginData = objectMapper.readTree(loginResponse);
        String accessToken = loginData.get("accessToken").asText();
        String userId = loginData.get("user").get("id").asText();
        
        // Test getting current session (should exist due to automatic session start on login)
        mockMvc.perform(get("/api/users/sessions/current")
                .header("Authorization", "Bearer " + accessToken)
                .header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employeeId").value(userId))
                .andExpect(jsonPath("$.isActive").value(true));
        
        // Test adding break time
        Map<String, Long> breakRequest = Map.of("breakMinutes", 30L);
        mockMvc.perform(post("/api/users/sessions/" + userId + "/break")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(breakRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.breakDurationMinutes").value(30));
        
        // Test ending session
        mockMvc.perform(post("/api/users/sessions/end")
                .header("Authorization", "Bearer " + accessToken)
                .header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isActive").value(false))
                .andExpect(jsonPath("$.totalHours").exists());
    }
    
    @Test
    void testDuplicateEmailRegistration() throws Exception {
        // Create first user
        UserCreateRequest createRequest = new UserCreateRequest();
        createRequest.setType(UserType.CUSTOMER);
        createRequest.setName("First User");
        createRequest.setEmail("duplicate@test.com");
        createRequest.setPhone("9876543214");
        createRequest.setPassword("password123");
        
        mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isOk());
        
        // Try to create second user with same email
        createRequest.setName("Second User");
        createRequest.setPhone("9876543215");
        
        mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().is5xxServerError());
    }
    
    @Test
    void testInvalidLogin() throws Exception {
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("nonexistent@test.com");
        loginRequest.setPassword("wrongpassword");
        
        mockMvc.perform(post("/api/users/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().is5xxServerError());
    }
    
    @Test
    void testPasswordChange() throws Exception {
        // Register user
        UserCreateRequest createRequest = new UserCreateRequest();
        createRequest.setType(UserType.CUSTOMER);
        createRequest.setName("Password Test User");
        createRequest.setEmail("password@test.com");
        createRequest.setPhone("9876543216");
        createRequest.setPassword("oldpassword123");
        
        mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isOk());
        
        // Login
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("password@test.com");
        loginRequest.setPassword("oldpassword123");
        
        MvcResult loginResult = mockMvc.perform(post("/api/users/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andReturn();
        
        String loginResponse = loginResult.getResponse().getContentAsString();
        JsonNode loginData = objectMapper.readTree(loginResponse);
        String accessToken = loginData.get("accessToken").asText();
        String userId = loginData.get("user").get("id").asText();
        
        // Change password
        Map<String, String> passwordRequest = Map.of(
            "currentPassword", "oldpassword123",
            "newPassword", "newpassword123"
        );
        
        mockMvc.perform(post("/api/users/change-password")
                .header("Authorization", "Bearer " + accessToken)
                .header("X-User-Id", userId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(passwordRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Password changed successfully"));
        
        // Test login with new password
        loginRequest.setPassword("newpassword123");
        mockMvc.perform(post("/api/users/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk());
    }
    
    @Test
    void testUserProfileOperations() throws Exception {
        // Register and login user
        UserCreateRequest createRequest = new UserCreateRequest();
        createRequest.setType(UserType.CUSTOMER);
        createRequest.setName("Profile Test User");
        createRequest.setEmail("profile@test.com");
        createRequest.setPhone("9876543217");
        createRequest.setPassword("password123");
        
        mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isOk());
        
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("profile@test.com");
        loginRequest.setPassword("password123");
        
        MvcResult loginResult = mockMvc.perform(post("/api/users/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andReturn();
        
        String loginResponse = loginResult.getResponse().getContentAsString();
        JsonNode loginData = objectMapper.readTree(loginResponse);
        String accessToken = loginData.get("accessToken").asText();
        String userId = loginData.get("user").get("id").asText();
        
        // Get profile
        mockMvc.perform(get("/api/users/profile")
                .header("Authorization", "Bearer " + accessToken)
                .header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Profile Test User"))
                .andExpect(jsonPath("$.email").value("profile@test.com"));
        
        // Update profile
        createRequest.setName("Updated Profile User");
        createRequest.setPassword(null); // Don't change password
        
        mockMvc.perform(put("/api/users/profile")
                .header("Authorization", "Bearer " + accessToken)
                .header("X-User-Id", userId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Updated Profile User"));
    }
    
    @Test
    void testTokenRefresh() throws Exception {
        // Register and login user
        UserCreateRequest createRequest = new UserCreateRequest();
        createRequest.setType(UserType.CUSTOMER);
        createRequest.setName("Refresh Test User");
        createRequest.setEmail("refresh@test.com");
        createRequest.setPhone("9876543218");
        createRequest.setPassword("password123");
        
        mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isOk());
        
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("refresh@test.com");
        loginRequest.setPassword("password123");
        
        MvcResult loginResult = mockMvc.perform(post("/api/users/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andReturn();
        
        String loginResponse = loginResult.getResponse().getContentAsString();
        JsonNode loginData = objectMapper.readTree(loginResponse);
        String refreshToken = loginData.get("refreshToken").asText();
        
        // Test token refresh
        Map<String, String> refreshRequest = Map.of("refreshToken", refreshToken);
        
        mockMvc.perform(post("/api/users/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(refreshRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").exists());
    }
}