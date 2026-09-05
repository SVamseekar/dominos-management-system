# MSB-003 — European Multi-Store Chain Readiness Audit
## Document 03: European Country Model & Member-State Regulatory Audit

**Target Enterprise:** European Restaurant Chain (100 Stores across DE, FR, ES, NL, IT)  
**Evaluator:** European Tax Counsel, Head of Fiscal Compliance, and CTO  
**Scope:** `CountryProfileService`, `EuVatConfiguration`, `EuVatEngine`, Fiscal Signers, `OrderService`  
**Confidence Classification:** `[VERIFIED]` / `[LEGAL/TAX REVIEW REQUIRED]`  
**Verdict:** **CRITICAL COMPLIANCE FAILURE (UNLAWFUL VAT EVASION & COUNTERFEIT FISCALIZATION)**  

---

### 1. Country Configuration Matrix Across 5 Target EU Nations

| Country | Code | Currency / Locale in Source | VAT Configuration in Source | Fiscal Signer Implementation | Compliance Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Germany** | `DE` | `EUR` / `de-DE` (`CountryProfileService:L16,L31`) | Configured: 19% standard, 7% takeaway/delivery (`application.yml:L261-275`) | **COUNTERFEIT STUB** (`GermanyTseFiscalSigner:L28`) | **NON-COMPLIANT** (KassenSichV §146a AO violation) |
| **France** | `FR` | `EUR` / `fr-FR` (`CountryProfileService:L17,L32`) | Configured: 10% dine-in, 5.5% takeaway/delivery, 20% alcohol (`application.yml:L276-291`) | **COUNTERFEIT STUB** (`FranceNf525FiscalSigner:L27`) | **NON-COMPLIANT** (Loi Anti-Fraude TVA Art. 88 / NF525 violation) |
| **Spain** | `ES` | **MISSING** (Throws `IllegalArgumentException` on store load) | **MISSING** (Defaults to 0.0% VAT via `EuVatConfiguration:L36`) | **MISSING** (Falls through to `PassthroughFiscalSigner`) | **CRITICAL FAILURE** (Tax evasion under Ley 37/1992 & TicketBAI/VeriFactu) |
| **Netherlands** | `NL` | `EUR` / `nl-NL` (`CountryProfileService:L19,L34`) | Configured: 9% food/non-alcohol, 21% alcohol (`application.yml:L307-320`) | **MISSING** (Falls through to `PassthroughFiscalSigner`) | **PARTIALLY COMPLIANT** (Lacks Dutch Auditfile XAF export) |
| **Italy** | `IT` | `EUR` / `it-IT` (`CountryProfileService:L18,L33`) | Configured: 10% dine-in, 4% takeaway/delivery, 22% alcohol (`application.yml:L292-306`) | **COUNTERFEIT STUB** (`ItalyRtFiscalSigner:L24`) | **NON-COMPLIANT** (DL 127/2015 Registratore Telematico violation) |

---

### 2. The Spanish Catastrophe: Crash on Store Load & 0% VAT Tax Evasion

#### Evidence 1: Fatal Exception in `CountryProfileService.java`
In `core-service/src/main/java/com/MaSoVa/core/store/service/CountryProfileService.java`:
```java
15:     private static final Map<String, String> CURRENCY_MAP = Map.ofEntries(
16:         Map.entry("DE", "EUR"),
17:         Map.entry("FR", "EUR"),
18:         Map.entry("IT", "EUR"),
19:         Map.entry("NL", "EUR"),
20:         Map.entry("BE", "EUR"),
21:         Map.entry("HU", "HUF"),
22:         Map.entry("LU", "EUR"),
23:         Map.entry("IE", "EUR"),
24:         Map.entry("CH", "CHF"),
25:         Map.entry("GB", "GBP"),
26:         Map.entry("US", "USD"),
27:         Map.entry("CA", "CAD")
28:     );
...
49:         if (currency == null) {
50:             throw new IllegalArgumentException("Unsupported country code: " + countryCode);
51:         }
```
* **Analysis:** Twelve countries are hardcoded in `CURRENCY_MAP` and `LOCALE_MAP`. Spain (`ES`) is completely omitted.
* **Direct Consequence:** Any attempt by `core-service` or frontend onboarding to initialize or query a Spanish store throws `IllegalArgumentException: Unsupported country code: ES`. The service returns HTTP 500, rendering store management in Spain impossible.

