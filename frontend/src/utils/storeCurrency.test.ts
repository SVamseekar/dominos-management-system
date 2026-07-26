import { describe, it, expect } from 'vitest';
import {
  resolveStoreMarket,
  storeCurrencyPayload,
  isStoreMarketReady,
} from './storeCurrency';

describe('resolveStoreMarket', () => {
  it('is unresolved without a store', () => {
    expect(resolveStoreMarket(null).resolved).toBe(false);
    expect(resolveStoreMarket(undefined).resolved).toBe(false);
  });

  it('resolves India legacy when country is null or IN', () => {
    expect(resolveStoreMarket({ countryCode: null })).toEqual({
      currency: 'INR',
      locale: 'en-IN',
      countryCode: null,
      resolved: true,
    });
    expect(resolveStoreMarket({ countryCode: 'IN' }).countryCode).toBeNull();
    expect(resolveStoreMarket({ countryCode: 'IN' }).currency).toBe('INR');
  });

  it('uses explicit store currency/locale for DE (seed DOM001 shape)', () => {
    const m = resolveStoreMarket({
      countryCode: 'DE',
      currency: 'EUR',
      locale: 'de-DE',
    });
    expect(m).toEqual({
      currency: 'EUR',
      locale: 'de-DE',
      countryCode: 'DE',
      resolved: true,
    });
  });

  it('does not invent DE when store has no country', () => {
    expect(resolveStoreMarket({ currency: 'EUR', locale: 'de-DE' }).countryCode).toBeNull();
  });

  it('fills EUR for known eurozone country when currency omitted', () => {
    const m = resolveStoreMarket({ countryCode: 'FR' });
    expect(m.currency).toBe('EUR');
    expect(m.locale).toBe('fr-FR');
    expect(m.resolved).toBe(true);
  });

  it('storeCurrencyPayload matches resolve fields', () => {
    expect(
      storeCurrencyPayload({ countryCode: 'DE', currency: 'EUR', locale: 'de-DE' })
    ).toEqual({ currency: 'EUR', locale: 'de-DE', countryCode: 'DE' });
  });
});

describe('isStoreMarketReady', () => {
  it('requires marketSynced', () => {
    expect(
      isStoreMarketReady(false, { countryCode: 'DE', currency: 'EUR', locale: 'de-DE' })
    ).toBe(false);
    expect(
      isStoreMarketReady(true, { countryCode: 'DE', currency: 'EUR', locale: 'de-DE' })
    ).toBe(true);
  });
});
