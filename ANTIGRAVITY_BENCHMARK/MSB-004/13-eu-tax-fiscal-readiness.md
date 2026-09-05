# Document 13 — European Tax & Fiscal Compliance Engineering Audit

**Benchmark:** MSB-004 — European Production Go-Live Certification
**Target Architecture:** Commerce Service, EU VAT Engine, Fiscal Signers, Order Processing
**Evaluator:** Independent Go-Live Board (Fiscal Compliance, European Tax Law, Systems Engineering)
**Date:** September 2026
**Status:** **REJECTED (CRIMINAL FISCAL LIABILITY & ILLEGAL SURCHARGING)**

---

## 1. Executive Summary & Fiscal Scorecard

Operating point-of-sale (POS) and restaurant commerce platforms in the European Union requires strict compliance with member state fiscal security laws, VAT calculation directives, and consumer price indication regulations. Non-compliance in this domain does not merely carry administrative fines; **fraudulent manipulation or mocking of fiscal transaction signatures constitutes criminal tax fraud under European national penal codes**.

The Board's audit reveals catastrophic deficiencies:
1. **Mocked Hardware Security Modules (TAX-01):** Fiscal signers for Germany, France, Italy, Belgium, and Hungary return hardcoded string stubs (`"STUB-TSE-SIG-"`, `"STUB-DEVICE-001"`), generating fraudulent, uncertified receipts.
2. **Illegal Consumer Price Surcharging (TAX-02):** `EuVatEngine.java` treats menu display prices as net and appends VAT at checkout, violating EU Directive 98/6/EC and national price indication statutes.
3. **Indian GST Fallbacks:** Failed store configurations trigger fallbacks applying Maharashtra GST and Indian Rupees (`INR`).

```
+----------------------------------------------------------------------------------------------------+
|                                    FISCAL & TAX COMPLIANCE MATRIX                                  |
+------------------------------------+-----------------------+---------------------------------------+
| Jurisdiction / Standard            | Statutory Obligation  | Current Implementation Status         |
+------------------------------------+-----------------------+---------------------------------------+
| Germany (KassenSichV / § 146a AO)  | BSI-Certified TSE HSM | CRIMINAL STUB: Generates fake UUIDs   |
| France (NF525 / Anti-Fraud Art 88) | LNE/Afnor Hash Chaining| CRIMINAL STUB: Static mock strings    |
| Italy (Registratore Telematico)    | RT XML Agenzia Entrate| MOCKED: Fake transmission stub        |
| Belgium (FDM / Boîte Noire)        | FPS Finance Black Box | MOCKED: Fake signature stub           |
| EU Directive 98/6/EC (Prices)      | Gross VAT-inclusive   | ILLEGAL: Adds VAT on top at checkout  |
| Currency & Tax Defaults            | EUR / National VAT    | FLAWED: Defaults to INR / Indian GST  |
+------------------------------------+-----------------------+---------------------------------------+
```

---

## 2. Deep Breakdown of Mocked Fiscal Signers (TAX-01)

European member states mandate tamper-proof recording of cash register and POS transactions to prevent cash-skimming and unreported restaurant sales.

### 2.1 Germany: KassenSichV & § 146a AO Violation
- **Statutory Mandate:** Every electronic cash register in Germany must be connected to a BSI-certified Technical Security System (*Technische Sicherheitseinrichtung* - TSE). Each transaction must receive a cryptographic digital signature containing a monotonic transaction counter, start/end timestamps, and device serial number, encoded into a standardized QR code on the guest receipt.
- **The Code Inspection (`GermanyTseFiscalSigner.java`):**
  ```java
  // Lines 24-35
  @Override
  public FiscalSignature sign(Order order, VatBreakdown vatBreakdown) {
      try {
          String tseTransactionId = "TSE-DE-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
          String signatureValue = "STUB-TSE-SIG-" + order.getId();

          FiscalSignature sig = new FiscalSignature(
              "DE", "TSE", tseTransactionId, signatureValue,
              null, Instant.now(), "STUB-DEVICE-001", true
          );
          log.info("[FISCAL-DE] Signed order={} tseId={}", order.getId(), tseTransactionId);
          return sig;
      }
      // ...
  }
  ```
- **Legal Ramification:**
  Issuing receipts printed with `"STUB-DEVICE-001"` and fake signature `"STUB-TSE-SIG-"` violates § 146a Abs. 1 AO. Under § 379 AO, deploying uncertified systems carries fines up to **€25,000 per cash register**, immediate rejection of the restaurant's accounting books by the German Tax Office (*Finanzamt*), punitive estimated taxation (*Schätzung der Besteuerungsgrundlagen*), and potential criminal prosecution of corporate officers for commercial tax evasion (§ 370 AO).

---

