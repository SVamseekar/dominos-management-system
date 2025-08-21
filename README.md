# Domino's Restaurant Management System

Enterprise-grade restaurant management platform with microservices architecture.

## Tech Stack
- **Java 21** + **Spring Boot 3.2.0** + **Maven**
- **MongoDB 7.0** + **Redis 7.2**
- **Docker Compose** + **Spring Cloud Gateway**

## Architecture

API Gateway (8080) → Microservices → MongoDB + Redis

## Current Status
✅ **Phase 1 Complete**: Foundation & Infrastructure  
🚧 **Phase 2 Next**: User Service with Authentication

## Quick Start
```bash
# Start infrastructure
docker-compose up -d mongodb redis

# Build and run
mvn clean install
cd api-gateway && mvn spring-boot:run

# Test
curl http://localhost:8080/health

Project Structure├── pom.xml                    # Parent POM
├── shared-models/             # Common entities & enums
├── api-gateway/               # Request routing service
├── docker-compose.yml         # Infrastructure setup
└── infrastructure/mongodb/    # Database initialization

Features Implemented

Multi-module Maven project
API Gateway with Spring Cloud Gateway
MongoDB with strategic indexing
Redis caching setup
Docker containerization
User entity with Indian market validations
Role-based access control foundation

Next: User authentication, working hours tracking, JWT tokens.