#### Evidence 2: The 0% VAT Evasion Vulnerability
In `commerce-service/src/main/java/com/MaSoVa/commerce/order/config/EuVatConfiguration.java`:
```java
34:     public double lookupRate(String countryCode, String orderContext, String itemCategory) {
35:         if (countryCode == null || !countries.containsKey(countryCode)) {
36:             return 0.0;
37:         }
...
```
And in `commerce-service/src/main/resources/application.yml:L259-441`:
`eu-vat.countries` defines rates for `DE`, `FR`, `IT`, `NL`, `BE`, `HU`, `LU`, `IE`, `CH`, `GB`, `US`, `CA`. **Spain (`ES`) is completely omitted.**
* **Direct Consequence:** When an order is placed for a Spanish store, `countries.containsKey("ES")` evaluates to `false`. Line 36 returns `0.0` (0% VAT).
* **Legal Blast Radius:** Under Spanish VAT Law (*Ley 37/1992 del Impuesto sobre el Valor Añadido*), restaurant services are subject to the reduced 10% rate, and alcoholic beverages are subject to the 21% standard rate. Selling food and alcohol at 0% VAT constitutes systemic tax fraud under Article 305 of the Spanish Criminal Code (*Código Penal*), exposing corporate directors to imprisonment of 1 to 5 years and fines up to 600% of the defrauded amount.

---

### 3. Structural Flaws in `EuVatEngine.java`

In `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/EuVatEngine.java`:
```java
45:             BigDecimal net = BigDecimal.valueOf(item.getPrice())
46:                     .multiply(BigDecimal.valueOf(item.getQuantity()))
47:                     .setScale(2, RoundingMode.HALF_UP);
48:             BigDecimal vat = net.multiply(BigDecimal.valueOf(vatRatePct / 100.0))
49:                     .setScale(2, RoundingMode.HALF_UP);
50:             BigDecimal gross = net.add(vat);
...
58:         return new VatBreakdown(countryCode, orderContext, totalNet, totalVat, totalGross, lines);
```

#### Three Fatal Economic & Legal Errors:
1. **Net-to-Gross Addition vs. EU Gross-Inclusive Pricing:**
   Under the EU Price Indication Directive (Directive 98/6/EC) and national consumer protection laws (e.g. German *Preisangabenverordnung* - PAngV §1), menu prices shown to European consumers must be final, gross prices inclusive of all taxes.
   MaSoVa treats `item.getPrice()` as NET and calculates `gross = net + vat`. If a pizza is listed on the menu for €10.00, MaSoVa charges the customer €11.90 at checkout! This constitutes deceptive pricing under EU Directive 2005/29/EC (Unfair Commercial Practices).
   *Correct EU Formula:*
   $$\text{Net} = \frac{\text{Gross}}{1 + (\text{Rate} / 100)}, \quad \text{VAT} = \text{Gross} - \text{Net}$$
2. **Untaxed Delivery Fees:**
   `EuVatEngine.calculate()` only iterates over `OrderItem` list. The delivery fee is added directly to total in `OrderService.java:L202` without calculating VAT. In the EU, delivery fees are ancillary services subject to VAT (either at standard rate or blended pro-rata to the goods delivered). Failing to charge VAT on delivery fees creates permanent audit liabilities.
3. **Takeaway vs. Dine-In Distortions in Germany:**
   In `application.yml:L268-275`, German takeaway is configured at 7.0% for food and 19.0% for beverages. While correct, MaSoVa defaults all unknown items to "FOOD" (`EuVatEngine:L42`), causing non-food merchandise or soft drinks to be taxed at the reduced 7% rate whenever category metadata is missing.

---

### 4. Fiscalization & Anti-Fraud Compliance Audit

European tax authorities enforce strict anti-tampering regulations on POS software to prevent cash skimming and transaction suppression.

