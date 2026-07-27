import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useRegisterMutation, useGoogleRegisterMutation } from '../../store/api/authApi';
import { getApiErrorMessage } from '../utils/apiError';
import { useCreateCustomerMutation } from '../../store/api/customerApi';
import { useAppSelector } from '../../store/hooks';
import { selectStoreCountryCode } from '../../store/slices/cartSlice';
import {
  isValidCustomerPhone,
  phonePlaceholder,
  phoneErrorMessage,
  normalizePhoneForApi,
} from '../../utils/customerFormValidation';

interface RegisterFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
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

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/checkout';
  const storeCountryCode = useAppSelector(selectStoreCountryCode);
  // Form copy from selected store country only (null = India legacy helpers)
  const formCountry = storeCountryCode;
  const [register, { isLoading }] = useRegisterMutation();
  const [googleRegister, { isLoading: isGoogleLoading }] = useGoogleRegisterMutation();
  const [createCustomer] = useCreateCustomerMutation();

  const [formData, setFormData] = useState<RegisterFormData>({
    firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '',
  });

  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<Partial<RegisterFormData>>({});

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    try {
      setError('');
      await googleRegister({ idToken: credentialResponse.credential }).unwrap();
      navigate(from);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Google sign-up failed. Please try again.'));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setValidationErrors(prev => ({ ...prev, [name]: '' }));
    setError('');
  };

  const validateForm = (): boolean => {
    const errors: Partial<RegisterFormData> = {};
    if (!formData.firstName.trim()) errors.firstName = 'Required';
    if (!formData.lastName.trim()) errors.lastName = 'Required';
    if (!formData.email.trim()) errors.email = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Invalid email';
    if (!formData.phone.trim()) errors.phone = 'Required';
    else if (!isValidCustomerPhone(formData.phone)) {
      errors.phone = phoneErrorMessage(formCountry);
    }
    if (!formData.password) errors.password = 'Required';
    else if (formData.password.length < 6) errors.password = 'At least 6 characters';
    if (formData.password !== formData.confirmPassword) errors.confirmPassword = 'Passwords do not match';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;
    try {
      const cleanPhone = normalizePhoneForApi(formData.phone);
      const result = await register({
        name: `${formData.firstName} ${formData.lastName}`.trim(),
        email: formData.email,
        phone: cleanPhone,
        password: formData.password,
        type: 'CUSTOMER',
        rememberMe: true,
      }).unwrap();
      try {
        await createCustomer({ userId: result.user.id, name: result.user.name, email: result.user.email, phone: cleanPhone, marketingOptIn: false, smsOptIn: false }).unwrap();
      } catch { /* non-blocking */ }
      navigate(from);
    } catch (err: unknown) {
      let msg = getApiErrorMessage(err, 'Registration failed.');
      if (msg.toLowerCase().includes('email already exists')) msg = 'Email already registered. Try logging in instead.';
      else if (msg.toLowerCase().includes('phone') && msg.toLowerCase().includes('exists')) msg = 'Phone number already registered.';
      setError(msg);
    }
  };

  const Field = ({
    label, name, type = 'text', placeholder, error: fieldError,
  }: { label: string; name: keyof RegisterFormData; type?: string; placeholder?: string; error?: string }) => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        value={formData[name]}
        onChange={handleChange}
        disabled={isLoading}
        style={{ ...inputStyle, borderColor: fieldError ? 'var(--red)' : 'var(--border)' }}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = fieldError ? 'var(--red)' : 'var(--gold)'; }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = fieldError ? 'var(--red)' : 'var(--border)'; }}
      />
      {fieldError && <p style={{ color: 'var(--red-light)', fontSize: '0.72rem', marginTop: '4px' }}>{fieldError}</p>}
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--border)',
          borderTop: '3px solid var(--gold)',
          padding: '36px 32px',
          boxShadow: 'var(--shadow-card)',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--gold)', marginBottom: '4px' }}>
              MaSoVa
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              Create your account
            </h1>
            <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginTop: '6px' }}>
              Join MaSoVa and enjoy exclusive deals
            </p>
          </div>

          {error && (
            <div style={{ background: 'rgba(198,42,9,0.12)', border: '1px solid var(--red)', borderRadius: '8px', padding: '10px 14px', color: 'var(--red-light)', fontSize: '0.875rem', marginBottom: '20px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="First Name" name="firstName" placeholder="John" error={validationErrors.firstName} />
              <Field label="Last Name" name="lastName" placeholder="Smith" error={validationErrors.lastName} />
            </div>

            <Field label="Email Address" name="email" type="email" placeholder="john@example.com" error={validationErrors.email} />
            <Field label="Phone Number" name="phone" type="tel" placeholder={phonePlaceholder(formCountry)} error={validationErrors.phone} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Password" name="password" type="password" placeholder="Min 6 characters" error={validationErrors.password} />
              <Field label="Confirm Password" name="confirmPassword" type="password" placeholder="Repeat password" error={validationErrors.confirmPassword} />
            </div>

            <p style={{ color: 'var(--text-3)', fontSize: '0.72rem', margin: '0' }}>
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </p>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                background: isLoading ? 'var(--surface-2)' : 'var(--red)',
                color: 'var(--text-1)',
                border: 'none',
                borderRadius: 'var(--radius-pill)',
                padding: '13px',
                fontFamily: 'var(--font-body)',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'var(--transition)',
                width: '100%',
                marginTop: '4px',
              }}
              onMouseEnter={(e) => { if (!isLoading) (e.currentTarget as HTMLElement).style.background = 'var(--red-light)'; }}
              onMouseLeave={(e) => { if (!isLoading) (e.currentTarget as HTMLElement).style.background = 'var(--red)'; }}
            >
              {isLoading ? 'Creating Account...' : 'Create Account →'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>or continue with</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          {/* Google Sign-Up */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0', opacity: isGoogleLoading ? 0.6 : 1 }}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google sign-up was cancelled or failed.')}
              text="signup_with"
              shape="rectangular"
              theme="filled_black"
              size="large"
              width="340"
            />
          </div>

          <div style={{ marginTop: '0', paddingTop: '16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-3)' }}>
              Already have an account?{' '}
              <button
                onClick={() => navigate('/customer-login')}
                style={{ background: 'none', border: 'none', color: 'var(--gold)', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Sign In
              </button>
            </p>
            <button
              onClick={() => navigate(-1)}
              style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: '0.8rem', cursor: 'pointer', marginTop: '8px', textDecoration: 'underline' }}
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
