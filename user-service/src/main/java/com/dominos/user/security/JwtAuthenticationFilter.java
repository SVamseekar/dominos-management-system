package com.dominos.user.security;

import com.dominos.user.service.JwtService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

public class JwtAuthenticationFilter extends OncePerRequestFilter {
    
    private final JwtService jwtService;
    
    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }
    
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, 
                                  FilterChain filterChain) throws ServletException, IOException {
        
        String authHeader = request.getHeader("Authorization");
        
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }
        
        try {
            String token = authHeader.substring(7);
            String userId = jwtService.extractUserId(token);
            String userType = jwtService.extractUserType(token);
            String storeId = jwtService.extractStoreId(token);
            
            if (userId != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                if (jwtService.validateToken(token, userId)) {
                    List<SimpleGrantedAuthority> authorities = List.of(
                        new SimpleGrantedAuthority("ROLE_" + userType)
                    );
                    
                    UsernamePasswordAuthenticationToken authentication = 
                        new UsernamePasswordAuthenticationToken(userId, null, authorities);
                    
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                    
                    // Add user info to request headers for downstream services
                    request.setAttribute("X-User-Id", userId);
                    request.setAttribute("X-User-Type", userType);
                    if (storeId != null) {
                        request.setAttribute("X-Store-Id", storeId);
                    }
                }
            }
        } catch (Exception e) {
            logger.error("JWT Authentication failed", e);
        }
        
        filterChain.doFilter(request, response);
    }
}