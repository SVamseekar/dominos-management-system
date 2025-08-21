FROM openjdk:21-jdk-slim

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy Maven wrapper and pom files
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
COPY shared-models/pom.xml ./shared-models/
COPY user-service/pom.xml ./user-service/

# Download dependencies
RUN ./mvnw dependency:go-offline -B

# Copy source code
COPY shared-models/src ./shared-models/src/
COPY user-service/src ./user-service/src/

# Build application
RUN ./mvnw clean package -B -DskipTests

# Copy built jar
COPY user-service/target/*.jar app.jar

# Create non-root user
RUN addgroup --system appgroup && adduser --system --group appuser
RUN chown -R appuser:appgroup /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8081/actuator/health || exit 1

EXPOSE 8081

ENTRYPOINT ["java", "-jar", "app.jar"]