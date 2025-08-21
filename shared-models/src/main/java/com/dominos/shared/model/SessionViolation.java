package com.dominos.shared.model;

import java.time.LocalDateTime;

public class SessionViolation {
    private String violationType;
    private String description;
    private LocalDateTime detectedAt;
    private String severity;
    private boolean resolved;
    
    public SessionViolation() {}
    
    public SessionViolation(String violationType, String description) {
        this.violationType = violationType;
        this.description = description;
        this.detectedAt = LocalDateTime.now();
        this.severity = "MEDIUM";
        this.resolved = false;
    }
    
    // Getters and setters
    public String getViolationType() { return violationType; }
    public void setViolationType(String violationType) { this.violationType = violationType; }
    
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    
    public LocalDateTime getDetectedAt() { return detectedAt; }
    public void setDetectedAt(LocalDateTime detectedAt) { this.detectedAt = detectedAt; }
    
    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }
    
    public boolean isResolved() { return resolved; }
    public void setResolved(boolean resolved) { this.resolved = resolved; }
}