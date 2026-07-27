import React, { useState, useEffect, useCallback } from 'react';
import { useGetActiveStoresQuery, type Store } from '../store/api/storeApi';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSelectedStore, setStoreCurrency, selectSelectedStoreId, selectSelectedStoreName } from '../store/slices/cartSlice';
import { storeCurrencyPayload, resolveStoreMarket } from '../utils/storeCurrency';
import { getTabStore, setTabStore } from '../utils/tabStorage';

// Haversine formula — returns distance in km between two lat/lng points
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface DayOperatingHours {
  isOpen?: boolean;
  open?: string;
  close?: string;
  startTime?: string;
  endTime?: string;
}

type StoreWithHours = Store & {
  operatingHours?: Record<string, DayOperatingHours>;
};

// Checks if a store is currently open based on operatingHours
function isStoreOpen(store: StoreWithHours): boolean {
  if (!store.operatingHours) return true; // assume open if no hours data
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[new Date().getDay()];
  const hours = store.operatingHours[today];
  if (!hours?.isOpen && hours?.isOpen !== undefined) return false;
  if (!hours?.open && !hours?.startTime) return true; // no hours = assume open
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const openStr = hours.open ?? hours.startTime ?? '00:00';
  const closeStr = hours.close ?? hours.endTime ?? '23:59';
  const [oh, om] = openStr.split(':').map(Number);
  const [ch, cm] = closeStr.split(':').map(Number);
  return currentMins >= oh * 60 + om && currentMins <= ch * 60 + cm;
}

interface StoreSelectorProps {
  variant?: 'customer' | 'manager';
  onStoreChange?: (storeId: string, storeName: string) => void;
  contextKey?: string; // If provided, uses page-specific context instead of global Redux
}

