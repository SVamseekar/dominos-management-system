// src/apps/POSSystem/components/CustomerPanel.tsx
import React, { useState, useImperativeHandle, useCallback } from 'react';
import { useCreateOrderMutation } from '../../../store/api/orderApi';
import { useInitiatePaymentMutation, useVerifyPaymentMutation } from '../../../store/api/paymentApi';
import { useGetOrCreateCustomerMutation } from '../../../store/api/customerApi';
import { isValidPhoneNumber } from '../../../config/business-config';
import { useAppSelector } from '../../../store/hooks';
import {
  selectCartCurrency,
  selectCartLocale,
  selectStoreCountryCode,
  selectDeliveryFeeINR,
} from '../../../store/slices/cartSlice';
import { formatMajorAmount } from '../../../utils/currency';
import { computePreCheckoutTotals, formatTaxDisplay } from '../../../utils/orderTax';
import { useGeocoding, buildAddressString } from '../../../hooks/useGeocoding';
import { PINAuthModal } from './PINAuthModal';
import PersonIcon from '@mui/icons-material/Person';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PaymentIcon from '@mui/icons-material/Payment';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SyncIcon from '@mui/icons-material/Sync';

import type { POSCustomer, POSOrderItem } from '../types';
import { getRtkErrorMessage } from '../../shared/rtkError';
import {
  paymentMethodsForCountry,
  type PaymentMethodCode,
} from '../../../utils/paymentMethods';
import {
  pos,
  posTouchBtnBase,
  posPanelHeader,
  posSectionTitle,
  posField,
  posLabel,
  posTouchBtnPrimary,
} from '../posTokens';
import { resolvePosDeliveryFee } from '../posHelpers';

interface CustomerPanelProps {
  items: POSOrderItem[];
  customer: POSCustomer | null;
  onCustomerChange: (customer: POSCustomer | null) => void;
  orderType: 'PICKUP' | 'DELIVERY' | 'DINE_IN';
  selectedTable?: string | null;
  onOrderComplete: () => void;
  userId?: string;
  storeId?: string;
  submitOrderRef?: React.MutableRefObject<(() => void) | null>;
  orderCreatedBy?: {
    userId: string;
    name: string;
    type: string;
    role: string;
    storeId: string;
  } | null;
}

