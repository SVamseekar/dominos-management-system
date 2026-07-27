package com.MaSoVa.gateway.config;

import com.MaSoVa.gateway.filter.JwtAuthenticationFilter;
import com.MaSoVa.gateway.filter.RateLimitingFilter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import reactor.core.publisher.Mono;

/**
 * API Gateway route configuration — Phase 1 consolidated architecture (6 services).
 *
 * Service map:
 *   core-service         port 8085  — users, customers, notifications, campaigns, reviews
 *   commerce-service     port 8084  — menu, orders, kitchen, kitchen-equipment
 *   payment-service      port 8089  — payments, refunds (standalone for PCI DSS)
 *   logistics-service    port 8086  — delivery, dispatch, tracking, inventory, suppliers, waste
 *   intelligence-service port 8087  — analytics, BI, reports
 *   api-gateway          port 8080  — this service
 */
@Configuration
public class GatewayConfig {

    @Autowired
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @Autowired
    private RateLimitingFilter rateLimitingFilter;


    @Value("${services.core-service.url:http://localhost:8085}")
    private String coreServiceUrl;

    @Value("${services.commerce-service.url:http://localhost:8084}")
    private String commerceServiceUrl;

    @Value("${services.payment-service.url:http://localhost:8089}")
    private String paymentServiceUrl;

    @Value("${services.logistics-service.url:http://localhost:8086}")
    private String logisticsServiceUrl;

    @Value("${services.intelligence-service.url:http://localhost:8087}")
    private String intelligenceServiceUrl;


    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()

                // ============================================================
                // CORE SERVICE (port 8085) — users, customers, notifications,
                //                            campaigns, reviews, preferences
                // ============================================================

