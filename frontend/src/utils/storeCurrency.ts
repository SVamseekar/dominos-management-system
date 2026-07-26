/**
 * Resolve cart market fields from a Store API record only.
 * Never invents a demo country (no hard-coded DE/Berlin).
 *
 * Rules (aligned with seed + multi-market cart):
 * - countryCode null / missing / "IN" → India legacy (INR, en-IN, null country for GST path)
 * - any other country → use store.currency + store.locale from the record;
 *   fill only missing locale via language tag for that ISO country (not a fixed city)
 * - if non-IN store omits currency, market is unresolved (caller must not charge)
 */

export type StoreMarketFields = {
  currency: string;
  locale: string;
  countryCode: string | null;
};

export type ResolvedStoreMarket = StoreMarketFields & {
  /** True when safe to show payments / format money for this store */
  resolved: boolean;
};

/** Common BCP-47 tags when store.locale is omitted but countryCode is set */
const LOCALE_BY_COUNTRY: Record<string, string> = {
  IN: 'en-IN',
  DE: 'de-DE',
  AT: 'de-AT',
  CH: 'de-CH',
  FR: 'fr-FR',
  BE: 'fr-BE',
  NL: 'nl-NL',
  ES: 'es-ES',
  IT: 'it-IT',
  PT: 'pt-PT',
  PL: 'pl-PL',
  SE: 'sv-SE',
  DK: 'da-DK',
  FI: 'fi-FI',
  IE: 'en-IE',
  GB: 'en-GB',
  US: 'en-US',
};

/** ISO 4217 when store.currency is omitted but country is known (seed always sets currency) */
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  IN: 'INR',
  DE: 'EUR',
  AT: 'EUR',
  FR: 'EUR',
  BE: 'EUR',
  NL: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  PT: 'EUR',
  IE: 'EUR',
  FI: 'EUR',
  PL: 'PLN',
  SE: 'SEK',
  DK: 'DKK',
  CH: 'CHF',
  GB: 'GBP',
  US: 'USD',
};

export type StoreMarketSource = {
  currency?: string | null;
  locale?: string | null;
  countryCode?: string | null;
} | null | undefined;

function normalizeCountry(code?: string | null): string | null {
  const c = (code ?? '').trim().toUpperCase();
  if (!c || c === 'IN') return null; // India legacy cart path uses null
  return c;
}

/**
 * Full market resolution from a store entity.
 * Prefer explicit store fields; only fill gaps from country tables.
 */
export function resolveStoreMarket(store?: StoreMarketSource): ResolvedStoreMarket {
  if (!store) {
    return { currency: 'INR', locale: 'en-IN', countryCode: null, resolved: false };
  }

  const raw = (store.countryCode ?? '').trim().toUpperCase();
  const isIndia = !raw || raw === 'IN';
  const countryCode = isIndia ? null : raw;

  if (isIndia) {
    return {
      currency: (store.currency || 'INR').toUpperCase(),
      locale: store.locale || 'en-IN',
      countryCode: null,
      resolved: true,
    };
  }

  const currency =
    (store.currency && store.currency.trim().toUpperCase()) ||
    CURRENCY_BY_COUNTRY[countryCode!] ||
    '';
  const locale =
    (store.locale && store.locale.trim()) ||
    LOCALE_BY_COUNTRY[countryCode!] ||
    `en-${countryCode}`;

  if (!currency) {
    return {
      currency: 'XXX',
      locale,
      countryCode,
      resolved: false,
    };
  }

  return {
    currency,
    locale,
    countryCode,
    resolved: true,
  };
}

/**
 * Payload for cart `setStoreCurrency` — always from store record resolution.
 * Unresolved non-IN stores still return best-effort fields; check resolveStoreMarket().resolved before charging.
 */
export function storeCurrencyPayload(store?: StoreMarketSource): {
  currency: string;
  locale: string;
  countryCode: string | null;
} {
  const m = resolveStoreMarket(store);
  return {
    currency: m.currency,
    locale: m.locale,
    countryCode: m.countryCode,
  };
}

/** Whether cart market fields may be used for payments (synced + resolved store). */
export function isStoreMarketReady(
  marketSynced: boolean,
  store?: StoreMarketSource
): boolean {
  if (!marketSynced) return false;
  return resolveStoreMarket(store).resolved;
}