```
+----------------------------------------------------------------------------------------------------+
|                               MEMBER-STATE FISCALIZATION REALITY                                   |
+----------------------------------------------------------------------------------------------------+
| Germany (KassenSichV §146a AO):                                                                    |
|  - Source: GermanyTseFiscalSigner.java:L28                                                         |
|  - Reality: "STUB-TSE-SIG-" + order.getId()  --> FAKE STRING LITERAL (NO HARDWARE/CLOUD TSE)       |
+----------------------------------------------------------------------------------------------------+
| France (Loi Anti-Fraude TVA Art. 88 / NF525):                                                      |
|  - Source: FranceNf525FiscalSigner.java:L27                                                        |
|  - Reality: "STUB-NF525-SIG-" + order.getId() --> FAKE STRING LITERAL (NO AFNOR/LNE CERTIFICATION) |
+----------------------------------------------------------------------------------------------------+
| Italy (Decreto Legislativo 127/2015 RT):                                                           |
|  - Source: ItalyRtFiscalSigner.java:L24                                                            |
|  - Reality: "STUB-RT-SIG-" + order.getId()   --> FAKE STRING LITERAL (NO AGID/ADE RT PROTOCOL)    |
+----------------------------------------------------------------------------------------------------+
| Spain (TicketBAI Basque / VeriFactu Ley 11/2021):                                                  |
|  - Source: PassthroughFiscalSigner.java                                                            |
|  - Reality: COMPLETELY MISSING (NO QR CODE, NO XML CHAINING, NO AEAT TRANSMISSION)                 |
+----------------------------------------------------------------------------------------------------+
| Netherlands (Keurmerk Betrouwbare Afrekensystemen):                                                |
|  - Source: PassthroughFiscalSigner.java                                                            |
|  - Reality: COMPLETELY MISSING (NO AUDITFILE FINANCIEEL XAF EXPORT)                               |
+----------------------------------------------------------------------------------------------------+
```

#### Detailed Statutory Violations:
1. **Germany (§146a AO & KassenSichV):**
   * *Requirement:* Every transaction must be signed by a BSI-certified Technical Security System (TSE - *Technische Sicherheitseinrichtung*), producing a cryptographic signature, start/end timestamps, and sequential transaction counter printed as a QR code.
   * *Violation:* MaSoVa produces fake static strings. Operating this in Germany constitutes an intentional violation of tax recording laws (§379 AO), carrying administrative fines of up to €25,000 per cash register and triggering estimated tax reassessments (*Hinzuschätzung*).
2. **France (Art. 88 Loi de Finances 2016 / BOI-TVA-DECLA-30-10-30):**
   * *Requirement:* POS software must be certified by an accredited body (AFNOR/Infocert for NF525, or LNE), guaranteeing inalterability, security, storage, and archiving of transaction data.
   * *Violation:* `FranceNf525FiscalSigner` is a stub. Operating uncertified software incurs a €7,500 fine per terminal and a legal mandate to achieve certified compliance within 30 days.
3. **Italy (Art. 2 DL 127/2015):**
   * *Requirement:* Daily electronic transmission of receipts (*trasmissione telematica dei corrispettivi*) directly to *Agenzia delle Entrate* via an accredited server-RT or Telematic Cash Register.
   * *Violation:* `ItalyRtFiscalSigner` transmits nothing.
4. **Spain (TicketBAI & Ley 11/2021 VeriFactu):**
   * *Requirement:* In the Basque Country (TicketBAI) and nationwide under upcoming VeriFactu mandates, POS software must hash each invoice with the previous invoice, embed an official QR code with verification URL, and submit XML to regional tax authorities.
   * *Violation:* MaSoVa has zero TicketBAI or VeriFactu implementation.

---

### 5. The Dangerous Indian GST Fallback Hazard

In `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java`:
```java
197:         } else {
198:             String state = (request.getDeliveryAddress() != null && request.getDeliveryAddress().getState() != null)
199:                     ? request.getDeliveryAddress().getState()
200:                     : "Maharashtra";
201:             tax = taxConfiguration.calculateTax(subtotal, state, true);
202:             total = subtotal + deliveryFee + tax;
203:             log.debug("India GST applied for state={}: tax={}", state, tax);
204:         }
...
258:         if (store == null) {
259:             log.warn("Could not fetch store {} for currency propagation, defaulting to INR", request.getStoreId());
260:             order.setCurrency("INR");
261:         }
```
* **Architectural Trap:** If `store.countryCode` is null or store lookup fails during transient network degradation, the order silently falls back to **Indian GST for the state of Maharashtra** and currency **INR**!
* **Operational Consequence:** European customers in Berlin or Paris receive receipts denominated in Indian Rupees with CGST/SGST breakdowns. This produces immediate customer outrage and severe tax irregularities.

---

### 6. CTO Verdict on European Country Model

MaSoVa cannot legally operate in a single one of the 5 targeted European countries. Operating in Spain crashes or evades VAT; operating in Germany, France, and Italy generates counterfeit fiscal receipts punishable by significant administrative and criminal sanctions.

**European Country Model Readiness: CRITICAL FAILURE / BLOCKED**
