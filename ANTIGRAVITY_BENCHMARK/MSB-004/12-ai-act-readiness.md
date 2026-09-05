# Document 12 — EU AI Act Regulatory Compliance Audit

**Benchmark:** MSB-004 — European Production Go-Live Certification
**Target Architecture:** Intelligence Service, Agent Catalog, AI Support Agent, Staff Analytics
**Evaluator:** Independent Go-Live Board (EU AI Regulatory Counsel, Machine Learning Engineering)
**Date:** September 2026
**Status:** **REJECTED (CRITICAL HIGH-RISK AI ACT NON-COMPLIANCE)**

---

## 1. Executive Summary & Regulatory Timeline

Regulation (EU) 2024/1689 of the European Parliament and of the Council (the **EU Artificial Intelligence Act**) entered into force on 1 August 2024. As of **August 2026**, the transitional implementation window has elapsed:
- **February 2025:** Chapter II (Prohibited AI Practices) entered into force.
- **August 2025:** Chapter III Section 4 (General Purpose AI Models) and governance rules took effect.
- **August 2026:** **Chapter III (High-Risk AI Systems) and deployer/provider obligations are IN FULL FORCE AND EFFECT.**

Any commercial deployment of AI systems within the European Union in September 2026 must demonstrate strict adherence to high-risk conformity assessments, CE marking, transparency disclosures, and human oversight.

The Board conducted an exhaustive regulatory assessment of the MaSoVa AI systems.
### **Finding: MaSoVa operates multiple systems that meet the statutory definition of High-Risk AI under Annex III(4)(b) (Employment & Worker Management) without risk management systems, technical documentation, human oversight, or CE conformity marking.**

```
+----------------------------------------------------------------------------------------------------+
|                                    EU AI ACT COMPLIANCE SCORECARD                                  |
+------------------------------------+-----------------------+---------------------------------------+
| System / Feature                   | Risk Classification   | Regulatory Verdict                    |
+------------------------------------+-----------------------+---------------------------------------+
| Staff Performance & Leaderboard    | HIGH-RISK (Annex III) | UNLAWFUL: Zero conformity assessment  |
| Shift Optimisation Agent (Agent 6) | HIGH-RISK (Annex III) | UNLAWFUL: Algorithmic task allocation |
| Kitchen Coach Agent (Agent 7)      | HIGH-RISK (Annex III) | UNLAWFUL: Worker monitoring           |
| AI Support Chatbot (Agent 1)       | SPECIFIC TRANSPARENCY | NON-COMPLIANT: Missing Art. 50 warning|
| Dynamic Pricing Engine (Agent 8)   | TRANSPARENCY / CONSUM.| DEFICIENT: Opaque pricing algorithms  |
| Cloud LLM Dependency (US Gemini)   | GPAI / DATA SOVEREIGN | UNLAWFUL: Non-EU data routing         |
+------------------------------------+-----------------------+---------------------------------------+
```

---

## 2. Complete Ecosystem AI & Algorithmic Inventory

The frontend configuration in `frontend/src/pages/manager/agentCatalog.ts` and backend `intelligence-service` expose eight autonomous agents and algorithmic decision engines:

```
+----------------------------------------------------------------------------------------------------+
|                                    MASOVA AI SYSTEM CATALOG                                        |
+-----+-----------------------+---------------+------------------------------------------------------+
| No. | Agent / Engine Name   | Scope         | Statutory Category under EU AI Act                   |
+-----+-----------------------+---------------+------------------------------------------------------+
| 1   | Customer Support      | Engagement    | Article 50 (Natural Person Interaction Transparency) |
| 2   | Demand Forecasting    | Intelligence  | Minimal Risk (Operational forecasting)               |
| 3   | Inventory Reorder     | Operations    | Minimal Risk (Automated inventory triggers)          |
| 4   | Churn Prevention      | Engagement    | Minimal Risk (Customer lifetime value modeling)      |
| 5   | Smart Review Response | Engagement    | Article 50 (Synthetic text generation)               |
| 6   | Shift Optimisation    | Operations    | Annex III(4)(b) HIGH-RISK (Work allocation)          |
| 7   | Kitchen Coach         | Operations    | Annex III(4)(b) HIGH-RISK (Worker performance eval)  |
| 8   | Dynamic Pricing | Intelligence | Directive 98/6/EC & Consumer Transparency |
| --- |Staff Leaderboard Svc | Analytics     | Annex III(4)(b) HIGH-RISK (Algorithmic worker ranking|
+-----+-----------------------+---------------+------------------------------------------------------+
```

---

## 3. High-Risk Classification under Annex III, Point 4(b)

### 3.1 Statutory Text (Regulation (EU) 2024/1689, Annex III)
Point 4(b) explicitly designates as **High-Risk**:
> *"AI systems intended to be used to make decisions affecting terms of work-related relationships, the promotion or termination of work-related contractual relationships, to allocate tasks based on individual behaviour or to monitor and evaluate the performance and behaviour of persons in such relationships."*

