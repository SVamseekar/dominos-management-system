/**
 * Shared POS market display — History / Reports / Metrics / Orders.
 * Money only after cart store market is synced from store profile.
 */
import { useCallback } from 'react';
import { useAppSelector } from '../../store/hooks';
import {
  selectCartCurrency,
  selectCartLocale,
  selectStoreCountryCode,
  selectStoreMarketSynced,
} from '../../store/slices/cartSlice';
import { formatMajorAmount } from '../../utils/currency';
import { formatOrderAmount, type OrderMoneyContext } from '../../utils/orderMoney';

export function usePosMarket() {
  const currency = useAppSelector(selectCartCurrency);
  const locale = useAppSelector(selectCartLocale);
  const storeCountryCode = useAppSelector(selectStoreCountryCode);
  const storeMarketSynced = useAppSelector(selectStoreMarketSynced);

  const marketReady = storeMarketSynced;

  const fmt = useCallback(
    (major: number) => {
      if (!marketReady) return '—';
      return formatMajorAmount(major, currency, locale);
    },
    [marketReady, currency, locale]
  );

  const fmtOrder = useCallback(
    (major: number, order?: OrderMoneyContext | null) => {
      if (!marketReady && !order?.currency) return '—';
      if (order) {
        return formatOrderAmount(major, order, currency, locale);
      }
      return formatMajorAmount(major, currency, locale);
    },
    [marketReady, currency, locale]
  );

  return {
    currency,
    locale,
    storeCountryCode,
    storeMarketSynced,
    marketReady,
    fmt,
    fmtOrder,
  };
}
