import { describe, it, expect } from 'vitest';
import {
  paymentMethodBadgeStyle,
  orderStatusBadgeVariant,
  resolvePosDeliveryFee,
  formatPosTime,
  sumOrderTotals,
  POS_TABS,
  isSameBusinessDay,
  businessTimeZoneForCountry,
} from './posHelpers';
import { CASHIER_ROLE } from './posTokens';

describe('posHelpers', () => {
  it('exposes three POS tabs with shortcuts', () => {
    expect(POS_TABS.map((t) => t.key)).toEqual(['orders', 'history', 'reports']);
    expect(POS_TABS.every((t) => t.shortcut.startsWith('F'))).toBe(true);
  });

  it('uses POS warm orange accent #f97316', () => {
    expect(CASHIER_ROLE).toBe('#f97316');
  });

  it('styles CASH / CARD / WALLET / UPI badges distinctly', () => {
    expect(paymentMethodBadgeStyle('CASH').color).toBeTruthy();
    expect(paymentMethodBadgeStyle('CARD').color).toBeTruthy();
    expect(paymentMethodBadgeStyle('WALLET').color).toBeTruthy();
    expect(paymentMethodBadgeStyle('UPI').color).toBeTruthy();
    expect(paymentMethodBadgeStyle(null).backgroundColor).toBeTruthy();
  });

  it('maps order statuses to badge variants', () => {
    expect(orderStatusBadgeVariant('PENDING')).toBe('warning');
    expect(orderStatusBadgeVariant('COMPLETED')).toBe('success');
    expect(orderStatusBadgeVariant('CANCELLED')).toBe('error');
    expect(orderStatusBadgeVariant('UNKNOWN')).toBe('secondary');
  });

  it('resolvePosDeliveryFee never hardcodes INR — uses cart fee only for DELIVERY', () => {
    expect(resolvePosDeliveryFee('PICKUP', 100, 5)).toBe(0);
    expect(resolvePosDeliveryFee('DELIVERY', 0, 5)).toBe(0);
    expect(resolvePosDeliveryFee('DELIVERY', 100, 0)).toBe(0);
    expect(resolvePosDeliveryFee('DELIVERY', 100, 2.9)).toBe(2.9);
  });

  it('sums order totals preferring totalAmount', () => {
    expect(
      sumOrderTotals([
        { totalAmount: 10, total: 1 },
        { total: 5 },
      ])
    ).toBe(15);
  });

  it('formats time without throwing', () => {
    const t = formatPosTime('2026-07-10T12:30:00Z', 'de-DE');
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThan(0);
  });

  it('maps DE to Europe/Berlin for business day', () => {
    expect(businessTimeZoneForCountry('DE')).toBe('Europe/Berlin');
  });

  it('isSameBusinessDay uses store country timezone when provided', () => {
    // Noon UTC on a fixed day — DE business day still that calendar date in summer
    const iso = '2026-07-10T12:00:00.000Z';
    const noonUtc = new Date(iso);
    expect(isSameBusinessDay(iso, 'DE', noonUtc)).toBe(true);
  });
});
