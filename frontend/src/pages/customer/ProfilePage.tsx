import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { selectCartCurrency, selectCartLocale, selectStoreCountryCode } from '../../store/slices/cartSlice';
import { formatMajorAmount } from '../../utils/currency';
import {
  isValidCustomerPhone,
  normalizePhoneForApi,
  defaultAddressCountry,
  postalPlaceholder,
} from '../../utils/customerFormValidation';
import {
  useGetCustomerByUserIdQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useAddAddressMutation,
  useUpdateAddressMutation,
  useRemoveAddressMutation,
  useSetDefaultAddressMutation,
  useUpdatePreferencesMutation,
  UpdateCustomerRequest,
  AddAddressRequest,
  UpdatePreferencesRequest,
  type CustomerAddress,
} from '../../store/api/customerApi';
import { getApiErrorMessage } from '../utils/apiError';
import AppHeader from '../../components/common/AppHeader';
import { AllergenType, ALLERGEN_LABELS, ALL_ALLERGENS } from '../../constants/allergens';

// ─── Nav items ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'Overview',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    id: 'personal',
    label: 'Personal Info',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    id: 'addresses',
    label: 'Addresses',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
      </svg>
    ),
  },
  {
    id: 'preferences',
    label: 'Food Preferences',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
        <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
      </svg>
    ),
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
  },
];

// ─── Tier config ──────────────────────────────────────────────────────────────
const TIER_CONFIG = {
  BRONZE:   { gradient: 'linear-gradient(135deg, #2A1A0A 0%, #3D2410 50%, #1A0E05 100%)', accent: '#CD7F32', accentLight: '#E8A96A', label: 'Bronze', next: 'SILVER', threshold: 1000 },
  SILVER:   { gradient: 'linear-gradient(135deg, #1A1A24 0%, #2A2A38 50%, #12121C 100%)', accent: '#C0C0C0', accentLight: '#E8E8F0', label: 'Silver', next: 'GOLD', threshold: 5000 },
  GOLD:     { gradient: 'linear-gradient(135deg, #1C1600 0%, #2E2200 50%, #100D00 100%)', accent: '#D4A843', accentLight: '#E8C860', label: 'Gold', next: 'PLATINUM', threshold: 10000 },
  PLATINUM: { gradient: 'linear-gradient(135deg, #0D0D14 0%, #1A1A28 50%, #06060C 100%)', accent: '#E8E4FF', accentLight: '#FFFFFF', label: 'Platinum', next: null, threshold: null },
};

