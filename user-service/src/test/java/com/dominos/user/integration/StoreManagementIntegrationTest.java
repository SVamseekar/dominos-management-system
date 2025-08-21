package com.dominos.user.integration;

import com.dominos.shared.entity.Store;
import com.dominos.shared.enums.StoreStatus;
import com.dominos.shared.model.Address;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureWebMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@Testcontainers
@AutoConfigureWebMvc
class StoreManagementIntegrationTest {
    
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
    void testStoreCreationAndRetrieval() throws Exception {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
        
        // Create store
        Store store = createTestStore();
        
        mockMvc.perform(post("/api/stores")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(store))
                .header("Authorization", "Bearer test-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Test Store"))
                .andExpect(jsonPath("$.code").value("TST001"));
        
        // Retrieve store by code
        mockMvc.perform(get("/api/stores/code/TST001")
                .header("Authorization", "Bearer test-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Test Store"));
    }
    
    @Test
    void testStoreOperationalStatus() throws Exception {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
        
        // Test with stored sample data
        mockMvc.perform(get("/api/stores/DOM001/operational-status")
                .header("Authorization", "Bearer test-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isOperational").exists());
    }
    
    private Store createTestStore() {
        Store store = new Store();
        store.setName("Test Store");
        store.setCode("TST001");
        store.setStatus(StoreStatus.ACTIVE);
        store.setPhoneNumber("9876543212");
        
        Address address = new Address();
        address.setStreet("Test Street");
        address.setCity("Test City");
        address.setState("Test State");
        address.setPincode("123456");
        address.setLatitude(17.4126);
        address.setLongitude(78.4482);
        store.setAddress(address);
        
        return store;
    }
}