### 2.2 France: NF525 & Anti-Fraud Law Art. 88 Violation
- **Statutory Mandate:** French Finance Amendment Act (Law no. 2015-1785, Art. 88) requires cash register systems to meet conditions of inalterability, security, retention, and archiving certified by an accredited body (AFNOR / INFOCERT NF525). It mandates sequential SHA-256 hash chaining of receipts ($H_n = \text{SHA256}(H_{n-1} + \text{data})$).
- **The Code Inspection (`FranceNf525FiscalSigner.java`):**
  ```java
  // Lines 24-34
  String nf525TransactionId = "NF525-FR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
  String signatureValue = "STUB-NF525-SIG-" + order.getId();

  FiscalSignature sig = new FiscalSignature(
      "FR", "NF525", nf525TransactionId, signatureValue,
      null, Instant.now(), null, true
  );
  ```
- **Legal Ramification:**
  Deploying in France without valid NF525 / LNE certification carries a statutory fine of **€7,500 per software license**, coupled with a mandatory requirement to certify or remove the software within 30 days.

---

### 2.3 Italy (RT), Belgium (FDM), Hungary (NTCA)
- `ItalyRtFiscalSigner.java`: Returns mock XML structures without communicating with an Agenzia delle Entrate certified fiscal printer (*Registratore Telematico*).
- `BelgiumFdmFiscalSigner.java`: Returns mock signatures without interfacing with an official Fiscal Data Module (FDM / VAT black box) and VAT Signing Card (VSC).
- Operating any dine-in or takeaway restaurant in Brussels or Milan with these stubs constitutes illegal unrecorded cash register usage.

---

## 3. Illegal EU Consumer Price Surcharging (TAX-02)

Under European consumer protection law, consumer pricing transparency is strictly enforced.

### 3.1 Statutory Mandates:
- **EU Directive 98/6/EC (Price Indication Directive):** Article 3 requires that the selling price indicated for products offered to consumers must be the final price, inclusive of VAT and all other taxes.
- **Germany (Preisangabenverordnung - PAngV § 1(1)):** Mandates that whoever offers goods or services to consumers must indicate the final total price including VAT (*Endpreise*).
- **France (Code de la consommation Art. L112-1):** Requires all public prices to include all applicable taxes.

### 3.2 The Flawed Implementation in `EuVatEngine.java`:
```java
// Lines 45-50
BigDecimal net = BigDecimal.valueOf(item.getPrice())
        .multiply(BigDecimal.valueOf(item.getQuantity()))
        .setScale(2, RoundingMode.HALF_UP);
BigDecimal vat = net.multiply(BigDecimal.valueOf(vatRatePct / 100.0))
        .setScale(2, RoundingMode.HALF_UP);
BigDecimal gross = net.add(vat);
```

### 3.3 The Consumer Trap:
1. A restaurant menu displays a burger for **€12.00**.
2. The diner adds the burger to their cart expecting to pay €12.00.
3. `EuVatEngine` assumes €12.00 is the **net price**.
4. In Germany (19% standard VAT for dine-in), `EuVatEngine` calculates:
   $$\text{VAT} = €12.00 \times 0.19 = €2.28$$
   $$\text{Gross Total} = €12.00 + €2.28 = €14.28$$
5. The customer's credit card is charged **€14.28** instead of €12.00!
6. This practice is completely illegal in Europe. Consumer advocacy groups and competitors would immediately file statutory injunctions against the platform for illegal deceptive price anchoring.

### 3.4 The Required Statutory Calculation:
Menu prices in Europe are already gross:
$$\text{Gross} = €12.00$$
$$\text{Net} = \frac{€12.00}{1 + 0.19} = €10.08$$
$$\text{VAT} = €12.00 - €10.08 = €1.92$$

---

## 4. Indian Tax Default Fallbacks in European Operations

In `commerce-service/src/main/java/com/MaSoVa/commerce/order/service/OrderService.java` lines 198 and 258:
- If store metadata cannot be fetched or tenant resolution encounters a cache miss:
  ```java
  // Fallback defaults to Indian tax model:
  // Currency: INR
  // Tax breakdown: CGST (9%) + SGST (9%)
  ```
- If this occurs during a transaction in Munich, the customer's receipt prints in Indian Rupees with Indian GST tax headers, corrupting the restaurant's VAT return filing.

---

## 5. Fiscal & Tax Go-Live Mandatory Requirements

Before a single European restaurant can process transactions on MaSoVa:

1. **Hardware / Cloud TSE Integration:**
   Replace `GermanyTseFiscalSigner.java` with a certified cloud-TSE driver (e.g. Fiskaly, Swissbit, or Epson Cloud TSE) generating genuine cryptographically signed receipts verified by the BSI.
2. **NF525 French Certified Module:**
   Implement strict sequential SHA-256 hash chaining and immutable credit note generation, and obtain formal audit certification from LNE / Infocert.
3. **Invert VAT Engine Formula:**
   Refactor `EuVatEngine.java` to extract net and VAT from gross prices for B2C consumer orders.
4. **Enforce ISO 4217 Currency Guarantees:**
   Remove all hardcoded references to `INR`, `CGST`, `SGST`, and Indian Rupees. Reject any checkout request where the currency does not match the store's registered European sovereign currency.

---

**Board Certification Conclusion:** **REJECT**. Deploying mocked fiscal signers and deceptive price surcharging carries immediate criminal and civil liability.

