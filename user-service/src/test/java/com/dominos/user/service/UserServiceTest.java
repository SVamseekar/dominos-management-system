package com.dominos.user.service;

import com.dominos.shared.entity.User;
import com.dominos.shared.enums.UserType;
import com.dominos.user.dto.LoginRequest;
import com.dominos.user.dto.LoginResponse;
import com.dominos.user.dto.UserCreateRequest;
import com.dominos.user.dto.UserResponse;
import com.dominos.user.repository.UserRepository;
import com.dominos.user.repository.WorkingSessionRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    
    @Mock
    private UserRepository userRepository;
    
    @Mock
    private WorkingSessionRepository sessionRepository;
    
    @Mock
    private PasswordEncoder passwordEncoder;
    
    @Mock
    private JwtService jwtService;
    
    @Mock
    private WorkingSessionService sessionService;
    
    @InjectMocks
    private UserService userService;
    
    private UserCreateRequest userCreateRequest;
    private User testUser;
    
    @BeforeEach
    void setUp() {
        userCreateRequest = new UserCreateRequest();
        userCreateRequest.setType(UserType.CUSTOMER);
        userCreateRequest.setName("Test User");
        userCreateRequest.setEmail("test@example.com");
        userCreateRequest.setPhone("9876543210");
        userCreateRequest.setPassword("password123");
        
        testUser = new User();
        testUser.setId("user123");
        testUser.setType(UserType.CUSTOMER);
        testUser.setCreatedAt(LocalDateTime.now());
        testUser.setActive(true);
        
        User.PersonalInfo personalInfo = new User.PersonalInfo();
        personalInfo.setName("Test User");
        personalInfo.setEmail("test@example.com");
        personalInfo.setPhone("9876543210");
        personalInfo.setPasswordHash("hashedPassword");
        testUser.setPersonalInfo(personalInfo);
    }
    
    @Test
    void createUser_ShouldCreateCustomerSuccessfully() {
        // Arrange
        when(userRepository.existsByPersonalInfoEmail(anyString())).thenReturn(false);
        when(userRepository.existsByPersonalInfoPhone(anyString())).thenReturn(false);
        when(passwordEncoder.encode(anyString())).thenReturn("hashedPassword");
        when(userRepository.save(any(User.class))).thenReturn(testUser);
        
        // Act
        UserResponse result = userService.createUser(userCreateRequest);
        
        // Assert
        assertNotNull(result);
        assertEquals("Test User", result.getName());
        assertEquals("test@example.com", result.getEmail());
        assertEquals(UserType.CUSTOMER, result.getType());
        verify(userRepository).save(any(User.class));
    }
    
    @Test
    void createUser_ShouldThrowException_WhenEmailExists() {
        // Arrange
        when(userRepository.existsByPersonalInfoEmail(anyString())).thenReturn(true);
        
        // Act & Assert
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> userService.createUser(userCreateRequest));
        assertEquals("Email already exists", exception.getMessage());
    }
    
    @Test
    void authenticate_ShouldReturnLoginResponse_WhenCredentialsValid() {
        // Arrange
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("test@example.com");
        loginRequest.setPassword("password123");
        
        when(userRepository.findByPersonalInfoEmail(anyString())).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(true);
        when(jwtService.generateAccessToken(anyString(), anyString(), any())).thenReturn("accessToken");
        when(jwtService.generateRefreshToken(anyString())).thenReturn("refreshToken");
        when(userRepository.save(any(User.class))).thenReturn(testUser);
        
        // Act
        LoginResponse result = userService.authenticate(loginRequest);
        
        // Assert
        assertNotNull(result);
        assertEquals("accessToken", result.getAccessToken());
        assertEquals("refreshToken", result.getRefreshToken());
        assertNotNull(result.getUser());
        verify(userRepository).save(any(User.class));
    }
    
    @Test
    void authenticate_ShouldThrowException_WhenUserNotFound() {
        // Arrange
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("nonexistent@example.com");
        loginRequest.setPassword("password123");
        
        when(userRepository.findByPersonalInfoEmail(anyString())).thenReturn(Optional.empty());
        
        // Act & Assert
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> userService.authenticate(loginRequest));
        assertEquals("Invalid credentials", exception.getMessage());
    }
    
    @Test
    void authenticate_ShouldThrowException_WhenPasswordInvalid() {
        // Arrange
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("test@example.com");
        loginRequest.setPassword("wrongpassword");
        
        when(userRepository.findByPersonalInfoEmail(anyString())).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);
        
        // Act & Assert
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> userService.authenticate(loginRequest));
        assertEquals("Invalid credentials", exception.getMessage());
    }
    
    @Test
    void getUserById_ShouldReturnUser_WhenUserExists() {
        // Arrange
        when(userRepository.findById(anyString())).thenReturn(Optional.of(testUser));
        
        // Act
        User result = userService.getUserById("user123");
        
        // Assert
        assertNotNull(result);
        assertEquals("user123", result.getId());
        assertEquals("Test User", result.getPersonalInfo().getName());
    }
    
    @Test
    void getUserById_ShouldThrowException_WhenUserNotFound() {
        // Arrange
        when(userRepository.findById(anyString())).thenReturn(Optional.empty());
        
        // Act & Assert
        RuntimeException exception = assertThrows(RuntimeException.class, 
            () -> userService.getUserById("nonexistent"));
        assertEquals("User not found", exception.getMessage());
    }
    
    @Test
    void canUserTakeOrders_ShouldReturnTrue_ForManager() {
        // Arrange
        testUser.setType(UserType.MANAGER);
        when(userRepository.findById(anyString())).thenReturn(Optional.of(testUser));
        
        // Act
        boolean result = userService.canUserTakeOrders("user123");
        
        // Assert
        assertTrue(result);
    }
    
    @Test
    void canUserTakeOrders_ShouldReturnTrue_ForAssistantManager() {
        // Arrange
        testUser.setType(UserType.ASSISTANT_MANAGER);
        when(userRepository.findById(anyString())).thenReturn(Optional.of(testUser));
        
        // Act
        boolean result = userService.canUserTakeOrders("user123");
        
        // Assert
        assertTrue(result);
    }
    
    @Test
    void canUserTakeOrders_ShouldReturnFalse_ForCustomer() {
        // Arrange
        when(userRepository.findById(anyString())).thenReturn(Optional.of(testUser));
        
        // Act
        boolean result = userService.canUserTakeOrders("user123");
        
        // Assert
        assertFalse(result);
    }
    
    @Test
    void deactivateUser_ShouldSetUserInactive() {
        // Arrange
        when(userRepository.findById(anyString())).thenReturn(Optional.of(testUser));
        when(userRepository.save(any(User.class))).thenReturn(testUser);
        
        // Act
        userService.deactivateUser("user123");
        
        // Assert
        verify(userRepository).save(argThat(user -> !user.isActive()));
    }
}