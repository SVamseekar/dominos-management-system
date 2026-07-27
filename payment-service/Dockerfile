# Stage 1: Build — Spring Boot executable JAR (repackage via parent pom)
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build

COPY pom.xml .
COPY shared-models/pom.xml shared-models/pom.xml
COPY shared-security/pom.xml shared-security/pom.xml
COPY api-gateway/pom.xml api-gateway/pom.xml
COPY payment-service/pom.xml payment-service/pom.xml
COPY commerce-service/pom.xml commerce-service/pom.xml
COPY logistics-service/pom.xml logistics-service/pom.xml
COPY intelligence-service/pom.xml intelligence-service/pom.xml
COPY core-service/pom.xml core-service/pom.xml
RUN mvn dependency:go-offline -pl payment-service -am -q 2>/dev/null || true

COPY shared-models/src shared-models/src
COPY shared-security/src shared-security/src
COPY payment-service/src payment-service/src
# Build executable fat jar; exclude *-plain.jar (no Main-Class)
RUN mvn -pl payment-service -am package -DskipTests -q \
    && JAR=$(ls payment-service/target/payment-service-*.jar | grep -v plain | head -n1) \
    && echo "Using $JAR" \
    && cp "$JAR" /build/app.jar

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-jammy AS runtime
WORKDIR /app

RUN groupadd -r masova && useradd -r -g masova -u 1001 masova
USER masova

COPY --from=builder --chown=masova:masova /build/app.jar app.jar

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 CMD wget -qO- http://localhost:8089/actuator/health || exit 1

EXPOSE 8089
ENTRYPOINT ["sh", "-c", "java -jar -Xmx512m -XX:+UseContainerSupport -Dspring.profiles.active=${SPRING_PROFILES_ACTIVE:-dev} app.jar"]
