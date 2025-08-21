package com.dominos.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class ApiGatewayApplication {
    
    public static void main(String[] args) {
        SpringApplication.run(ApiGatewayApplication.class, args);
    }
    
    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()
            .route("user-service", r -> r.path("/api/users/**")
                .uri("http://user-service:8081"))
            .route("order-service", r -> r.path("/api/orders/**")
                .uri("http://order-service:8082"))
            .route("menu-service", r -> r.path("/api/menu/**")
                .uri("http://menu-service:8083"))
            .route("payment-service", r -> r.path("/api/payments/**")
                .uri("http://payment-service:8084"))
            .build();
    }
}