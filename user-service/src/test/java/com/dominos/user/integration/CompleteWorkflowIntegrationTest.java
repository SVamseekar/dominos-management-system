package com.dominos.user.integration;

import com.dominos.shared.entity.Store;
import com.dominos.shared.entity.Shift;
import com.dominos.shared.enums.UserType;
import com.dominos.shared.enums.StoreStatus;
import com.dominos.shared.enums.ShiftType;
import com.dominos.user.dto.UserCreateRequest;
import com.dominos.user.dto.LoginRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

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

import java.time.LocalDateTime;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@Testcontainers
@AutoConfigureWebMvc
class CompleteWorkflowIntegrationTest {
    
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
    }
    
    @Test
    void testCompleteManagerWorkflow() throws Exception {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
        
        // Step 1: Create a store
        Store store = createTestStore();
        mockMvc.perform(post("/api/stores")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(store)))
                .andExpect(status().isOk());
        
        // Step 2: Create a manager for the store
        UserCreateRequest managerRequest = createManagerRequest("TST001");
        MvcResult managerResult = mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(managerRequest)))
                .andExpect(status().isOk())
                .andReturn();
        
        JsonNode managerResponse = objectMapper.readTree(managerResult.getResponse().getContentAsString());
        String managerId = managerResponse.get("id").asText();
        
        // Step 3: Manager login
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("manager@test.com");
        loginRequest.setPassword("password123");
        
        MvcResult loginResult = mockMvc.perform(post("/api/users/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andReturn();
        
        JsonNode loginData = objectMapper.readTree(loginResult.getResponse().getContentAsString());
        String accessToken = loginData.get("accessToken").asText();
        
        // Step 4: Verify access control
        mockMvc.perform(post("/api/stores/TST001/access-check")
                .header("Authorization", "Bearer " + accessToken)
                .header("X-User-Id", managerId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allowed").value(true));
        
        // Step 5: Create a shift for an employee
        Shift shift = createTestShift("TST001", managerId);
        mockMvc.perform(post("/api/shifts")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(shift)))
                .andExpect(status().isOk());
        
        // Step 6: Check store operational status
        mockMvc.perform(get("/api/stores/TST001/operational-status")
                .header("Authorization", "Bearer " + accessToken))
                .andExpected(status().isOk())
                .andExpect(jsonPath("$.isOperational").value(true));
    }
    
    @Test
    void testSessionWorkflowWithValidation() throws Exception {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
        
        // Create employee and login
        UserCreateRequest employeeRequest = createEmployeeRequest("DOM001");
        mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(employeeRequest)))
                .andExpect(status().isOk());
        
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("employee@test.com");
        loginRequest.setPassword("password123");
        
        MvcResult loginResult = mockMvc.perform(post("/api/users/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andReturn();
        
        JsonNode loginData = objectMapper.readTree(loginResult.getResponse().getContentAsString());
        String accessToken = loginData.get("accessToken").asText();
        String employeeId = loginData.get("user").get("id").asText();
        
        // Test session with location
        Map<String, Object> locationData = Map.of(
            "latitude", 17.4126,
            "longitude", 78.4482
        );
        
        mockMvc.perform(post("/api/users/sessions/start-with-location")
                .header("Authorization", "Bearer " + accessToken)
                .header("X-User-Id", employeeId)
                .header("X-Store-Id", "DOM001")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(locationData)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employeeId").value(employeeId))
                .andExpect(jsonPath("$.isActive").value(true));
        
        // Add break time
        Map<String, Long> breakRequest = Map.of("breakMinutes", 30L);
        mockMvc.perform(post("/api/users/sessions/" + employeeId + "/break")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(breakRequest)))
                .andExpect(status().isOk());
        
        // End session with location
        mockMvc.perform(post("/api/users/sessions/end-with-location")
                .header("Authorization", "Bearer " + accessToken)
                .header("X-User-Id", employeeId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(locationData)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isActive").value(false));
    }
    
    private Store createTestStore() {
        Store store = new Store();
        store.setName("Test Store");
        store.setCode("TST001");
        store.setStatus(StoreStatus.ACTIVE);
        store.setPhoneNumber("9876543212");
        return store;
    }
    
    private UserCreateRequest createManagerRequest(String storeId) {
        UserCreateRequest request = new UserCreateRequest();
        request.setType(UserType.MANAGER);
        request.setName("Test Manager");
        request.setEmail("manager@test.com");
        request.setPhone("9876543213");
        request.setPassword("password123");
        request.setStoreId(storeId);
        request.setRole("Store Manager");
        return request;
    }
    
    private UserCreateRequest createEmployeeRequest(String storeId) {
        UserCreateRequest request = new UserCreateRequest();
        request.setType(UserType.STAFF);
        request.setName("Test Employee");
        request.setEmail("employee@test.com");
        request.setPhone("9876543214");
        request.setPassword("password123");
        request.setStoreId(storeId);
        request.setRole("Kitchen Staff");
        return request;
    }
    
    private Shift createTestShift(String storeId, String employeeId) {
        Shift shift = new Shift();
        shift.setStoreId(storeId);
        shift.setEmployeeId(employeeId);
        shift.setType(ShiftType.REGULAR);
        shift.setScheduledStart(LocalDateTime.now().plusHours(1));
        shift.setScheduledEnd(LocalDateTime.now().plusHours(9));
        shift.setRoleRequired("Manager");
        return shift;
    }
}