### 3.2 Evidence from Source Code: Algorithmic Worker Scoring
In `intelligence-service/src/main/java/com/MaSoVa/intelligence/service/AnalyticsService.java`:
```java
// Lines 545-569
String performanceLevel = determinePerformanceLevel(ordersProcessed, salesGenerated);

rankings.add(StaffLeaderboardResponse.StaffRanking.builder()
    .staffId(staffId)
    .staffName(staffName)
    .ordersProcessed(ordersProcessed)
    .salesGenerated(salesGenerated)
    .averageOrderValue(aov)
    .performanceLevel(performanceLevel)
    .build());

// Sort by sales generated (descending)
rankings.sort((a, b) -> b.getSalesGenerated().compareTo(a.getSalesGenerated()));

// Assign ranks and calculate percentages
for (int i = 0; i < rankings.size(); i++) {
    StaffLeaderboardResponse.StaffRanking ranking = rankings.get(i);
    ranking.setRank(i + 1);
    // ...
}
```

### 3.3 Statutory Violation Analysis
1. **Automated Worker Ranking:** `AnalyticsService` and `BIEngineService` compute an automated ordinal ranking (`Rank 1`, `Rank 2`...) and performance classification (`determinePerformanceLevel`) across kitchen workers and waitstaff.
2. **Impact on Employment:** In restaurant operations, these scores determine shift allocations, wage bonuses, promotion, and termination.
3. **Shift Optimisation & Kitchen Coach:** Agents 6 and 7 automate schedule assignment and kitchen station coaching based on telemetry.
4. **Conclusion:** These components constitute **High-Risk AI Systems** subject to Chapter III of the EU AI Act.

---

## 4. Comprehensive Violations of Chapter III Obligations

Because the platform operates high-risk worker evaluation systems, it is subject to mandatory requirements that are completely absent from the codebase:

- **Article 9 (Risk Management System):**
  *Statutory Requirement:* A continuous, documented risk management system identifying foreseeable risks to worker health, safety, and fundamental rights.
  *Audit Finding:* Zero risk assessment files exist. No fundamental rights impact assessment (FRIA under Art. 27) was conducted.
- **Article 10 (Data Governance):**
  *Statutory Requirement:* Training, validation, and testing datasets must be examined for bias, statistical anomalies, and demographic discrimination.
  *Audit Finding:* Ranking relies on raw order volume, inherently penalizing staff on slow shifts or staff assigned to non-billing duties (cleaning, food prep).
- **Article 11 & Annex IV (Technical Documentation):**
  *Statutory Requirement:* Detailed technical documentation demonstrating compliance before placing on the market.
  *Audit Finding:* No AI Act technical file or conformity documentation exists.
- **Article 12 (Automated Logging & Record-Keeping):**
  *Statutory Requirement:* High-risk AI systems must automatically log events to ensure traceability of output determinations.
  *Audit Finding:* Rankings are cached in Redis (`@Cacheable(value = "staffLeaderboard")`) without immutable audit trails recording the scoring history.
- **Article 14 (Human Oversight):**
  *Statutory Requirement:* Natural persons must be able to understand outputs, remain aware of automation bias, and override or reverse algorithmic decisions.
  *Audit Finding:* The system provides no UI or API mechanism for an employee to contest an algorithmic score or for a human manager to record overrides.

---

## 5. Article 50 Transparency Obligations (AI Support Agent)

Article 50(1) mandates:
> *"Providers shall ensure that AI systems intended to interact directly with natural persons are designed and developed in such a way that the natural persons concerned are informed that they are interacting with an AI system, unless this is obvious from the points of view of a reasonable natural person."*

### Audit Finding:
- In `frontend/src/store/api/agentApi.ts` and `masova-support`, the customer support chat interface initializes without an unambiguous statutory disclosure.
- When an end-customer in Paris or Berlin opens the support widget, the bot responds without presenting the mandatory statement: *"You are communicating with an artificial intelligence system."*

---

## 6. Regulatory Penalties under Article 99

Under Article 99(3) and (4) of the EU AI Act:
- Non-compliance with the prohibition of AI practices (Art. 5): Fines up to **€35,000,000 or 7% of total worldwide annual turnover**.
- Non-compliance with High-Risk AI obligations (Chapter III): Fines up to **€15,000,000 or 3% of total worldwide annual turnover**.
- Supply of incorrect or misleading information to notified bodies: Fines up to **€7,500,000 or 1.5% of turnover**.

Deploying the MaSoVa platform with active staff leaderboard ranking and uncertified shift optimization exposes the company and operating restaurant franchisees to immediate regulatory sanctions.

---

## 7. AI Act Go-Live Remediation Plan

1. **Immediate Deactivation of Worker Evaluation AI:**
   Disable `getStaffLeaderboard`, `Agent 6 (Shift Optimisation)`, and `Agent 7 (Kitchen Coach)` in European deployment profiles until full Chapter III conformity assessment and notified body approval can be secured.
2. **Statutory Article 50 Disclosure:**
   Update the customer support chat UI to prominently display an immutable banner: *"MaSoVa Support is powered by an Artificial Intelligence system."*
3. **EU Sovereign GPAI Hosting:**
   Migrate all LLM inference from public Google Gemini endpoints to Vertex AI European instances (`europe-west1` / `europe-west3`) governed by enterprise EU Data Processing Addendums.

---

**Board Certification Conclusion:** **REJECT**. Operating uncertified High-Risk AI systems violates binding EU law.