const StoreSelector: React.FC<StoreSelectorProps> = ({ variant: _variant = 'customer', onStoreChange, contextKey }) => {
  const dispatch = useAppDispatch();

  // Use tabStorage-based store selection if contextKey is provided, otherwise use Redux
  const useLocalStorage = !!contextKey;

  const reduxStoreId = useAppSelector(selectSelectedStoreId);
  const reduxStoreName = useAppSelector(selectSelectedStoreName);

  // State for page-specific store selection (when contextKey is provided)
  const [localStoreId, setLocalStoreId] = useState<string>(() => {
    if (contextKey) {
      const stored = getTabStore(contextKey);
      return stored?.storeId || '';
    }
    return '';
  });

  const [localStoreName, setLocalStoreName] = useState<string>(() => {
    if (contextKey) {
      const stored = getTabStore(contextKey);
      return stored?.storeName || '';
    }
    return '';
  });

  const selectedStoreId = useLocalStorage ? localStoreId : reduxStoreId;
  const selectedStoreName = useLocalStorage ? localStoreName : reduxStoreName;

  const [isOpen, setIsOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  const { data: stores = [], isLoading, isError, error, refetch } = useGetActiveStoresQuery();

  const handleStoreSelect = useCallback((storeId: string, storeName: string, store?: StoreWithHours) => {
    // ALWAYS update Redux for API headers
    dispatch(setSelectedStore({ storeId, storeName }));
    // Market only when we have a full store record (never invent DE/EUR)
    if (store && resolveStoreMarket(store).resolved) {
      dispatch(setStoreCurrency(storeCurrencyPayload(store)));
    }

    if (useLocalStorage && contextKey) {
      // ALSO use page-specific tabStorage for local state
      setTabStore(contextKey, storeId, storeName);
      setLocalStoreId(storeId);
      setLocalStoreName(storeName);
    }

    // RTK Query will automatically refetch when storeId parameter changes
    // No need for manual invalidation - this prevents rate limiting

    setIsOpen(false);
    if (onStoreChange) {
      onStoreChange(storeId, storeName);
    }
  }, [dispatch, useLocalStorage, contextKey, onStoreChange]);

  // Auto-detect nearest open store via browser Geolocation API
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lon: longitude });

        // Auto-select nearest OPEN store only if nothing is currently selected
        if (!selectedStoreId && stores.length > 0) {
          const withDistance = stores
            .filter((s) => s.address?.latitude && s.address?.longitude)
            .map((s) => ({
              store: s,
              dist: haversineKm(latitude, longitude, s.address.latitude!, s.address.longitude!),
              open: isStoreOpen(s),
            }))
            .filter(x => x.open)
            .sort((a, b) => a.dist - b.dist);

          if (withDistance.length > 0) {
            const nearest = withDistance[0].store;
            handleStoreSelect(nearest.storeCode ?? nearest.id, nearest.name, nearest);
          }
        }
      },
      () => { /* silently fail if user denies location */ },
      { timeout: 5000, maximumAge: 60000 }
    );
  }, [stores, selectedStoreId, handleStoreSelect]);

  const buttonStyles: React.CSSProperties = {
    padding: '7px 14px',
    background: 'var(--surface-2)',
    color: 'var(--text-1)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    position: 'relative',
    minWidth: '180px',
    justifyContent: 'space-between',
    transition: 'border-color 0.2s ease',
    height: '36px',
  };

  const dropdownStyles: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '6px',
    minWidth: '320px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    maxHeight: '360px',
    overflowY: 'auto',
    zIndex: 9999,
    boxShadow: 'var(--shadow-card)',
    padding: '6px',
  };

  const storeItemStyles = (isSelected: boolean): React.CSSProperties => ({
    padding: '10px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    background: isSelected ? 'rgba(212,168,67,0.1)' : 'transparent',
    border: `1px solid ${isSelected ? 'var(--border-strong)' : 'transparent'}`,
    transition: 'all 0.15s ease',
    marginBottom: '2px',
  });

  const buttonLabel = isLoading
    ? 'Loading...'
    : isError
      ? 'Stores unavailable'
      : selectedStoreName || 'Select Store';

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={buttonStyles}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-invalid={isError || undefined}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.18)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', overflow: 'hidden' }}>
          {/* Pin icon */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: isError ? 'var(--text-3)' : selectedStoreId ? 'var(--text-1)' : 'var(--text-3)',
            maxWidth: '130px',
          }}>
            {buttonLabel}
          </span>
        </div>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {isOpen && !isLoading && (
        <div style={dropdownStyles}>
          {isError ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem' }}>
              <div style={{ marginBottom: '8px' }}>Could not load stores.</div>
              <button
                type="button"
                onClick={() => { void refetch(); }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-1, transparent)',
                  color: 'var(--gold, var(--text-1))',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                Retry
              </button>
              {error && 'status' in error ? (
                <div style={{ marginTop: '8px', fontSize: '0.72rem', opacity: 0.7 }}>
                  Error {String(error.status)}
                </div>
              ) : null}
            </div>
          ) : stores.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem' }}>
              No stores available
            </div>
          ) : (
            ([...stores].sort((a, b) => {
              if (!userLocation) return 0;
              const da = a.address?.latitude != null && a.address?.longitude != null
                ? haversineKm(userLocation.lat, userLocation.lon, a.address.latitude, a.address.longitude) : 999;
              const db = b.address?.latitude != null && b.address?.longitude != null
                ? haversineKm(userLocation.lat, userLocation.lon, b.address.latitude, b.address.longitude) : 999;
              return da - db;
            })).map((store) => {
              const isSelected = selectedStoreId === store.storeCode;
              const open = isStoreOpen(store);
              const dist = userLocation && store.address?.latitude && store.address?.longitude
                ? haversineKm(userLocation.lat, userLocation.lon, store.address.latitude, store.address.longitude)
                : null;
              return (
                <div
                  key={store.id}
                  onClick={() => handleStoreSelect(store.storeCode, store.name, store)}
                  style={storeItemStyles(isSelected)}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(212,168,67,0.05)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Selected indicator */}
                    <div style={{
                      width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--gold)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#000' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginBottom: '2px' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>
                          {store.name}
                        </span>
                        {dist !== null && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{dist.toFixed(1)} km</span>
                        )}
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px',
                          background: open ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                          color: open ? '#4ade80' : '#f87171',
                          border: `1px solid ${open ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
                        }}>
                          {open ? 'OPEN' : 'CLOSED'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                        {store.address.city}, {store.address.state}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Overlay to close dropdown when clicking outside */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9998,
          }}
        />
      )}
    </div>
  );
};

export default StoreSelector;
