import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AddressAutocomplete from '../../components/common/AddressAutocomplete';
import { useAppSelector } from '../../store/hooks';
import {
  selectCartItems,
  selectCartSubtotal,
  selectCartItemCount,
  selectDeliveryFee,
  selectSelectedStoreId,
  selectSelectedStoreName,
  selectCartCurrency,
  selectCartLocale,
  selectStoreCountryCode,
} from '../../store/slices/cartSlice';
import { formatMajorAmount } from '../../utils/currency';
import { computePreCheckoutTotals, formatTaxDisplay } from '../../utils/orderTax';
import { getApiErrorMessage } from '../utils/apiError';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetCustomerByUserIdQuery,
  useAddAddressMutation,
  useRemoveAddressMutation,
  useSetDefaultAddressMutation,
  CustomerAddress,
} from '../../store/api/customerApi';
import {
  isValidCustomerPhone,
  isValidCustomerPostal,
  phonePlaceholder,
  postalPlaceholder,
  postalFieldLabel,
  phoneErrorMessage,
  postalErrorMessage,
  defaultAddressCountry,
  extractPostalFromAddressParts,
} from '../../utils/customerFormValidation';

interface GuestFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  specialInstructions: string;
  addressLabel: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  color: 'var(--text-1)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.9rem',
  outline: 'none',
  transition: 'var(--transition)',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--text-3)',
  fontSize: '0.72rem',
  fontWeight: 600,
  marginBottom: '5px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.1rem',
  fontWeight: 700,
  color: 'var(--text-1)',
  margin: '0 0 16px 0',
  paddingBottom: '10px',
  borderBottom: '1px solid var(--border)',
};

const GuestCheckoutPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cartItems = useAppSelector(selectCartItems);
  const subtotal = useAppSelector(selectCartSubtotal);
  const itemCount = useAppSelector(selectCartItemCount);
  const deliveryFee = useAppSelector(selectDeliveryFee);
  const currency = useAppSelector(selectCartCurrency);
  const locale = useAppSelector(selectCartLocale);
  const storeCountryCode = useAppSelector(selectStoreCountryCode);
  // Form copy from selected store country only (null = India legacy helpers)
  const formCountry = storeCountryCode;
  const currentUser = useAppSelector(selectCurrentUser);
  const selectedStoreId = useAppSelector(selectSelectedStoreId);
  const selectedStoreName = useAppSelector(selectSelectedStoreName);
  const fmt = (v: number) => formatMajorAmount(v , currency, locale);

  const isLoggedIn = !!currentUser;
  const isCustomer = currentUser?.type === 'CUSTOMER';
  const { tax, taxLabel, total } = computePreCheckoutTotals(
    subtotal,
    itemCount > 0 ? deliveryFee : 0,
    storeCountryCode
  );

  useEffect(() => {
    if (isLoggedIn && !isCustomer) {
      const userType = currentUser?.type;
      if (userType === 'MANAGER' || userType === 'ASSISTANT_MANAGER') {
        navigate('/manager', { replace: true });
      } else if (userType === 'STAFF') {
        navigate('/pos', { replace: true });
      } else if (userType === 'DRIVER') {
        navigate('/driver', { replace: true });
      }
    }
  }, [isLoggedIn, isCustomer, currentUser, navigate]);

  const { data: customerData, isLoading: isLoadingCustomer, error: customerError } = useGetCustomerByUserIdQuery(
    currentUser?.id || '',
    { skip: !isLoggedIn || !isCustomer }
  );

  React.useEffect(() => {
    console.log('GuestCheckoutPage Debug:', {
      isLoggedIn, isCustomer, currentUser, customerData,
      addresses: customerData?.addresses,
      addressCount: customerData?.addresses?.length,
      isLoadingCustomer, customerError,
    });
  }, [isLoggedIn, isCustomer, currentUser, customerData, isLoadingCustomer, customerError]);

  const [addAddress] = useAddAddressMutation();
  const [removeAddress] = useRemoveAddressMutation();
  const [setDefaultAddress] = useSetDefaultAddressMutation();

  const [selectedAddressId, setSelectedAddressId] = useState<string | 'new'>('new');
  const [saveNewAddress, setSaveNewAddress] = useState(true);

  const nameParts = currentUser?.name?.split(' ') || [];
  const defaultFirstName = nameParts[0] || '';
  const defaultLastName = nameParts.slice(1).join(' ') || '';

  const [formData, setFormData] = useState<GuestFormData>({
    firstName: defaultFirstName,
    lastName: defaultLastName,
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
    addressLine1: '',
    addressLine2: '',
    city: 'Hyderabad',
    state: 'Telangana',
    zipCode: '',
    specialInstructions: '',
    addressLabel: 'HOME',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Partial<GuestFormData>>({});
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null);
  const [deletingAddress, setDeletingAddress] = useState(false);

  useEffect(() => {
    if (customerData?.addresses && customerData.addresses.length > 0) {
      const validAddresses = customerData.addresses.filter(a => a && a.id && a.addressLine1);
      if (validAddresses.length > 0) {
        const defaultAddr = validAddresses.find(a => a.isDefault) || validAddresses[0];
        if (defaultAddr && defaultAddr.id) {
          setSelectedAddressId(defaultAddr.id);
        }
      }
    }
  }, [customerData]);

  useEffect(() => {
    if (selectedAddressId && selectedAddressId !== 'new' && customerData?.addresses) {
      const selectedAddress = customerData.addresses.find(a => a.id === selectedAddressId);
      if (selectedAddress) {
        setFormData(prev => ({
          ...prev,
          addressLine1: selectedAddress.addressLine1 || '',
          addressLine2: selectedAddress.addressLine2 || '',
          city: selectedAddress.city || '',
          state: selectedAddress.state || '',
          zipCode: selectedAddress.postalCode || '',
          addressLabel: selectedAddress.label || 'HOME',
        }));
      }
    } else if (selectedAddressId === 'new') {
      setFormData(prev => ({
        ...prev,
        addressLine1: '',
        addressLine2: '',
        city: 'Hyderabad',
        state: 'Telangana',
        zipCode: '',
        addressLabel: 'HOME',
      }));
    }
  }, [selectedAddressId, customerData?.addresses]);

  useEffect(() => {
    if (cartItems.length === 0) {
      navigate('/menu');
    }
  }, [cartItems, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setValidationErrors(prev => ({ ...prev, [name]: '' }));
    setError('');
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!customerData?.id) return;
    setDeletingAddress(true);
    try {
      await removeAddress({ customerId: customerData.id, addressId }).unwrap();
      if (selectedAddressId === addressId) setSelectedAddressId('new');
      setAddressToDelete(null);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to delete address. Please try again.'));
    } finally {
      setDeletingAddress(false);
    }
  };

  const handleSetDefaultAddress = async (addressId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!customerData?.id) return;
    try {
      await setDefaultAddress({ customerId: customerData.id, addressId }).unwrap();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to set default address. Please try again.'));
    }
  };

  const validateForm = (): boolean => {
    const errors: Partial<GuestFormData> = {};
    if (isCustomer) {
      if (!formData.phone.trim()) errors.phone = 'Phone number is required';
      else if (!isValidCustomerPhone(formData.phone)) {
        errors.phone = phoneErrorMessage(formCountry);
      }
    }
    if (isCustomer && selectedAddressId !== 'new') {
      setValidationErrors(errors);
      return Object.keys(errors).length === 0;
    }
    if (!formData.firstName.trim()) errors.firstName = 'First name is required';
    if (!formData.lastName.trim()) errors.lastName = 'Last name is required';
    if (!formData.email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Invalid email format';
    if (!formData.phone.trim()) errors.phone = 'Phone number is required';
    else if (!isValidCustomerPhone(formData.phone)) {
      errors.phone = phoneErrorMessage(formCountry);
    }
    if (!formData.addressLine1.trim()) errors.addressLine1 = 'Address is required';
    if (!formData.city.trim()) errors.city = 'City is required';
    if (!formData.state.trim()) errors.state = 'State / region is required';
    if (!formData.zipCode.trim()) errors.zipCode = 'Postal code is required';
    else if (!isValidCustomerPostal(formData.zipCode)) {
      errors.zipCode = postalErrorMessage(formCountry);
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;
    setLoading(true);
    try {
      let guestInfo;
      if (isCustomer && selectedAddressId !== 'new' && customerData?.addresses) {
        const savedAddress = customerData.addresses.find(a => a.id === selectedAddressId);
        if (savedAddress) {
          guestInfo = {
            name: currentUser?.name || '',
            email: currentUser?.email || '',
            phone: formData.phone,
            street: `${savedAddress.addressLine1}${savedAddress.addressLine2 ? ', ' + savedAddress.addressLine2 : ''}`,
            city: savedAddress.city,
            state: savedAddress.state,
            pincode: savedAddress.postalCode,
            deliveryInstructions: formData.specialInstructions,
          };
        }
      } else {
        guestInfo = {
          name: `${formData.firstName} ${formData.lastName}`,
          email: formData.email,
          phone: formData.phone,
          street: `${formData.addressLine1}${formData.addressLine2 ? ', ' + formData.addressLine2 : ''}`,
          city: formData.city,
          state: formData.state,
          pincode: formData.zipCode,
          deliveryInstructions: formData.specialInstructions,
        };
        if (isCustomer && saveNewAddress && customerData?.id) {
          try {
            await addAddress({
              customerId: customerData.id,
              data: {
                label: formData.addressLabel,
                addressLine1: formData.addressLine1,
                addressLine2: formData.addressLine2 || undefined,
                city: formData.city,
                state: formData.state,
                postalCode: formData.zipCode,
                country: defaultAddressCountry(formCountry),
                isDefault: !customerData.addresses || customerData.addresses.length === 0,
              },
            }).unwrap();
          } catch (err) {
            console.error('Failed to save address:', err);
          }
        }
      }
      navigate('/payment', { state: { guestInfo } });
    } catch (err: unknown) {
      console.error('Checkout error:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const savedAddresses = (customerData?.addresses || []).filter(a => a && a.id && a.addressLine1);

  const Field = ({
    label, name, type = 'text', placeholder, error: fieldError, disabled: fieldDisabled, value: fieldValue, helperText,
  }: { label: string; name: keyof GuestFormData; type?: string; placeholder?: string; error?: string; disabled?: boolean; value?: string; helperText?: string }) => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        value={fieldValue !== undefined ? fieldValue : formData[name]}
        onChange={handleChange}
        disabled={fieldDisabled ?? loading}
        style={{ ...inputStyle, borderColor: fieldError ? 'var(--red)' : 'var(--border)' }}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = fieldError ? 'var(--red)' : 'var(--gold)'; }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = fieldError ? 'var(--red)' : 'var(--border)'; }}
      />
      {(fieldError || helperText) && (
        <p style={{ color: fieldError ? 'var(--red-light)' : 'var(--text-3)', fontSize: '0.72rem', marginTop: '4px' }}>
          {fieldError || helperText}
        </p>
      )}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '48px 16px', fontFamily: 'var(--font-body)', color: 'var(--text-1)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* Page heading */}
        <div style={{ marginBottom: '32px' }}>
          <button
            onClick={() => navigate(isCustomer ? '/menu' : '/checkout')}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '16px', padding: 0 }}
          >
            ← {isCustomer ? 'Back to Menu' : 'Back'}
          </button>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', fontWeight: 900, color: 'var(--text-1)', margin: '0 0 6px 0' }}>
            {isCustomer ? 'Delivery Details' : 'Guest Checkout'}
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: '0.9rem', margin: 0 }}>
            {isCustomer
              ? (savedAddresses.length > 0 ? 'Select a saved address or add a new one' : 'Enter your delivery address to complete your order')
              : 'Complete your order without creating an account'}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '32px', alignItems: 'start' }}>

          {/* Left — Form */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', padding: '32px' }}>

            {error && (
              <div style={{ background: 'rgba(198,42,9,0.12)', border: '1px solid var(--red)', borderLeft: '3px solid var(--red)', borderRadius: '8px', padding: '12px 16px', color: 'var(--red-light)', fontSize: '0.875rem', marginBottom: '24px' }}>
                {error}
              </div>
            )}

            {isLoadingCustomer && isCustomer && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
                Loading your saved addresses...
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

              {/* Contact phone — logged-in customer only */}
              {isCustomer && (
                <div>
                  <h3 style={sectionHeadingStyle}>Contact Number</h3>
                  <Field
                    label="Phone Number"
                    name="phone"
                    type="tel"
                    placeholder={phonePlaceholder(formCountry)}
                    error={validationErrors.phone}
                    helperText={!validationErrors.phone ? 'For delivery updates (include country code if abroad)' : undefined}
                  />
                </div>
              )}

              {/* Saved addresses — logged-in customer with existing addresses */}
              {isCustomer && savedAddresses.length > 0 && (
                <div>
                  <h3 style={sectionHeadingStyle}>Saved Addresses</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {savedAddresses.map((addr: CustomerAddress) => (
                      <div
                        key={addr.id}
                        onClick={() => setSelectedAddressId(addr.id)}
                        style={{
                          background: selectedAddressId === addr.id ? 'rgba(212,168,67,0.08)' : 'var(--surface-2)',
                          border: `1px solid ${selectedAddressId === addr.id ? 'var(--gold)' : 'var(--border)'}`,
                          borderRadius: '12px',
                          padding: '16px',
                          cursor: 'pointer',
                          transition: 'var(--transition)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              <span style={{
                                background: 'var(--gold)',
                                color: 'var(--bg)',
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}>
                                {addr.label} {addr.isDefault && '· Default'}
                              </span>
                            </div>
                            <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-1)' }}>
                              {addr.addressLine1}{addr.addressLine2 && `, ${addr.addressLine2}`}
                            </p>
                            <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--text-3)' }}>
                              {addr.city}, {addr.state} – {addr.postalCode}
                            </p>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {!addr.isDefault && (
                                <button
                                  type="button"
                                  onClick={(e) => handleSetDefaultAddress(addr.id, e)}
                                  style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: '0.75rem', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}
                                >
                                  Set Default
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setAddressToDelete(addr.id); }}
                                style={{ background: 'none', border: '1px solid rgba(198,42,9,0.4)', color: 'var(--red-light)', fontSize: '0.75rem', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          {/* Radio indicator */}
                          <div style={{
                            width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                            border: `2px solid ${selectedAddressId === addr.id ? 'var(--gold)' : 'var(--border)'}`,
                            background: selectedAddressId === addr.id ? 'var(--gold)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {selectedAddressId === addr.id && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--bg)' }} />}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* New address option */}
                    <div
                      onClick={() => setSelectedAddressId('new')}
                      style={{
                        background: selectedAddressId === 'new' ? 'rgba(212,168,67,0.08)' : 'var(--surface-2)',
                        border: `1px solid ${selectedAddressId === 'new' ? 'var(--gold)' : 'var(--border)'}`,
                        borderRadius: '12px',
                        padding: '14px 16px',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <span style={{ fontSize: '1.2rem' }}>+</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-1)' }}>Use a New Address</p>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-3)' }}>Enter a different delivery address</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Contact info — guests only */}
              {!isCustomer && (
                <div>
                  <h3 style={sectionHeadingStyle}>Contact Information</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <Field label="First Name" name="firstName" error={validationErrors.firstName} />
                      <Field label="Last Name" name="lastName" error={validationErrors.lastName} />
                    </div>
                    <Field label="Email Address" name="email" type="email" placeholder="For order confirmation" error={validationErrors.email} />
                    <Field
                      label="Phone Number"
                      name="phone"
                      type="tel"
                      placeholder={phonePlaceholder(formCountry)}
                      error={validationErrors.phone}
                      helperText={!validationErrors.phone ? 'For delivery updates (include country code if abroad)' : undefined}
                    />
                  </div>
                </div>
              )}

              {/* Address form — new address or guest */}
              {(selectedAddressId === 'new' || !isCustomer) && (
                <div>
                  <h3 style={sectionHeadingStyle}>
                    {isCustomer ? 'New Delivery Address' : 'Delivery Address'}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {isCustomer && (
                      <div>
                        <label style={labelStyle}>Address Label</label>
                        <select
                          name="addressLabel"
                          value={formData.addressLabel}
                          onChange={handleChange}
                          style={{ ...inputStyle, cursor: 'pointer' }}
                        >
                          <option value="HOME">Home</option>
                          <option value="WORK">Work</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                    )}
                    {/* Address Line 1 — Google Places autocomplete */}
                    <div>
                      <label style={labelStyle}>Address Line 1</label>
                      <AddressAutocomplete
                        placeholder="House/Flat number, Building name..."
                        initialValue={formData.addressLine1}
                        disabled={loading}
                        onSelect={(address, _lat, _lon) => {
                          // Parse the Google Places result into form fields (DE PLZ is 5 digits; India PIN is 6)
                          const parts = address.split(',').map(s => s.trim());
                          const postal = extractPostalFromAddressParts(parts);
                          setFormData(prev => ({
                            ...prev,
                            addressLine1: parts[0] || address,
                            addressLine2: parts[1] || prev.addressLine2,
                            city: parts[parts.length - 3] || prev.city,
                            state: parts[parts.length - 2]?.replace(/\d+/g, '').trim() || prev.state,
                            zipCode: postal || prev.zipCode,
                          }));
                          setValidationErrors(prev => ({ ...prev, addressLine1: '' }));
                        }}
                      />
                      {validationErrors.addressLine1 && (
                        <p style={{ color: 'var(--red-light)', fontSize: '0.72rem', marginTop: '4px' }}>{validationErrors.addressLine1}</p>
                      )}
                    </div>
                    <Field label="Address Line 2 (Optional)" name="addressLine2" placeholder="Street, Area, Landmark" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <Field label="City" name="city" error={validationErrors.city} />
                      <Field label="State / Region" name="state" error={validationErrors.state} />
                    </div>
                    <Field
                      label={postalFieldLabel(formCountry)}
                      name="zipCode"
                      placeholder={postalPlaceholder(formCountry)}
                      error={validationErrors.zipCode}
                    />

                    {/* Save address checkbox — logged-in customers */}
                    {isCustomer && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <input
                          type="checkbox"
                          checked={saveNewAddress}
                          onChange={(e) => setSaveNewAddress(e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--gold)', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Save this address for future orders</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Special instructions */}
              <div>
                <label style={labelStyle}>Special Instructions (Optional)</label>
                <textarea
                  name="specialInstructions"
                  value={formData.specialInstructions}
                  onChange={handleChange}
                  placeholder="Any special delivery instructions..."
                  disabled={loading}
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    fontFamily: 'var(--font-body)',
                  }}
                  onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)'; }}
                  onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                />
              </div>

              <button
                type="submit"
                disabled={loading || isLoadingCustomer}
                style={{
                  width: '100%',
                  background: loading ? 'var(--surface-2)' : 'var(--red)',
                  color: 'var(--text-1)',
                  border: 'none',
                  borderRadius: 'var(--radius-pill)',
                  padding: '14px',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: loading || isLoadingCustomer ? 'not-allowed' : 'pointer',
                  transition: 'var(--transition)',
                  letterSpacing: '0.01em',
                }}
                onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.background = 'var(--red-light)'; }}
                onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.background = 'var(--red)'; }}
              >
                {loading ? 'Processing...' : 'Proceed to Payment →'}
              </button>
            </form>
          </div>

          {/* Right — Order Summary */}
          <div style={{ position: 'sticky', top: '24px', background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', padding: '24px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-1)', margin: '0 0 16px 0' }}>
              {t('cart.order_summary')}
            </h3>

            {/* Store */}
            {selectedStoreName && (
              <div style={{
                background: 'var(--surface-2)',
                borderLeft: '3px solid var(--gold)',
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>{selectedStoreName}</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-3)' }}>Store #{selectedStoreId}</p>
                </div>
              </div>
            )}

            <div style={{ height: '1px', background: 'var(--border)', margin: '0 0 16px 0' }} />

            {/* Items */}
            <div style={{ maxHeight: '280px', overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {cartItems.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 2px', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>{item.name}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-3)' }}>Qty: {item.quantity} × {formatMajorAmount(item.price , currency, locale)}</p>
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-1)', flexShrink: 0 }}>{formatMajorAmount(item.price * item.quantity , currency, locale)}</span>
                </div>
              ))}
            </div>

            <div style={{ height: '1px', background: 'var(--border)', margin: '0 0 14px 0' }} />

            {/* Totals */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: t('cart.subtotal_with_count', { count: itemCount }), value: fmt(subtotal) },
                { label: t('cart.delivery_fee'), value: fmt(deliveryFee) },
                { label: taxLabel, value: formatTaxDisplay(tax, fmt) },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>{row.label}</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-2)', fontWeight: 500 }}>{row.value}</span>
                </div>
              ))}
              <div style={{ height: '1px', background: 'var(--border)', margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-1)', fontSize: '1.05rem' }}>{t('cart.total')}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--gold)', fontSize: '1.35rem' }}>{formatMajorAmount(total , currency, locale)}</span>
              </div>
            </div>

            {/* Auth nudge for guests */}
            {!isLoggedIn && (
              <div style={{ marginTop: '20px', padding: '14px', background: 'var(--surface-2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: 'var(--text-2)', fontWeight: 600 }}>Have an account?</p>
                <button
                  type="button"
                  onClick={() => navigate('/customer-login', { state: { from: '/checkout' } })}
                  style={{ background: 'none', border: '1px solid var(--gold)', color: 'var(--gold)', borderRadius: 'var(--radius-pill)', padding: '7px 16px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', width: '100%' }}
                >
                  Sign In for faster checkout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete address confirmation modal */}
      {addressToDelete && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000,
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            padding: '32px',
            maxWidth: '400px',
            width: '90%',
          }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-1)', margin: '0 0 10px 0' }}>Delete Address</h3>
            <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', margin: '0 0 24px 0' }}>
              Are you sure you want to delete this address? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAddressToDelete(null)}
                disabled={deletingAddress}
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 'var(--radius-pill)', padding: '9px 20px', fontSize: '0.875rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteAddress(addressToDelete)}
                disabled={deletingAddress}
                style={{ background: 'var(--red)', border: 'none', color: 'var(--text-1)', borderRadius: 'var(--radius-pill)', padding: '9px 20px', fontSize: '0.875rem', fontWeight: 700, cursor: deletingAddress ? 'not-allowed' : 'pointer' }}
              >
                {deletingAddress ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuestCheckoutPage;