                // ── Canonical auth routes: POST /api/auth/* (+ legacy /api/users/* aliases) ─
                .route("core_auth_login", r -> r.path("/api/auth/login", "/api/users/login")
                        .and().method("POST")
                        .filters(f -> f.filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "auth"))))
                        .uri(coreServiceUrl))

                .route("core_auth_register", r -> r.path("/api/auth/register", "/api/users/register")
                        .and().method("POST")
                        .filters(f -> f.filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "register"))))
                        .uri(coreServiceUrl))

                .route("core_auth_refresh", r -> r.path("/api/auth/refresh", "/api/users/refresh")
                        .and().method("POST")
                        .filters(f -> f.filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "refresh"))))
                        .uri(coreServiceUrl))

                .route("core_auth_logout", r -> r.path("/api/auth/logout", "/api/users/logout")
                        .and().method("POST")
                        .filters(f -> f.filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                .route("core_auth_google", r -> r.path("/api/auth/google", "/api/users/auth/google", "/api/users/google")
                        .and().method("POST")
                        .filters(f -> f.filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "google_auth"))))
                        .uri(coreServiceUrl))

                .route("core_auth_change_password", r -> r.path("/api/auth/change-password")
                        .and().method("POST")
                        .filters(f -> f.filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                .route("core_auth_validate_pin", r -> r.path("/api/auth/validate-pin")
                        .and().method("POST")
                        .filters(f -> f.filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "validate_pin"))))
                        .uri(coreServiceUrl))

                .route("core_kiosk_public", r -> r.path("/api/users/kiosk/**")
                        .filters(f -> f.filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "kiosk"))))
                        .uri(coreServiceUrl))

                // Stores — public GET (list, by id/code, query filters) for customer store picker
                // Mutations stay JWT-protected below. Core also permits these paths; write ops use @PreAuthorize.
                .route("core_stores_public", r -> r.path("/api/stores", "/api/stores/**")
                        .and().method("GET")
                        .uri(coreServiceUrl))

                // Reviews — public rating display (no auth for customer-facing pages)
                .route("core_reviews_public", r -> r.path("/api/reviews/public/**")
                        .and().method("GET")
                        .uri(coreServiceUrl))

                // POST /api/customers/get-or-create is service-to-service ONLY — deny at gateway
                .route("core_customers_get_or_create_blocked", r -> r
                        .path("/api/customers/get-or-create")
                        .and().method("POST")
                        .filters(f -> f.filter((exchange, chain) -> {
                            exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
                            exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
                            byte[] body = "{\"error\":\"This endpoint is not accessible externally\"}".getBytes();
                            DataBuffer buf = exchange.getResponse().bufferFactory().wrap(body);
                            return exchange.getResponse().writeWith(Mono.just(buf));
                        }))
                        .uri(coreServiceUrl))

                // GDPR anonymize endpoints are service-to-service ONLY — never reachable externally
                .route("gdpr_anonymize_orders_blocked", r -> r
                        .path("/api/orders/gdpr/**")
                        .and().method("POST")
                        .filters(f -> f.filter((exchange, chain) -> {
                            exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
                            exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
                            byte[] body = "{\"error\":\"This endpoint is not accessible externally\"}".getBytes();
                            DataBuffer buf = exchange.getResponse().bufferFactory().wrap(body);
                            return exchange.getResponse().writeWith(Mono.just(buf));
                        }))
                        .uri(commerceServiceUrl))

                .route("gdpr_anonymize_payments_blocked", r -> r
                        .path("/api/payments/gdpr/**")
                        .and().method("POST")
                        .filters(f -> f.filter((exchange, chain) -> {
                            exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
                            exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
                            byte[] body = "{\"error\":\"This endpoint is not accessible externally\"}".getBytes();
                            DataBuffer buf = exchange.getResponse().bufferFactory().wrap(body);
                            return exchange.getResponse().writeWith(Mono.just(buf));
                        }))
                        .uri(paymentServiceUrl))

                .route("gdpr_anonymize_delivery_blocked", r -> r
                        .path("/api/delivery/gdpr/**")
                        .and().method("POST")
                        .filters(f -> f.filter((exchange, chain) -> {
                            exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
                            exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
                            byte[] body = "{\"error\":\"This endpoint is not accessible externally\"}".getBytes();
                            DataBuffer buf = exchange.getResponse().bufferFactory().wrap(body);
                            return exchange.getResponse().writeWith(Mono.just(buf));
                        }))
                        .uri(logisticsServiceUrl))

                // Users — all other protected user/store/session/shift operations
                .route("core_users", r -> r.path("/api/users/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "core_users")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                // Stores — mutations only (GET handled by core_stores_public above)
                .route("core_stores", r -> r.path("/api/stores", "/api/stores/**")
                        .and().method("POST", "PUT", "PATCH", "DELETE")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "core_stores")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                .route("core_sessions", r -> r.path("/api/sessions/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "core_sessions")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                .route("core_shifts", r -> r.path("/api/shifts/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "core_shifts")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                .route("core_customers", r -> r.path("/api/customers/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "core_customers")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                // Dev/demo seed bootstrap (core TestDataController @Profile dev|demo; no JWT for cold start)
                .route("core_test_data", r -> r.path("/api/test-data/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(100, "core_test_data"))))
                        .uri(coreServiceUrl))

                .route("core_notifications", r -> r.path("/api/notifications/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "core_notifications")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                .route("core_campaigns", r -> r.path("/api/campaigns/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "core_campaigns")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                .route("core_reviews", r -> r.path("/api/reviews/**")
                        .and().not(p -> p.path("/api/reviews/public/**"))
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "core_reviews")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                .route("core_gdpr", r -> r.path("/api/gdpr/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "core_gdpr")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                // /api/responses and /api/ratings have been merged into /api/reviews — route removed

                .route("core_preferences", r -> r.path("/api/preferences/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "core_preferences")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                // Staff earnings & pay rates (tips routed separately to commerce-service)
                .route("core_staff", r -> r.path("/api/staff/**")
                        .and().not(p -> p.path("/api/staff/tips/**"))
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "core_staff")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                // System updates — version/health/info served locally via SystemRouterConfig
                .route("core_system_updates", r -> r.path("/api/system/updates/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "core_system_updates")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(coreServiceUrl))

                // Core: Swagger docs proxy
                .route("core_api_docs", r -> r.path("/core-service/v3/api-docs")
                        .filters(f -> f.rewritePath("/core-service(?<segment>.*)", "${segment}"))
                        .uri(coreServiceUrl))

                // ============================================================
                // COMMERCE SERVICE (port 8084) — menu, orders, kitchen
                // ============================================================

                // Menu — public browsing (no auth) — canonical: GET /api/menu and GET /api/menu/{id}
                .route("commerce_menu_public", r -> r.path("/api/menu", "/api/menu/{id}")
                        .and().method("GET")
                        .uri(commerceServiceUrl))

                // Menu — protected GET sub-paths (stats, copy, bulk-availability) — auth required
                .route("commerce_menu_get_protected", r -> r.path("/api/menu/**")
                        .and().method("GET")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "commerce_menu_get_protected")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(commerceServiceUrl))

                // Menu — mutations (auth required)
                .route("commerce_menu_modify", r -> r.path("/api/menu/**")
                        .and().method("POST", "PUT", "DELETE", "PATCH")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "commerce_menu_modify")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(commerceServiceUrl))

                // Orders — public tracking (email links, no auth)
                .route("commerce_orders_track", r -> r.path("/api/orders/track/**")
                        .and().method("GET")
                        .filters(f -> f.filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "commerce_track"))))
                        .uri(commerceServiceUrl))

                // Orders — public rating token validation (SMS/email links, no auth)
                .route("commerce_orders_rating_token", r -> r.path("/api/orders/rating-token/**")
                        .and().method("GET")
                        .filters(f -> f.filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "commerce_rating_token"))))
                        .uri(commerceServiceUrl))

                // Orders — protected (GDPR anonymize paths blocked above via dedicated routes)
                // X-Internal-Service is stripped here so external callers cannot spoof it
                .route("commerce_orders", r -> r.path("/api/orders/**")
                        .and().not(p -> p.path("/api/orders/track/**"))
                        .and().not(p -> p.path("/api/orders/rating-token/**"))
                        .and().not(p -> p.path("/api/orders/gdpr/**"))
                        .filters(f -> f
                            .removeRequestHeader("X-Internal-Service")
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "commerce_orders")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(commerceServiceUrl))

                // Kitchen queue and equipment (canonical path: /api/equipment)
                .route("commerce_kitchen", r -> r.path("/api/kitchen/**", "/api/equipment/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "commerce_kitchen")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(commerceServiceUrl))

                // Staff tips — undistributed direct tips (earnings/pay-rates on core-service)
                .route("commerce_staff_tips", r -> r.path("/api/staff/tips/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "commerce_staff_tips")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(commerceServiceUrl))

                // Fiscal compliance — manager dashboard (JWT required)
                .route("commerce_fiscal", r -> r.path("/api/fiscal/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "commerce_fiscal")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(commerceServiceUrl))

                // Third-party aggregator connections (Swiggy, Zomato, etc.)
                .route("commerce_aggregators", r -> r.path("/api/aggregators/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "commerce_aggregators")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(commerceServiceUrl))

                // WebSocket — order updates
                .route("commerce_websocket", r -> r.path("/api/ws/orders", "/api/ws/orders/**")
                        .filters(f -> f.rewritePath("/api(?<segment>.*)", "${segment}"))
                        .uri(commerceServiceUrl.replace("http://", "ws://").replace("https://", "wss://")))

                // Commerce: Swagger docs proxy
                .route("commerce_api_docs", r -> r.path("/commerce-service/v3/api-docs")
                        .filters(f -> f.rewritePath("/commerce-service(?<segment>.*)", "${segment}"))
                        .uri(commerceServiceUrl))

                // ============================================================
                // PAYMENT SERVICE (port 8089) — standalone PCI DSS scope
                // ============================================================

                // Webhook — public (Razorpay callbacks, no auth)
                .route("payment_webhook", r -> r.path("/api/payments/webhook")
                        .and().method("POST")
                        .uri(paymentServiceUrl))

                // Webhook — public (Stripe callbacks, no auth, no rate limit — signature verified in StripeGateway)
                .route("payment_webhook_stripe", r -> r.path("/api/payments/webhook/stripe")
                        .and().method("POST")
                        .uri(paymentServiceUrl))

                // Alias MUST be before payments_protected catch-all so rewrite runs
                // /api/payments/refunds → /api/payments/refund (plural → singular)
                .route("payments_refunds_plural_alias", r -> r.path("/api/payments/refunds", "/api/payments/refunds/**")
                        .filters(f -> f
                            .rewritePath("/api/payments/refunds(?<segment>/?.*)", "/api/payments/refund${segment}")
                            .removeRequestHeader("X-Internal-Service")
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "payments")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(paymentServiceUrl))

                // Alias: /api/refunds → /api/payments/refund (manager probes / feature-matrix)
                .route("refunds_alias", r -> r.path("/api/refunds", "/api/refunds/**")
                        .filters(f -> f
                            .rewritePath("/api/refunds(?<segment>/?.*)", "/api/payments/refund${segment}")
                            .removeRequestHeader("X-Internal-Service")
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "payments")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(paymentServiceUrl))

                // Payments — protected (GDPR anonymize paths blocked above via dedicated routes)
                // X-Internal-Service is stripped here so external callers cannot spoof it
                .route("payments_protected", r -> r.path("/api/payments/**")
                        .and().not(p -> p.path("/api/payments/webhook"))
                        .and().not(p -> p.path("/api/payments/webhook/stripe"))
                        .and().not(p -> p.path("/api/payments/gdpr/**"))
                        .and().not(p -> p.path("/api/payments/refunds"))
                        .and().not(p -> p.path("/api/payments/refunds/**"))
                        .filters(f -> f
                            .removeRequestHeader("X-Internal-Service")
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "payments")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(paymentServiceUrl))

                // Payment: Swagger docs proxy
                .route("payment_api_docs", r -> r.path("/payment-service/v3/api-docs")
                        .filters(f -> f.rewritePath("/payment-service(?<segment>.*)", "${segment}"))
                        .uri(paymentServiceUrl))

                // ============================================================
                // LOGISTICS SERVICE (port 8086) — delivery, inventory
                // ============================================================

                // Delivery public tracking — no auth (driver app / customer tracking page)
                .route("logistics_delivery_track", r -> r.path("/api/delivery/track/**")
                        .and().method("GET")
                        .filters(f -> f.filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "logistics_delivery_track"))))
                        .uri(logisticsServiceUrl))

                // Delivery (merged: dispatch + tracking + performance — now all at /api/delivery)
                // GDPR anonymize paths blocked above via dedicated routes
                // X-Internal-Service is stripped here so external callers cannot spoof it
                .route("logistics_delivery", r -> r.path("/api/delivery/**")
                        .and().not(p -> p.path("/api/delivery/gdpr/**"))
                        .and().not(p -> p.path("/api/delivery/track/**"))
                        .filters(f -> f
                            .removeRequestHeader("X-Internal-Service")
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "logistics_delivery")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(logisticsServiceUrl))

                // Inventory, suppliers, purchase orders, waste
                .route("logistics_inventory", r -> r.path("/api/inventory/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "logistics_inventory")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(logisticsServiceUrl))

                .route("logistics_suppliers", r -> r.path("/api/suppliers/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "logistics_suppliers")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(logisticsServiceUrl))

                .route("logistics_purchase_orders", r -> r.path("/api/purchase-orders/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "logistics_purchase_orders")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(logisticsServiceUrl))

                .route("logistics_waste", r -> r.path("/api/waste/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "logistics_waste")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(logisticsServiceUrl))

                // WebSocket — delivery location updates
                .route("logistics_websocket", r -> r.path("/api/ws/delivery", "/api/ws/delivery/**")
                        .filters(f -> f.rewritePath("/api(?<segment>.*)", "${segment}"))
                        .uri(logisticsServiceUrl.replace("http://", "ws://").replace("https://", "wss://")))

                // Logistics: Swagger docs proxy
                .route("logistics_api_docs", r -> r.path("/logistics-service/v3/api-docs")
                        .filters(f -> f.rewritePath("/logistics-service(?<segment>.*)", "${segment}"))
                        .uri(logisticsServiceUrl))

                // ============================================================
                // INTELLIGENCE SERVICE (port 8087) — analytics, BI, reports
                // ============================================================

                .route("intelligence_analytics", r -> r.path("/api/analytics/**", "/api/bi/**", "/api/reports/**")
                        .filters(f -> f
                            .filter(rateLimitingFilter.apply(createRateLimitConfig(1000, "intelligence_analytics")))
                            .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                        .uri(intelligenceServiceUrl))

                // Intelligence: Swagger docs proxy
                .route("intelligence_api_docs", r -> r.path("/intelligence-service/v3/api-docs")
                        .filters(f -> f.rewritePath("/intelligence-service(?<segment>.*)", "${segment}"))
                        .uri(intelligenceServiceUrl))

                // ============================================================
                // HEALTH CHECKS (per new service)
                // ============================================================

                .route("health_core", r -> r.path("/api/health/core", "/api/health/user",
                                                   "/api/health/customer", "/api/health/notification")
                        .uri(coreServiceUrl))

                .route("health_commerce", r -> r.path("/api/health/commerce", "/api/health/menu",
                                                       "/api/health/order")
                        .uri(commerceServiceUrl))

                .route("health_payment", r -> r.path("/api/health/payment")
                        .uri(paymentServiceUrl))

                .route("health_logistics", r -> r.path("/api/health/logistics", "/api/health/delivery",
                                                        "/api/health/inventory")
                        .uri(logisticsServiceUrl))

                .route("health_intelligence", r -> r.path("/api/health/intelligence", "/api/health/analytics")
                        .uri(intelligenceServiceUrl))

                // Default fallback
                .route("fallback", r -> r.path("/**")
                        .uri("http://localhost:8080/fallback"))

                .build();
    }

    private RateLimitingFilter.Config createRateLimitConfig(int requestsPerMinute, String routeType) {
        RateLimitingFilter.Config config = new RateLimitingFilter.Config();
        config.setRequestsPerMinute(requestsPerMinute);
        config.setRouteType(routeType);
        return config;
    }
}