// ─── Component ────────────────────────────────────────────────────────────────
const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentUser = useAppSelector(selectCurrentUser);
  const currency = useAppSelector(selectCartCurrency);
  const locale = useAppSelector(selectCartLocale);
  const storeCountryCode = useAppSelector(selectStoreCountryCode);
  // Form copy from selected store country only (null = India legacy helpers)
  const formCountry = storeCountryCode;
  const [activeSection, setActiveSection] = useState(() => searchParams.get('section') || 'overview');
  const [editing, setEditing] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [editingPreferences, setEditingPreferences] = useState(false);

  const [profileForm, setProfileForm] = useState<UpdateCustomerRequest>({});
  const [addressForm, setAddressForm] = useState<AddAddressRequest>({
    label: 'HOME', addressLine1: '', city: '', state: '', postalCode: '', country: defaultAddressCountry(null),
  });
  const [preferencesForm, setPreferencesForm] = useState<UpdatePreferencesRequest>({});
  const [notifForm, setNotifForm] = useState({
    notifyOnOffers: true,
    notifyOnOrderStatus: true,
    marketingOptIn: false,
    smsOptIn: false,
    // Channels
    pushEnabled: true,
    emailEnabled: true,
    inAppEnabled: true,
    // Quiet hours
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '08:00',
  });
  const [notifSaved, setNotifSaved] = useState(false);

  const { data: customer, isLoading, error, refetch } = useGetCustomerByUserIdQuery(currentUser?.id || '', { skip: !currentUser?.id });
  const [createCustomer, { isLoading: isCreating }] = useCreateCustomerMutation();
  const [updateCustomer] = useUpdateCustomerMutation();
  const [addAddress] = useAddAddressMutation();
  const [updateAddress] = useUpdateAddressMutation();
  const [removeAddress] = useRemoveAddressMutation();
  const [setDefaultAddress] = useSetDefaultAddressMutation();
  const [updatePreferences] = useUpdatePreferencesMutation();

  const hasAttemptedCreate = React.useRef(false);
  const [creatingProfile, setCreatingProfile] = React.useState(false);
  const [creationError, setCreationError] = React.useState<string | null>(null);

  useEffect(() => {
    const autoCreate = async () => {
      if (error && currentUser && !hasAttemptedCreate.current && !customer) {
        hasAttemptedCreate.current = true;
        setCreatingProfile(true);
        const rawPhone = currentUser.phone || '';
        const cleanPhone = normalizePhoneForApi(rawPhone);
        // EU demo: accept E.164 / local; skip auto-create only when phone is unusable
        if (!isValidCustomerPhone(rawPhone) && !isValidCustomerPhone(cleanPhone)) {
          setCreationError('Add a valid phone number to finish setting up your profile.');
          setCreatingProfile(false);
          return;
        }
        try {
          await createCustomer({
            userId: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            phone: cleanPhone || rawPhone,
            marketingOptIn: false,
            smsOptIn: false,
          }).unwrap();
          setTimeout(async () => { await refetch(); setCreatingProfile(false); }, 500);
        } catch (err: unknown) {
          const msg = getApiErrorMessage(err, '');
          setCreationError(msg.includes('already exists') ? 'A profile with your phone/email already exists. Contact support.' : 'Unable to create profile. Please try again.');
          setCreatingProfile(false);
        }
      }
    };
    autoCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, currentUser?.id]);

  useEffect(() => {
    if (customer && !editing) {
      setProfileForm({ name: customer.name, email: customer.email, phone: customer.phone, dateOfBirth: customer.dateOfBirth, gender: customer.gender });
    }
  }, [customer, editing]);

  useEffect(() => {
    if (customer && !editingPreferences) {
      setPreferencesForm({
        spiceLevel: customer.preferences?.spiceLevel || 'MEDIUM',
        cuisinePreferences: customer.preferences?.cuisinePreferences || [],
        dietaryRestrictions: customer.preferences?.dietaryRestrictions || [],
        allergenAlerts: customer.preferences?.allergenAlerts || [],
        preferredPaymentMethod: customer.preferences?.preferredPaymentMethod || '',
        notifyOnOffers: customer.preferences?.notifyOnOffers !== false,
        notifyOnOrderStatus: customer.preferences?.notifyOnOrderStatus !== false,
      });
      setNotifForm((prev) => ({
        ...prev,
        notifyOnOffers: customer.preferences?.notifyOnOffers !== false,
        notifyOnOrderStatus: customer.preferences?.notifyOnOrderStatus !== false,
        marketingOptIn: customer.marketingOptIn || false,
        smsOptIn: customer.smsOptIn || false,
      }));
    }
  }, [customer, editingPreferences]);

  const handleUpdateProfile = async () => {
    if (!customer) return;
    try { await updateCustomer({ id: customer.id, data: profileForm }).unwrap(); setEditing(false); }
    catch { alert('Failed to update profile. Please try again.'); }
  };

  const handleSaveNotifications = async () => {
    if (!customer) return;
    try {
      await updateCustomer({ id: customer.id, data: { marketingOptIn: notifForm.marketingOptIn, smsOptIn: notifForm.smsOptIn } }).unwrap();
      await updatePreferences({ customerId: customer.id, data: { ...preferencesForm, notifyOnOffers: notifForm.notifyOnOffers, notifyOnOrderStatus: notifForm.notifyOnOrderStatus } }).unwrap();
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2500);
    } catch { alert('Failed to save notification settings.'); }
  };

  const handleAddOrUpdateAddress = async () => {
    if (!customer) return;
    try {
      if (editingAddressId) await updateAddress({ customerId: customer.id, addressId: editingAddressId, data: addressForm }).unwrap();
      else await addAddress({ customerId: customer.id, data: addressForm }).unwrap();
      setAddressForm({ label: 'HOME', addressLine1: '', city: '', state: '', postalCode: '', country: defaultAddressCountry(formCountry) });
      setAddressDialogOpen(false); setEditingAddressId(null);
    } catch { alert('Failed to save address.'); }
  };

  const handleEditAddress = (address: CustomerAddress) => {
    setAddressForm({ label: address.label, addressLine1: address.addressLine1, addressLine2: address.addressLine2, city: address.city, state: address.state, postalCode: address.postalCode, country: address.country, landmark: address.landmark });
    setEditingAddressId(address.id); setAddressDialogOpen(true);
  };

  const handleRemoveAddress = async (addressId: string) => {
    if (!customer || !window.confirm('Remove this address?')) return;
    try { await removeAddress({ customerId: customer.id, addressId }).unwrap(); }
    catch { alert('Failed to remove address.'); }
  };

  const handleSetDefaultAddress = async (addressId: string) => {
    if (!customer) return;
    try { await setDefaultAddress({ customerId: customer.id, addressId }).unwrap(); }
    catch { alert('Failed to set default address.'); }
  };

  const handleUpdatePreferences = async () => {
    if (!customer) return;
    try { await updatePreferences({ customerId: customer.id, data: preferencesForm }).unwrap(); setEditingPreferences(false); }
    catch { alert('Failed to update preferences.'); }
  };

  const toggleArrayItem = (arr: string[], item: string) => arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];

  // ─── Loading / error states ────────────────────────────────────────────────
  if (isLoading || isCreating || creatingProfile) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: 'var(--font-body)' }}>
        <AppHeader showPublicNav onCartClick={() => navigate('/menu')} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid var(--gold)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
            <p style={{ color: 'var(--text-3)', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>
              {isCreating || creatingProfile ? 'Setting up your profile…' : 'Loading…'}
            </p>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!customer && !isLoading && !creatingProfile && !isCreating) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: 'var(--font-body)' }}>
        <AppHeader showPublicNav onCartClick={() => navigate('/menu')} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)' }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 24px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 12 }}>Unable to Load Profile</h2>
            <p style={{ color: 'var(--text-3)', fontSize: '0.9rem', marginBottom: 28 }}>{creationError || "We couldn't load your customer profile."}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => window.location.reload()} style={{ background: 'var(--red)', color: 'var(--text-1)', border: 'none', borderRadius: 'var(--radius-pill)', padding: '10px 24px', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}>Retry</button>
              <button onClick={() => navigate('/menu')} style={{ background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '10px 24px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>Back to Menu</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!customer) return null;

  // ─── Computed values ───────────────────────────────────────────────────────
  const tier = customer.loyaltyInfo?.tier || 'BRONZE';
  const tierCfg = TIER_CONFIG[tier as keyof typeof TIER_CONFIG];
  const totalPoints = customer.loyaltyInfo?.totalPoints || 0;
  const nextThreshold = tierCfg.threshold;
  const progress = nextThreshold ? Math.min((totalPoints / nextThreshold) * 100, 100) : 100;
  const pointsToNext = nextThreshold ? Math.max(nextThreshold - totalPoints, 0) : 0;

  const cuisineOptions = ['Indian', 'Chinese', 'Italian', 'Mexican', 'Thai', 'Japanese', 'Continental', 'Mediterranean'];
  const dietaryOptions = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Nut-Free', 'Low-Carb', 'Keto', 'Halal'];
  const allergenOptions = ALL_ALLERGENS;

  // ─── Shared micro-components ───────────────────────────────────────────────
  const Field = ({ label, value, verified }: { label: string; value: string; verified?: boolean }) => (
    <div style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.95rem', color: 'var(--text-1)', fontWeight: 500 }}>{value || '—'}</span>
        {verified && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'var(--success-light)', fontWeight: 600, background: 'rgba(74,222,128,0.1)', padding: '2px 8px', borderRadius: 99 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Verified
          </span>
        )}
      </div>
    </div>
  );

  const Input = ({ label, type = 'text', value, onChange, placeholder }: { label: string; type?: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', fontSize: '0.9rem', color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
      />
    </div>
  );

  const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', fontSize: '0.9rem', color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
      >
        {options.map(o => <option key={o.value} value={o.value} style={{ background: 'var(--surface-2)' }}>{o.label}</option>)}
      </select>
    </div>
  );

  const PillToggle = ({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{
        padding: '7px 16px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
        border: selected ? '1px solid var(--gold)' : '1px solid var(--border)',
        background: selected ? 'rgba(212,168,67,0.12)' : 'var(--surface-2)',
        color: selected ? 'var(--gold)' : 'var(--text-3)',
        transition: 'all 0.15s ease',
        fontFamily: 'var(--font-body)',
      }}
    >{label}</button>
  );

  const Toggle = ({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0, width: 48, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer',
          background: checked ? 'var(--gold)' : 'var(--surface-3)',
          position: 'relative', transition: 'background 0.2s ease',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: checked ? 24 : 3, width: 20, height: 20,
          borderRadius: '50%', background: 'var(--text-1)', transition: 'left 0.2s ease',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }} />
      </button>
    </div>
  );

  // ─── Sections ──────────────────────────────────────────────────────────────
  const renderOverview = () => (
    <div>
      {/* Loyalty card */}
      <div style={{
        borderRadius: 20, padding: '28px 32px', marginBottom: 24, position: 'relative', overflow: 'hidden',
        background: tierCfg.gradient,
        border: `1px solid ${tierCfg.accent}28`,
        boxShadow: `0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px ${tierCfg.accent}18`,
      }}>
        {/* Holographic shimmer overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.03) 50%, transparent 70%)', pointerEvents: 'none' }} />
        {/* Decorative circle */}
        <div style={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: '50%', border: `1px solid ${tierCfg.accent}18`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%', border: `1px solid ${tierCfg.accent}10`, pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, position: 'relative' }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', color: `${tierCfg.accent}99`, textTransform: 'uppercase', marginBottom: 8 }}>Loyalty Balance</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 700, color: tierCfg.accentLight, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {totalPoints.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: `${tierCfg.accent}88`, marginTop: 4 }}>points</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'inline-block', padding: '6px 18px', borderRadius: 99, border: `1px solid ${tierCfg.accent}55`, background: `${tierCfg.accent}18`, marginBottom: 8 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: tierCfg.accentLight, textTransform: 'uppercase' }}>{tierCfg.label}</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: `${tierCfg.accent}66` }}>
              Since {new Date(customer.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {tierCfg.next && (
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '0.72rem', color: `${tierCfg.accent}88`, fontWeight: 600 }}>{pointsToNext.toLocaleString()} pts to {tierCfg.next}</span>
              <span style={{ fontSize: '0.72rem', color: `${tierCfg.accent}66` }}>{Math.round(progress)}%</span>
            </div>
            <div style={{ height: 6, background: `${tierCfg.accent}20`, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg, ${tierCfg.accent}, ${tierCfg.accentLight})`, borderRadius: 99, transition: 'width 0.8s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              {['Bronze', 'Silver', 'Gold', 'Platinum'].map((t) => (
                <span key={t} style={{ fontSize: '0.65rem', color: t === tierCfg.label ? tierCfg.accentLight : `${tierCfg.accent}55`, fontWeight: t === tierCfg.label ? 700 : 400 }}>{t}</span>
              ))}
            </div>
          </div>
        )}
        {!tierCfg.next && (
          <div style={{ fontSize: '0.8rem', color: tierCfg.accentLight, fontWeight: 600, textAlign: 'center', padding: '8px 0' }}>Maximum tier achieved</div>
        )}
      </div>

      {/* Stats row */}
      {customer.orderStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Orders', value: customer.orderStats.totalOrders, format: (v: number) => v.toString() },
            { label: 'Total Spent', value: customer.orderStats.totalSpent, format: (v: number) => formatMajorAmount(v , currency, locale) },
            { label: 'Avg Order', value: customer.orderStats.averageOrderValue, format: (v: number) => formatMajorAmount(v , currency, locale) },
          ].map((stat) => (
            <div key={stat.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 16px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--gold)', marginBottom: 4, letterSpacing: '-0.02em' }}>{stat.format(stat.value)}</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Quick info */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase' }}>Account</span>
          <button onClick={() => setActiveSection('personal')} style={{ fontSize: '0.75rem', color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Edit →</button>
        </div>
        <Field label="Name" value={customer.name} />
        <Field label="Email" value={customer.email} verified={customer.emailVerified} />
        <Field label="Phone" value={customer.phone} verified={customer.phoneVerified} />
      </div>

      {/* Point history */}
      {customer.loyaltyInfo?.pointHistory?.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 16 }}>Recent Points Activity</div>
          {customer.loyaltyInfo.pointHistory.slice(0, 5).map((tx) => (
            <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-1)', fontWeight: 500, marginBottom: 2 }}>{tx.description}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{new Date(tx.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
              <span style={{
                fontSize: '0.9rem', fontWeight: 700,
                color: tx.type === 'EARNED' || tx.type === 'BONUS' ? 'var(--success-light)' : tx.type === 'REDEEMED' ? 'var(--red-light)' : 'var(--text-3)',
              }}>
                {tx.type === 'EARNED' || tx.type === 'BONUS' ? '+' : '−'}{Math.abs(tx.points)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPersonal = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Personal Info</h2>
          <p style={{ color: 'var(--text-3)', fontSize: '0.8rem', margin: '4px 0 0' }}>Manage your account details</p>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: 'var(--radius-pill)', padding: '8px 20px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Edit</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditing(false)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 'var(--radius-pill)', padding: '8px 18px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleUpdateProfile} style={{ background: 'var(--red)', border: 'none', color: 'var(--text-1)', borderRadius: 'var(--radius-pill)', padding: '8px 20px', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Save Changes</button>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px' }}>
        {editing ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input label="Full Name" value={profileForm.name || ''} onChange={v => setProfileForm(p => ({ ...p, name: v }))} />
              <Input label="Email" type="email" value={profileForm.email || ''} onChange={v => setProfileForm(p => ({ ...p, email: v }))} />
              <Input label="Phone" type="tel" value={profileForm.phone || ''} onChange={v => setProfileForm(p => ({ ...p, phone: v }))} />
              <Input label="Date of Birth" type="date" value={profileForm.dateOfBirth || ''} onChange={v => setProfileForm(p => ({ ...p, dateOfBirth: v }))} />
            </div>
            <Select
              label="Gender"
              value={profileForm.gender || ''}
              onChange={v => setProfileForm(p => ({ ...p, gender: v }))}
              options={[
                { label: 'Select gender', value: '' },
                { label: 'Male', value: 'MALE' },
                { label: 'Female', value: 'FEMALE' },
                { label: 'Other', value: 'OTHER' },
                { label: 'Prefer not to say', value: 'PREFER_NOT_TO_SAY' },
              ]}
            />
          </div>
        ) : (
          <div>
            <Field label="Full Name" value={customer.name} />
            <Field label="Email" value={customer.email} verified={customer.emailVerified} />
            <Field label="Phone" value={customer.phone} verified={customer.phoneVerified} />
            <Field label="Date of Birth" value={customer.dateOfBirth ? new Date(customer.dateOfBirth).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''} />
            <div style={{ padding: '16px 0' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Gender</div>
              <span style={{ fontSize: '0.95rem', color: 'var(--text-1)', fontWeight: 500 }}>{customer.gender?.replace(/_/g, ' ') || '—'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Member since */}
      <div style={{ marginTop: 16, padding: '14px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Member Since</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-1)', fontWeight: 500 }}>{new Date(customer.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        {customer.lastOrderDate && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Last Order</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-1)', fontWeight: 500 }}>{new Date(customer.lastOrderDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </div>
        )}
      </div>
    </div>
  );

  const renderAddresses = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Saved Addresses</h2>
          <p style={{ color: 'var(--text-3)', fontSize: '0.8rem', margin: '4px 0 0' }}>Manage your delivery locations</p>
        </div>
        <button
          onClick={() => { setEditingAddressId(null); setAddressForm({ label: 'HOME', addressLine1: '', city: '', state: '', postalCode: '', country: defaultAddressCountry(formCountry) }); setAddressDialogOpen(true); }}
          style={{ background: 'var(--red)', border: 'none', color: 'var(--text-1)', borderRadius: 'var(--radius-pill)', padding: '8px 20px', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
        >
          + Add Address
        </button>
      </div>

      {customer.addresses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: '0.9rem', marginBottom: 20 }}>No addresses saved yet. Add one for faster checkout.</p>
          <button
            onClick={() => { setAddressDialogOpen(true); }}
            style={{ background: 'rgba(198,42,9,0.1)', border: '1px solid rgba(198,42,9,0.3)', color: 'var(--red-light)', borderRadius: 'var(--radius-pill)', padding: '9px 22px', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Add First Address
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {customer.addresses.map((address) => (
            <div key={address.id} style={{ background: 'var(--surface)', border: address.isDefault ? '1px solid rgba(212,168,67,0.35)' : '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', position: 'relative' }}>
              {address.isDefault && (
                <span style={{ position: 'absolute', top: 16, right: 20, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--gold)', background: 'rgba(212,168,67,0.12)', padding: '3px 10px', borderRadius: 99, textTransform: 'uppercase' }}>Default</span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em' }}>{address.label}</span>
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-1)', lineHeight: 1.6, marginBottom: 14 }}>
                {address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ''}<br />
                {address.city}, {address.state} — {address.postalCode}<br />
                {address.country}
                {address.landmark && <><br /><span style={{ color: 'var(--text-3)', fontSize: '0.8rem' }}>Near {address.landmark}</span></>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleEditAddress(address)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 8, padding: '6px 16px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>Edit</button>
                {!address.isDefault && <button onClick={() => handleSetDefaultAddress(address.id)} style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)', color: 'var(--gold)', borderRadius: 8, padding: '6px 16px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>Set Default</button>}
                <button onClick={() => handleRemoveAddress(address.id)} style={{ background: 'rgba(198,42,9,0.07)', border: '1px solid rgba(198,42,9,0.2)', color: 'var(--red-light)', borderRadius: 8, padding: '6px 16px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPreferences = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Food Preferences</h2>
          <p style={{ color: 'var(--text-3)', fontSize: '0.8rem', margin: '4px 0 0' }}>We'll personalize your experience</p>
        </div>
        {!editingPreferences ? (
          <button onClick={() => setEditingPreferences(true)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: 'var(--radius-pill)', padding: '8px 20px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Edit</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditingPreferences(false)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 'var(--radius-pill)', padding: '8px 18px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleUpdatePreferences} style={{ background: 'var(--red)', border: 'none', color: 'var(--text-1)', borderRadius: 'var(--radius-pill)', padding: '8px 20px', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Save</button>
          </div>
        )}
      </div>

      {/* Spice level */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 12 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 14 }}>Spice Level</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['MILD', 'MEDIUM', 'HOT', 'EXTRA_HOT'].map(level => (
            <PillToggle key={level} label={level.replace('_', ' ')} selected={(preferencesForm.spiceLevel || 'MEDIUM') === level} onClick={() => editingPreferences && setPreferencesForm(p => ({ ...p, spiceLevel: level }))} />
          ))}
        </div>
      </div>

      {/* Preferred payment */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 12 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 14 }}>Preferred Payment</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { v: 'CASH', l: 'Cash' },
            { v: 'CARD', l: 'Card' },
            // UPI is India-only; Berlin/EU demo omits it (see utils/paymentMethods)
            { v: 'WALLET', l: 'Wallet' },
          ].map(opt => (
            <PillToggle key={opt.v} label={opt.l} selected={preferencesForm.preferredPaymentMethod === opt.v} onClick={() => editingPreferences && setPreferencesForm(p => ({ ...p, preferredPaymentMethod: opt.v }))} />
          ))}
        </div>
      </div>

      {/* Cuisines */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 12 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 14 }}>Cuisine Preferences</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {cuisineOptions.map(c => (
            <PillToggle key={c} label={c} selected={(preferencesForm.cuisinePreferences || []).includes(c)} onClick={() => editingPreferences && setPreferencesForm(p => ({ ...p, cuisinePreferences: toggleArrayItem(p.cuisinePreferences || [], c) }))} />
          ))}
        </div>
      </div>

      {/* Dietary */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 12 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 14 }}>Dietary Restrictions</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {dietaryOptions.map(d => (
            <PillToggle key={d} label={d} selected={(preferencesForm.dietaryRestrictions || []).includes(d)} onClick={() => editingPreferences && setPreferencesForm(p => ({ ...p, dietaryRestrictions: toggleArrayItem(p.dietaryRestrictions || [], d) }))} />
          ))}
        </div>
      </div>

      {/* Allergens */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--red-light)', textTransform: 'uppercase', marginBottom: 6 }}>Allergens</div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 14 }}>We'll warn you if any item contains these</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {allergenOptions.map((a: AllergenType) => {
            const sel = (preferencesForm.allergenAlerts || []).includes(a);
            return (
              <button
                key={a}
                onClick={() => editingPreferences && setPreferencesForm(p => ({ ...p, allergenAlerts: toggleArrayItem(p.allergenAlerts || [], a) as typeof p.allergenAlerts }))}
                style={{
                  padding: '7px 16px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 600, cursor: editingPreferences ? 'pointer' : 'default',
                  border: sel ? '1px solid rgba(229,62,62,0.5)' : '1px solid var(--border)',
                  background: sel ? 'rgba(229,62,62,0.1)' : 'var(--surface-2)',
                  color: sel ? 'var(--red-light)' : 'var(--text-3)',
                  fontFamily: 'var(--font-body)',
                }}
              >{ALLERGEN_LABELS[a]}</button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderNotifications = () => {
    const ChannelCard = ({ icon, label, sublabel, field }: { icon: React.ReactNode; label: string; sublabel: string; field: 'pushEnabled' | 'emailEnabled' | 'inAppEnabled' | 'smsOptIn' }) => {
      const on = notifForm[field] as boolean;
      return (
        <div
          onClick={() => setNotifForm(p => ({ ...p, [field]: !p[field] }))}
          style={{
            padding: '16px 18px', borderRadius: 12, cursor: 'pointer',
            border: on ? '1px solid rgba(212,168,67,0.4)' : '1px solid var(--border)',
            background: on ? 'rgba(212,168,67,0.06)' : 'var(--surface-2)',
            transition: 'all 0.15s ease',
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: on ? 'rgba(212,168,67,0.12)' : 'var(--surface)', border: `1px solid ${on ? 'rgba(212,168,67,0.3)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: on ? 'var(--gold)' : 'var(--text-3)' }}>
              {icon}
            </div>
            <div style={{ width: 38, height: 22, borderRadius: 99, background: on ? 'var(--gold)' : 'var(--surface-3)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: 3, left: on ? 18 : 3, width: 16, height: 16, borderRadius: '50%', background: 'var(--text-1)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: on ? 'var(--text-1)' : 'var(--text-2)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', lineHeight: 1.4 }}>{sublabel}</div>
          </div>
        </div>
      );
    };

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Notifications</h2>
            <p style={{ color: 'var(--text-3)', fontSize: '0.8rem', margin: '4px 0 0' }}>Control what we send you and how</p>
          </div>
          {notifSaved && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 99, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: 'var(--success-light)', fontSize: '0.8rem', fontWeight: 700 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Saved
            </div>
          )}
        </div>

        {/* Delivery channels */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 24px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase' }}>Delivery Channels</div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.5 }}>Choose how you receive notifications. You can enable multiple channels.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <ChannelCard
              field="pushEnabled"
              label="Push Notifications"
              sublabel="Instant alerts on your device"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              }
            />
            <ChannelCard
              field="emailEnabled"
              label="Email"
              sublabel="Receipts, updates to your inbox"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              }
            />
            <ChannelCard
              field="smsOptIn"
              label="SMS"
              sublabel="Text messages to your phone"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              }
            />
            <ChannelCard
              field="inAppEnabled"
              label="In-App"
              sublabel="Notification bell while browsing"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              }
            />
          </div>
        </div>

        {/* Order updates */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 24px', marginBottom: 12 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Order Updates</div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 18 }}>Stay informed about your orders in real time</p>
          <Toggle
            label="Order Status Alerts"
            description="Confirmations, prep updates, out for delivery, delivered"
            checked={notifForm.notifyOnOrderStatus}
            onChange={v => setNotifForm(p => ({ ...p, notifyOnOrderStatus: v }))}
          />
        </div>

        {/* Promotions & marketing */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 24px', marginBottom: 12 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Promotions & Offers</div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 18 }}>Deals, discounts, loyalty rewards, and campaign news</p>
          <Toggle
            label="Email Offers"
            description="Special deals and promotions sent to your email"
            checked={notifForm.notifyOnOffers}
            onChange={v => setNotifForm(p => ({ ...p, notifyOnOffers: v }))}
          />
          <Toggle
            label="Marketing Emails"
            description="New menu items, seasonal specials, and brand news"
            checked={notifForm.marketingOptIn}
            onChange={v => setNotifForm(p => ({ ...p, marketingOptIn: v }))}
          />
        </div>

        {/* Quiet hours */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 24px', marginBottom: 24 }}>
          <Toggle
            label="Quiet Hours"
            description="Pause non-critical notifications during selected hours"
            checked={notifForm.quietHoursEnabled}
            onChange={v => setNotifForm(p => ({ ...p, quietHoursEnabled: v }))}
          />
          {notifForm.quietHoursEnabled && (
            <div style={{ marginTop: 16, padding: '16px 18px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>Quiet window</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>From</label>
                  <input
                    type="time"
                    value={notifForm.quietStart}
                    onChange={e => setNotifForm(p => ({ ...p, quietStart: e.target.value }))}
                    style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: '0.9rem', color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Until</label>
                  <input
                    type="time"
                    value={notifForm.quietEnd}
                    onChange={e => setNotifForm(p => ({ ...p, quietEnd: e.target.value }))}
                    style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: '0.9rem', color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }}
                  />
                </div>
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginTop: 12 }}>
                Notifications paused from {notifForm.quietStart} to {notifForm.quietEnd}. Order status alerts are always delivered.
              </p>
            </div>
          )}
        </div>

        <button
          onClick={handleSaveNotifications}
          style={{
            width: '100%', background: 'linear-gradient(135deg, var(--red), var(--red-light))', border: 'none',
            color: 'var(--text-1)', borderRadius: 'var(--radius-pill)', padding: '14px',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.95rem',
            cursor: 'pointer', letterSpacing: '0.02em', transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        >
          Save Notification Settings
        </button>
      </div>
    );
  };

  const SECTION_RENDERERS: Record<string, () => React.ReactNode> = {
    overview: renderOverview,
    personal: renderPersonal,
    addresses: renderAddresses,
    preferences: renderPreferences,
    notifications: renderNotifications,
  };

  // ─── Address modal ─────────────────────────────────────────────────────────
  const AddressModal = () => (
    <div
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 24 }}
      onClick={() => { setAddressDialogOpen(false); setEditingAddressId(null); }}
    >
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '28px 32px', width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{editingAddressId ? 'Edit Address' : 'Add New Address'}</h3>
          <button onClick={() => { setAddressDialogOpen(false); setEditingAddressId(null); }} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-2)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <Select label="Label" value={addressForm.label} onChange={v => setAddressForm(p => ({ ...p, label: v }))} options={[{ label: 'Home', value: 'HOME' }, { label: 'Work', value: 'WORK' }, { label: 'Other', value: 'OTHER' }]} />
        <Input label="Address Line 1 *" value={addressForm.addressLine1} onChange={v => setAddressForm(p => ({ ...p, addressLine1: v }))} placeholder="House/Flat, Building name" />
        <Input label="Address Line 2" value={addressForm.addressLine2 || ''} onChange={v => setAddressForm(p => ({ ...p, addressLine2: v }))} placeholder="Street, Area" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input label="City *" value={addressForm.city} onChange={v => setAddressForm(p => ({ ...p, city: v }))} />
          <Input label="State *" value={addressForm.state} onChange={v => setAddressForm(p => ({ ...p, state: v }))} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input label="Postal Code *" value={addressForm.postalCode} onChange={v => setAddressForm(p => ({ ...p, postalCode: v }))} placeholder={postalPlaceholder(formCountry)} />
          <Input label="Country *" value={addressForm.country} onChange={v => setAddressForm(p => ({ ...p, country: v }))} />
        </div>
        <Input label="Landmark" value={addressForm.landmark || ''} onChange={v => setAddressForm(p => ({ ...p, landmark: v }))} placeholder="Nearby landmark" />

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={() => { setAddressDialogOpen(false); setEditingAddressId(null); }} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 'var(--radius-pill)', padding: '12px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleAddOrUpdateAddress}
            disabled={!addressForm.addressLine1 || !addressForm.city || !addressForm.state || !addressForm.postalCode}
            style={{ flex: 2, background: 'var(--red)', border: 'none', color: 'var(--text-1)', borderRadius: 'var(--radius-pill)', padding: '12px', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', opacity: (!addressForm.addressLine1 || !addressForm.city || !addressForm.state || !addressForm.postalCode) ? 0.5 : 1 }}
          >
            {editingAddressId ? 'Update Address' : 'Save Address'}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Main render ───────────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: 'var(--font-body)', color: 'var(--text-1)' }}>
      <AppHeader showPublicNav onCartClick={() => navigate('/menu')} />

      <div style={{ display: 'flex', maxWidth: 1160, margin: '0 auto', padding: '32px 24px', gap: 24, alignItems: 'flex-start' }}>

        {/* Left sidebar */}
        <div style={{ width: 240, flexShrink: 0, position: 'sticky', top: 88 }}>
          {/* Avatar */}
          <div style={{ textAlign: 'center', marginBottom: 24, padding: '20px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 12px',
              background: `linear-gradient(135deg, ${tierCfg.accent}40 0%, ${tierCfg.accent}15 100%)`,
              border: `2px solid ${tierCfg.accent}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={tierCfg.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--text-1)', marginBottom: 2 }}>{customer.name}</div>
            <div style={{ fontSize: '0.72rem', color: tierCfg.accent, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{tierCfg.label} Member</div>
          </div>

          {/* Nav */}
          <nav style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            {NAV_ITEMS.map((item, i) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px',
                    background: active ? 'rgba(212,168,67,0.08)' : 'transparent',
                    border: 'none',
                    borderLeft: active ? '2px solid var(--gold)' : '2px solid transparent',
                    borderBottom: i < NAV_ITEMS.length - 1 ? '1px solid var(--border)' : 'none',
                    color: active ? 'var(--gold)' : 'var(--text-3)',
                    cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: active ? 700 : 500,
                    fontSize: '0.85rem', textAlign: 'left', transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {SECTION_RENDERERS[activeSection]?.()}
        </div>
      </div>

      {addressDialogOpen && <AddressModal />}
    </div>
  );
};

export default ProfilePage;