const CustomerPanel: React.FC<CustomerPanelProps> = ({
  items,
  customer,
  onCustomerChange: _onCustomerChange,
  orderType,
  selectedTable: _selectedTable,
  onOrderComplete,
  userId: _userId,
  storeId,
  submitOrderRef,
  orderCreatedBy: _orderCreatedBy,
}) => {
  const currency = useAppSelector(selectCartCurrency);
  const locale = useAppSelector(selectCartLocale);
  const storeCountryCode = useAppSelector(selectStoreCountryCode);
  const cartDeliveryFee = useAppSelector(selectDeliveryFeeINR);
  // Explicit DE for Berlin demo when cart has not loaded store yet (null legacy = IN)
  const paymentCountry = storeCountryCode ?? 'DE';
  const paymentMethods = paymentMethodsForCountry(paymentCountry);
  const fmt = (v: number) => formatMajorAmount(v, currency, locale);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryPincode, setDeliveryPincode] = useState('');
  const [deliveryLatitude, setDeliveryLatitude] = useState<number | undefined>();
  const [deliveryLongitude, setDeliveryLongitude] = useState<number | undefined>();
  const [geocodingStatus, setGeocodingStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [specialInstructions, setSpecialInstructions] = useState('');
  // Default payment method: CASH for PICKUP, CARD for DELIVERY (EU-safe methods only)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>(
    orderType === 'PICKUP' ? 'CASH' : 'CARD'
  );
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [addressError, setAddressError] = useState('');

  // Global-6: aggregator source selector
  const [orderSource, setOrderSource] = useState<'MASOVA' | 'WOLT' | 'DELIVEROO' | 'JUST_EAT' | 'UBER_EATS'>('MASOVA');
  const [aggregatorOrderId, setAggregatorOrderId] = useState('');

  // PIN Authentication for order submission
  const [showPINModal, setShowPINModal] = useState(false);
  const [_authenticatedStaff, setAuthenticatedStaff] = useState<{
    userId: string;
    name: string;
    type: string;
    role: string;
    storeId: string;
  } | null>(null);

  // Geocoding hook
  const { geocode, loading: geocoding, error: geocodingError } = useGeocoding();

  const [createOrder, { isLoading: isSubmitting }] = useCreateOrderMutation();
  const [initiatePayment] = useInitiatePaymentMutation();
  const [verifyPayment] = useVerifyPaymentMutation();
  const [getOrCreateCustomer] = useGetOrCreateCustomerMutation();

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = resolvePosDeliveryFee(orderType, subtotal, cartDeliveryFee);
  const { tax, taxLabel, total } = computePreCheckoutTotals(subtotal, deliveryFee, storeCountryCode);

  // Update payment method when order type changes (PICKUP = CASH default, DELIVERY = CARD)
  React.useEffect(() => {
    // For DELIVERY, don't allow CASH - always use CARD
    if (orderType === 'DELIVERY') {
      setPaymentMethod('CARD');
    } else {
      // For PICKUP, default to CASH
      setPaymentMethod('CASH');
    }
  }, [orderType]);

  const handlePhoneChange = (value: string) => {
    setCustomerPhone(value);
    if (value && !isValidPhoneNumber(value)) {
      setPhoneError('Please enter a valid 10-digit phone number');
    } else {
      setPhoneError('');
    }
  };

  /**
   * Geocode delivery address when city or pincode is entered
   * This runs automatically when user tabs out of address fields
   */
  const handleAddressGeocode = async () => {
    if (orderType !== 'DELIVERY') return;

    // Need at least city and pincode for geocoding
    if (!deliveryCity.trim() || !deliveryPincode.trim()) {
      setGeocodingStatus('idle');
      return;
    }

    const fullAddress = buildAddressString(deliveryStreet, deliveryCity, undefined, deliveryPincode);

    console.log('🔍 Attempting to geocode:', fullAddress);

    const result = await geocode(fullAddress);

    if (result) {
      setDeliveryLatitude(result.latitude);
      setDeliveryLongitude(result.longitude);
      setGeocodingStatus('success');
      setAddressError('');
      console.log('✅ Geocoded successfully:', result.latitude, result.longitude);
    } else {
      setGeocodingStatus('error');
      setDeliveryLatitude(undefined);
      setDeliveryLongitude(undefined);
      // Don't set error - geocodingError from hook will be shown
    }
  };

  // Handler for PIN authentication completion
  const handlePINAuthenticated = (userData: { userId: string; name: string; type: string; role: string; storeId: string }) => {
    setAuthenticatedStaff(userData);
    setShowPINModal(false);
    // Proceed with order submission using authenticated staff
    submitOrderAfterAuth(userData);
  };

  const validateForm = useCallback((): boolean => {
    let isValid = true;

    // Validate phone number if provided
    if (customerPhone && !isValidPhoneNumber(customerPhone)) {
      setPhoneError('Please enter a valid 10-digit phone number');
      isValid = false;
    }

    // Validate email format if provided (for any payment method)
    if (customerEmail && customerEmail.trim() && !customerEmail.includes('@')) {
      setEmailError('Please enter a valid email address');
      isValid = false;
    }

    // Require email for online payments (CARD/UPI/WALLET)
    if (paymentMethod !== 'CASH' && !customerEmail.trim()) {
      setEmailError('Email is required for online payments');
      isValid = false;
    }

    // Delivery must have complete address and phone
    if (orderType === 'DELIVERY') {
      if (!deliveryStreet.trim()) {
        setAddressError('Street address is required for delivery');
        isValid = false;
      }
      if (!deliveryCity.trim()) {
        setAddressError('City is required for delivery');
        isValid = false;
      }
      if (!deliveryPincode.trim()) {
        setAddressError('Pincode is required for delivery');
        isValid = false;
      }
      if (!customerPhone) {
        setPhoneError('Phone number is required for delivery');
        isValid = false;
      }
    }

    return isValid;
  }, [customerPhone, customerEmail, paymentMethod, orderType, deliveryStreet, deliveryCity, deliveryPincode]);

  // Handler for "Place Order" button click - opens PIN modal first
  const handlePlaceOrderClick = useCallback(() => {
    if (items.length === 0) {
      alert('Please add items to the order');
      return;
    }

    if (!validateForm()) {
      return;
    }

    // Open PIN modal for authentication
    setShowPINModal(true);
  }, [items.length, validateForm]);

  // Expose handlePlaceOrderClick to parent via ref for keyboard shortcut
  useImperativeHandle(submitOrderRef, () => handlePlaceOrderClick, [handlePlaceOrderClick]);

  const submitOrderAfterAuth = async (staffData: { userId: string; name: string; type: string; role: string; storeId: string }) => {
    // Validation already done in handlePlaceOrderClick, proceed with order creation
    if (!storeId) {
      alert('Store information is missing. Please try again.');
      return;
    }

    try {
      // Step 1: Resolve order.customerId as JWT userId (ownership), not customer document id.
      // Walk-in may leave customerId null — status machine must still work.
      let orderCustomerUserId: string | undefined = customer?.userId || undefined;

      if (!orderCustomerUserId && (customerPhone || customerEmail)) {
        try {
          // Generate a temporary userId for walk-in customers using phone or email
          const tempUserId = customerPhone
            ? `walkin-phone-${customerPhone.replace(/\D/g, '')}`
            : `walkin-email-${customerEmail.replace(/[^a-zA-Z0-9]/g, '')}`;

          const customerProfile = await getOrCreateCustomer({
            userId: tempUserId,
            storeId: storeId!,
            name: customerName.trim() || 'Walk-in Customer',
            email: customerEmail || `${tempUserId}@walkin.local`,
            phone: customerPhone || '0000000000',
            marketingOptIn: false,
            smsOptIn: false,
          }).unwrap();

          // Prefer linked userId; fall back to tempUserId used at profile create
          orderCustomerUserId = customerProfile.userId || tempUserId;
          console.log('Customer profile created/retrieved; order.customerId (userId):', orderCustomerUserId);
        } catch (error) {
          console.warn('Failed to create customer profile, continuing without it:', error);
          // Continue without customer profile - order will still work
        }
      }

      // Step 2: Transform items to match backend expectations
      const transformedItems = items.map((item) => {
        const menuItemId = item.menuItemId || item.id;
        if (!menuItemId) {
          throw new Error(`Missing menu item ID for "${item.name}"`);
        }
        return {
          menuItemId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          variant: item.variant,
          customizations: item.customizations,
        };
      });

      // Parse delivery address if provided - NOW WITH GEOCODED COORDINATES!
      let parsedDeliveryAddress = null;
      if (orderType === 'DELIVERY' && deliveryStreet) {
        parsedDeliveryAddress = {
          street: deliveryStreet,
          city: deliveryCity,
          pincode: deliveryPincode,
          latitude: deliveryLatitude,  // From geocoding
          longitude: deliveryLongitude // From geocoding
        };

        // Log for debugging
        if (deliveryLatitude && deliveryLongitude) {
          console.log('✅ Order includes GPS coordinates:', deliveryLatitude, deliveryLongitude);
        } else {
          console.warn('⚠️ Order missing GPS coordinates - dispatch may use mock coordinates in test mode');
        }
      }

      // Transform orderType from PICKUP to TAKEAWAY for backend
      const backendOrderType = orderType === 'PICKUP' ? 'TAKEAWAY' : orderType;

      const orderData = {
        customerId: orderCustomerUserId || undefined,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone || undefined,
        customerEmail: customerEmail.trim() || undefined, // For email notifications
        storeId,
        orderType: backendOrderType as 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY',
        items: transformedItems,
        paymentMethod,
        deliveryAddress: parsedDeliveryAddress || undefined,
        specialInstructions: specialInstructions.trim() || undefined,
        // Staff tracking - who created this order (from PIN authentication)
        createdByStaffId: staffData.userId,
        createdByStaffName: staffData.name,
        // Global-6: aggregator source (MASOVA | WOLT | … — never POS)
        orderSource,
        aggregatorOrderId: orderSource !== 'MASOVA' ? aggregatorOrderId || undefined : undefined,
      };

      // Step 3: Create the order
      const result = await createOrder(orderData).unwrap();

      // For CASH payments, just create the order with PENDING status
      // Staff will mark as paid after collecting cash
      const orderTotal = typeof result.total === 'number' ? result.total : total;
      const vatLine = result.totalVatAmount != null
        ? `\nVAT: ${fmt(result.totalVatAmount)}`
        : (result.tax != null ? `\nTax: ${fmt(result.tax)}` : '');

      if (paymentMethod === 'CASH') {
        alert(
          `Order #${result.orderNumber} created successfully!\n\n` +
          `Payment Method: CASH\n` +
          `Amount: ${fmt(orderTotal)}${vatLine}\n\n` +
          `Remember to collect cash and mark as paid in Order Management!`
        );
        resetForm();
        onOrderComplete();
        return;
      }

      // For online payments (CARD, UPI, WALLET), initiate Razorpay
      await handleOnlinePayment(result.id, result.orderNumber, orderTotal);
    } catch (error: unknown) {
      console.error('Failed to create order:', error);
      alert(`Failed to create order: ${getRtkErrorMessage(error, 'Unknown error')}`);
    }
  };

  const handleOnlinePayment = async (orderId: string, orderNumber: string, orderTotal: number) => {
    try {
      // Transform orderType from PICKUP to TAKEAWAY for backend
      const backendOrderType = orderType === 'PICKUP' ? 'TAKEAWAY' : orderType;

      // Initiate payment with Razorpay
      const paymentResponse = await initiatePayment({
        orderId,
        amount: orderTotal,
        customerId: customer?.id || 'walk-in',
        customerEmail: customerEmail || customer?.email || undefined,
        customerPhone: customerPhone || undefined,
        storeId: storeId!,
        orderType: backendOrderType, // For payment analytics
        paymentMethod: paymentMethod, // For payment analytics
        notes: `POS Order #${orderNumber}`,
      }).unwrap();

      // Load Razorpay script if not already loaded
      if (!window.Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);
        await new Promise((resolve) => {
          script.onload = resolve;
        });
      }

      // Configure Razorpay options
      const options = {
        key: paymentResponse.razorpayKeyId || '',
        amount: paymentResponse.amount,
        currency: paymentResponse.currency,
        name: 'MaSoVa Restaurant',
        description: `Order #${orderNumber}`,
        order_id: paymentResponse.razorpayOrderId,
        handler: async (response: RazorpaySuccessResponse) => {
          try {
            // Verify payment
            await verifyPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              paymentMethod: paymentMethod,
            }).unwrap();

            alert(`Order #${orderNumber} created and paid successfully!`);
            resetForm();
            onOrderComplete();
          } catch (error: unknown) {
            console.error('Payment verification failed:', error);
            alert(`Payment verification failed: ${getRtkErrorMessage(error, 'Unknown error')}\nOrder created but payment pending.`);
          }
        },
        prefill: {
          name: customerName || 'Customer',
          contact: customerPhone || '',
          email: customer?.email || '',
        },
        theme: {
          color: pos.role,
        },
        modal: {
          ondismiss: () => {
            alert(`Payment cancelled. Order #${orderNumber} created but payment is pending.`);
            onOrderComplete();
          },
        },
      };

      // Open Razorpay checkout
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error: unknown) {
      console.error('Failed to initiate payment:', error);
      alert(`Failed to initiate payment: ${getRtkErrorMessage(error, 'Unknown error')}\nPlease try again or use cash payment.`);
    }
  };

  const resetForm = () => {
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setDeliveryStreet('');
    setDeliveryCity('');
    setDeliveryPincode('');
    setSpecialInstructions('');
    setPaymentMethod(orderType === 'PICKUP' ? 'CASH' : 'CARD');
  };

  const canSubmit =
    items.length > 0 &&
    !isSubmitting &&
    !phoneError &&
    !addressError;

  return (
    <div
      data-testid="customer-panel"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      <div style={posPanelHeader}>
        <h3 style={{ ...posSectionTitle, justifyContent: 'space-between', width: '100%' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <PaymentIcon style={{ fontSize: 22, color: pos.role }} />
            Pay
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 900,
              color: pos.role,
              background: pos.roleSoft,
              padding: '8px 14px',
              borderRadius: 999,
              border: `1px solid ${pos.roleBorder}`,
            }}
          >
            {items.length > 0 ? fmt(total) : '—'}
          </span>
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: pos.muted }}>
          Guest details · payment · place order
        </p>
      </div>

      {/* Scrollable form */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 14,
          minHeight: 0,
          background: 'rgba(0,0,0,0.18)',
        }}
      >
        {/* Step 1 — Customer */}
        <div
          style={{
            marginBottom: 14,
            padding: 16,
            borderRadius: 18,
            background: `linear-gradient(165deg, ${pos.surfaceElevated}, ${pos.surface})`,
            border: `1px solid ${pos.border}`,
            boxShadow: pos.shadow.raised.sm,
          }}
        >
          <p style={{ ...posSectionTitle, marginBottom: 14, fontSize: 13 }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                background: pos.roleSoft,
                color: pos.role,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              1
            </span>
            <AssignmentIcon style={{ fontSize: 18, color: pos.role }} />
            Guest
          </p>
          <label style={posLabel}>Name</label>

          <input
            type="text"
            placeholder="Walk-in or guest name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            style={{ ...posField, marginBottom: 12 }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = pos.role;
              e.currentTarget.style.boxShadow = `0 0 0 3px ${pos.roleSoft}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = pos.border;
              e.currentTarget.style.boxShadow = 'none';
            }}
          />

          <label style={posLabel}>Phone {orderType === 'DELIVERY' ? '(required)' : ''}</label>
          <input
            type="tel"
            placeholder="Mobile number"
            value={customerPhone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            style={{
              ...posField,
              marginBottom: phoneError ? 4 : 12,
              borderColor: phoneError ? pos.error : pos.border,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = phoneError ? pos.error : pos.role;
              e.currentTarget.style.boxShadow = phoneError
                ? `0 0 0 3px ${pos.errorSoft}`
                : `0 0 0 3px ${pos.roleSoft}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = phoneError ? pos.error : pos.border;
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          {phoneError && (
            <p style={{
              margin: `0 0 ${pos.space[3]} 0`,
              fontSize: pos.type.fontSize.xs,
              color: pos.error
            }}>
              <WarningAmberIcon style={{ fontSize: '12px', marginRight: '4px', verticalAlign: 'middle' }} />{phoneError}
            </p>
          )}

          {/* Email field - optional for all orders, required for online payments */}
          <input
            type="email"
            placeholder={paymentMethod === 'CASH' ? "Email (optional - for order notifications)" : "Email (for payment receipt & notifications)"}
            value={customerEmail}
            onChange={(e) => {
              setCustomerEmail(e.target.value);
              setEmailError('');
            }}
            style={{
                  width: '100%',
                  padding: pos.space[3],
                  marginBottom: emailError ? pos.space[1] : pos.space[3],
                  border: `2px solid ${emailError ? pos.error : pos.border}`,
                  borderRadius: '10px',
                  outline: 'none',
                  backgroundColor: pos.surfaceElevated,
                  fontSize: pos.type.fontSize.sm,
                  color: pos.ink,
                  fontFamily: pos.font,
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = emailError ? pos.error : pos.role;
                  e.currentTarget.style.boxShadow = emailError
                    ? `0 0 0 3px ${pos.error}22`
                    : `0 0 0 3px ${pos.roleSoft}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = emailError ? pos.error : pos.border;
                  e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.35)';
                }}
              />
          {emailError && (
            <p style={{
              margin: `0 0 ${pos.space[3]} 0`,
              fontSize: pos.type.fontSize.xs,
              color: pos.error
            }}>
              <WarningAmberIcon style={{ fontSize: '12px', marginRight: '4px', verticalAlign: 'middle' }} />{emailError}
            </p>
          )}

          {/* Delivery Address Fields */}
          {orderType === 'DELIVERY' && (
            <>
              <input
                type="text"
                placeholder="Street Address (required)"
                value={deliveryStreet}
                onChange={(e) => {
                  setDeliveryStreet(e.target.value);
                  setAddressError('');
                }}
                style={{
                  width: '100%',
                  padding: pos.space[3],
                  marginBottom: pos.space[3],
                  border: `2px solid ${addressError ? pos.error : pos.border}`,
                  borderRadius: '10px',
                  outline: 'none',
                  backgroundColor: pos.surfaceElevated,
                  fontSize: pos.type.fontSize.sm,
                  color: pos.ink,
                  fontFamily: pos.font,
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = addressError ? pos.error : pos.role;
                  e.currentTarget.style.boxShadow = addressError
                    ? `0 0 0 3px ${pos.error}22`
                    : `0 0 0 3px ${pos.roleSoft}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = addressError ? pos.error : pos.border;
                  e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.35)';
                }}
              />

              <div style={{ display: 'flex', gap: pos.space[3], marginBottom: pos.space[3] }}>
                <input
                  type="text"
                  placeholder="City (required)"
                  value={deliveryCity}
                  onChange={(e) => {
                    setDeliveryCity(e.target.value);
                    setAddressError('');
                  }}
                  style={{
                    flex: 1,
                    padding: pos.space[3],
                    border: `2px solid ${addressError ? pos.error : pos.border}`,
                    borderRadius: '10px',
                    outline: 'none',
                    backgroundColor: pos.surfaceElevated,
                    fontSize: pos.type.fontSize.sm,
                    color: pos.ink,
                    fontFamily: pos.font,
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = addressError ? pos.error : pos.role;
                    e.currentTarget.style.boxShadow = addressError
                      ? `0 0 0 3px ${pos.error}22`
                      : `0 0 0 3px ${pos.roleSoft}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = addressError ? pos.error : pos.border;
                    e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.35)';
                  }}
                />

                <input
                  type="text"
                  placeholder="Pincode (required)"
                  value={deliveryPincode}
                  onChange={(e) => {
                    setDeliveryPincode(e.target.value);
                    setAddressError('');
                  }}
                  maxLength={6}
                  style={{
                    width: '140px',
                    padding: pos.space[3],
                    border: `2px solid ${addressError ? pos.error : pos.border}`,
                    borderRadius: '10px',
                    outline: 'none',
                    backgroundColor: pos.surfaceElevated,
                    fontSize: pos.type.fontSize.sm,
                    color: pos.ink,
                    fontFamily: pos.font,
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = addressError ? pos.error : pos.role;
                    e.currentTarget.style.boxShadow = addressError
                      ? `0 0 0 3px ${pos.error}22`
                      : `0 0 0 3px ${pos.roleSoft}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = addressError ? pos.error : pos.border;
                    e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.35)';
                    // Trigger geocoding when user leaves pincode field
                    handleAddressGeocode();
                  }}
                />
              </div>

              {/* Geocoding status indicator */}
              {orderType === 'DELIVERY' && (deliveryCity || deliveryPincode) && (
                <div style={{
                  marginBottom: pos.space[3],
                  padding: pos.space[2],
                  borderRadius: '8px',
                  fontSize: pos.type.fontSize.xs,
                  display: 'flex',
                  alignItems: 'center',
                  gap: pos.space[2],
                  backgroundColor: geocodingStatus === 'success'
                    ? pos.successSoft
                    : geocodingStatus === 'error'
                    ? pos.errorSoft
                    : pos.infoSoft,
                  color: geocodingStatus === 'success'
                    ? pos.success
                    : geocodingStatus === 'error'
                    ? pos.error
                    : pos.info
                }}>
                  {geocoding && <span><SyncIcon style={{ fontSize: '14px', marginRight: '4px', verticalAlign: 'middle' }} />Finding location...</span>}
                  {!geocoding && geocodingStatus === 'success' && deliveryLatitude && (
                    <span>
                      <CheckCircleOutlineIcon style={{ fontSize: '14px', marginRight: '4px', verticalAlign: 'middle' }} />Location found: {deliveryLatitude.toFixed(4)}, {deliveryLongitude?.toFixed(4)}
                    </span>
                  )}
                  {!geocoding && geocodingStatus === 'error' && (
                    <span><WarningAmberIcon style={{ fontSize: '14px', marginRight: '4px', verticalAlign: 'middle' }} />{geocodingError || 'Could not find location - will use test coordinates in dev mode'}</span>
                  )}
                  {!geocoding && geocodingStatus === 'idle' && (
                    <span><LocationOnIcon style={{ fontSize: '14px', marginRight: '4px', verticalAlign: 'middle' }} />Enter city & pincode to find GPS coordinates</span>
                  )}
                </div>
              )}

              <textarea
                placeholder="Special instructions (optional)"
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  padding: pos.space[3],
                  marginBottom: addressError ? pos.space[1] : 0,
                  border: `2px solid ${pos.border}`,
                  borderRadius: '10px',
                  outline: 'none',
                  backgroundColor: pos.surfaceElevated,
                  fontSize: pos.type.fontSize.sm,
                  color: pos.ink,
                  fontFamily: pos.font,
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
                  resize: 'vertical',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = pos.role;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${pos.roleSoft}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = pos.border;
                  e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.35)';
                }}
              />

              {addressError && (
                <p style={{
                  margin: 0,
                  fontSize: pos.type.fontSize.xs,
                  color: pos.error
                }}>
                  <WarningAmberIcon style={{ fontSize: '12px', marginRight: '4px', verticalAlign: 'middle' }} />{addressError}
                </p>
              )}
            </>
          )}
        </div>

        {/* Order Source — Global-6 */}
        <div style={{
            marginBottom: 14,
            padding: 16,
            borderRadius: 18,
            background: `linear-gradient(165deg, ${pos.surfaceElevated}, ${pos.surface})`,
            border: `1px solid ${pos.border}`,
            boxShadow: pos.shadow.raised.sm,
          }}
        >
          <p style={{
            margin: '0 0 12px 0',
            fontSize: 13,
            fontWeight: 800,
            color: pos.ink,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{
              width: 24, height: 24, borderRadius: 8, background: pos.roleSoft, color: pos.role,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900,
            }}>2</span>
            Order source
          </p>
          <select
            value={orderSource}
            onChange={(e) => {
              const val = e.target.value as typeof orderSource;
              setOrderSource(val);
              if (val === 'MASOVA') setAggregatorOrderId('');
            }}
            style={{
              width: '100%',
              padding: `${pos.space[2]} ${pos.space[3]}`,
              borderRadius: '10px',
              border: `2px solid ${pos.border}`,
              background: pos.surfaceElevated,
              fontFamily: pos.font,
              fontSize: pos.type.fontSize.sm,
              color: pos.ink,
              marginBottom: pos.space[3],
            }}
          >
            <option value="MASOVA">MaSoVa (Direct)</option>
            <option value="WOLT">Wolt</option>
            <option value="DELIVEROO">Deliveroo</option>
            <option value="JUST_EAT">Just Eat</option>
            <option value="UBER_EATS">Uber Eats</option>
          </select>
          {orderSource !== 'MASOVA' && (
            <input
              type="text"
              value={aggregatorOrderId}
              onChange={(e) => setAggregatorOrderId(e.target.value)}
              placeholder="Aggregator Order ID (optional)"
              style={{
                width: '100%',
                padding: `${pos.space[2]} ${pos.space[3]}`,
                borderRadius: '10px',
                border: `2px solid ${pos.border}`,
                background: pos.surfaceElevated,
                fontFamily: pos.font,
                fontSize: pos.type.fontSize.sm,
                color: pos.ink,
                boxSizing: 'border-box',
              }}
            />
          )}
        </div>

        {/* Compact summary (detail totals also on cart column) */}
        {items.length > 0 && (
          <div
            style={{
              marginBottom: pos.space[3],
              padding: pos.space[3],
              borderRadius: pos.radius.md,
              background: pos.roleSoft,
              border: `1px solid ${pos.roleBorder}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 4,
                fontSize: 12,
                color: pos.muted,
              }}
            >
              <span>{items.reduce((n, i) => n + i.quantity, 0)} items · {orderType.replace('_', ' ')}</span>
              <span style={{ fontWeight: 600, color: pos.ink }}>{fmt(subtotal)}</span>
            </div>
            {orderType === 'DELIVERY' && deliveryFee > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                  fontSize: 12,
                  color: pos.muted,
                }}
              >
                <span>Delivery</span>
                <span style={{ fontWeight: 600, color: pos.ink }}>{fmt(deliveryFee)}</span>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 4,
                fontSize: 12,
                color: pos.muted,
              }}
            >
              <span>{taxLabel}</span>
              <span style={{ fontWeight: 600, color: pos.ink }}>{formatTaxDisplay(tax, fmt)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 8,
                paddingTop: 8,
                borderTop: `1px solid ${pos.border}`,
              }}
            >
              <span style={{ fontWeight: 800, color: pos.ink }}>Total</span>
              <span style={{ fontWeight: 800, fontSize: 18, color: pos.role }}>{fmt(total)}</span>
            </div>
          </div>
        )}

        {items.length === 0 && (
          <div
            data-testid="pay-empty-hint"
            style={{
              marginTop: pos.space[4],
              padding: pos.space[5],
              borderRadius: pos.radius.lg,
              border: `2px dashed ${pos.border}`,
              background: pos.surface,
              textAlign: 'center',
              color: pos.muted,
              fontSize: 13,
            }}
          >
            <WarningAmberIcon style={{ fontSize: 28, color: pos.warning, display: 'block', margin: '0 auto 8px' }} />
            Build the ticket first — then pay here.
          </div>
        )}
      </div>

      {/* Sticky pay dock */}
      <div
        data-testid="pos-pay-dock"
        style={{
          flexShrink: 0,
          padding: 14,
          borderTop: `1px solid ${pos.border}`,
          background: `linear-gradient(180deg, ${pos.surfaceElevated} 0%, ${pos.surface} 100%)`,
          boxShadow: '0 -16px 40px rgba(0,0,0,0.45)',
        }}
      >
        <p
          style={{
            margin: `0 0 ${pos.space[2]} 0`,
            fontSize: 11,
            fontWeight: 700,
            color: pos.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <PaymentIcon style={{ fontSize: 16, color: pos.role }} />
          Payment method
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(paymentMethods.filter((m) => !(orderType === 'DELIVERY' && m === 'CASH')).length || 1, 3)}, 1fr)`,
            gap: 8,
            marginBottom: pos.space[2],
          }}
        >
          {paymentMethods
            .filter((method) => !(orderType === 'DELIVERY' && method === 'CASH'))
            .map((method) => {
              const active = paymentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  data-testid={`pay-method-${method}`}
                  style={{
                    ...posTouchBtnBase,
                    minHeight: 52,
                    fontSize: 13,
                    letterSpacing: '0.02em',
                    ...(active
                      ? {
                          background: `linear-gradient(135deg, ${pos.role} 0%, ${pos.roleDark} 100%)`,
                          color: '#ffffff',
                          boxShadow: `0 4px 14px ${pos.roleShadow}`,
                          border: `2px solid ${pos.role}`,
                        }
                      : {
                          background: pos.surfaceElevated,
                          color: pos.muted,
                          border: `2px solid ${pos.border}`,
                        }),
                  }}
                >
                  {method}
                </button>
              );
            })}
        </div>
        {paymentMethod === 'CASH' && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: pos.radius.sm,
              background: pos.infoSoft,
              border: `1px solid ${pos.info}`,
              fontSize: 12,
              color: pos.ink,
              marginBottom: pos.space[2],
            }}
          >
            Cash — collect at counter, then mark paid in History if needed
          </div>
        )}
        <button
          type="button"
          data-testid="pos-charge-button"
          onClick={handlePlaceOrderClick}
          disabled={!canSubmit}
          style={{
            ...posTouchBtnPrimary,
            width: '100%',
            minHeight: 56,
            fontSize: 17,
            letterSpacing: '0.02em',
            border: 'none',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            color: canSubmit ? '#ffffff' : pos.faint,
            background: canSubmit
              ? `linear-gradient(135deg, ${pos.role} 0%, ${pos.roleDark} 100%)`
              : pos.surfaceElevated,
            boxShadow: canSubmit ? `0 10px 28px ${pos.roleShadow}` : 'none',
            opacity: canSubmit ? 1 : 0.7,
            borderRadius: 999,
          }}
        >
          {isSubmitting
            ? 'Processing…'
            : items.length === 0
              ? 'Add items to place order'
              : `Place order ${fmt(total)} · ${paymentMethod}`}
        </button>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 11,
            color: pos.faint,
            textAlign: 'center',
          }}
        >
          PIN required · Ctrl+Enter to charge
        </p>
      </div>

      <PINAuthModal
        isOpen={showPINModal}
        onClose={() => setShowPINModal(false)}
        onAuthenticated={handlePINAuthenticated}
      />
    </div>
  );
};

export default CustomerPanel;
