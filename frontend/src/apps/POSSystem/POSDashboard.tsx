// src/apps/POSSystem/POSDashboard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import {
  selectSelectedStoreId,
  selectSelectedStoreName,
  setSelectedStore,
  setStoreCurrency,
  selectCartCurrency,
  selectCartLocale,
  selectStoreCountryCode,
  selectDeliveryFeeINR,
} from '../../store/slices/cartSlice';
import { formatMajorAmount, apiPriceToCartMajor } from '../../utils/currency';
import { storeCurrencyPayload } from '../../utils/storeCurrency';
import { computePreCheckoutTotals } from '../../utils/orderTax';
import { useGetStoreQuery } from '../../store/api/storeApi';
import MenuPanel from './components/MenuPanel';
import OrderPanel from './components/OrderPanel';
import CustomerPanel from './components/CustomerPanel';
import MetricsTiles from './components/MetricsTiles';
import ClockInModal from './components/ClockInModal';
import ClockOutModal from './components/ClockOutModal';
import { PINAuthModal } from './components/PINAuthModal';
import OrderHistory from './OrderHistory';
import Button from '../../components/ui/neumorphic/Button';
import Badge from '../../components/ui/neumorphic/Badge';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PeopleIcon from '@mui/icons-material/People';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  useGetTodaySalesMetricsQuery,
  useGetSalesTrendsQuery,
  useGetStaffLeaderboardQuery,
  useGetTopProductsQuery,
} from '../../store/api/analyticsApi';
import { useGetStoreOrdersQuery, type Order } from '../../store/api/orderApi';
import type { MenuItem } from '../../store/api/menuApi';
import type { POSCustomer, POSOrderItem } from './types';
import { getRtkErrorMessage } from '../shared/rtkError';
import { useRecordCashPaymentMutation } from '../../store/api/paymentApi';
import { useGetActiveStoreSessionsQuery } from '../../store/api/sessionApi';
import { useSnackbar } from 'notistack';
import { pos, posPanelShell, posTouchBtnBase } from './posTokens';
import {
  POS_TABS,
  type PosTab,
  orderStatusBadgeVariant,
  paymentMethodBadgeStyle,
  resolvePosDeliveryFee,
  formatPosTime,
  sumOrderTotals,
} from './posHelpers';

/**
 * POS Dashboard — dense cashier board for live shifts (F2e).
 * Orders | History | Reports; dark-premium tokens + warm orange accent.
 */
const POSDashboard: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const currency = useAppSelector(selectCartCurrency);
  const locale = useAppSelector(selectCartLocale);
  const cartDeliveryFee = useAppSelector(selectDeliveryFeeINR);
  const storeCountryCode = useAppSelector(selectStoreCountryCode);
  const fmt = (v: number) => formatMajorAmount(v, currency, locale);
  const [searchParams] = useSearchParams();
  const { user } = useAppSelector((state) => state.auth);
  const { enqueueSnackbar } = useSnackbar();

  const selectedStoreId = useAppSelector(selectSelectedStoreId);
  const selectedStoreName = useAppSelector(selectSelectedStoreName);

  const isManager = user?.type === 'MANAGER';

  const urlStoreId = searchParams.get('storeId');
  const storeId = urlStoreId || selectedStoreId || user?.storeId;

  const { data: storeProfile } = useGetStoreQuery(storeId ?? '', { skip: !storeId });

  useEffect(() => {
    if (urlStoreId && urlStoreId !== selectedStoreId) {
      dispatch(setSelectedStore({ storeId: urlStoreId, storeName: 'Store ' + urlStoreId }));
    }
  }, [urlStoreId, selectedStoreId, dispatch]);

  useEffect(() => {
    if (!storeProfile || !storeId) return;
    dispatch(setSelectedStore({ storeId, storeName: storeProfile.name }));
    dispatch(setStoreCurrency(storeCurrencyPayload(storeProfile)));
  }, [storeProfile, storeId, dispatch]);

  const [activeTab, setActiveTab] = useState<PosTab>('orders');
  const [clockInModalOpen, setClockInModalOpen] = useState(false);
  const [clockOutModalOpen, setClockOutModalOpen] = useState(false);
  const [showPINModal, setShowPINModal] = useState(false);
  const [orderUser, setOrderUser] = useState<{
    userId: string;
    name: string;
    type: string;
    role: string;
    storeId: string;
  } | null>(null);

  const [orderItems, setOrderItems] = useState<POSOrderItem[]>([]);
  const [customer, setCustomer] = useState<POSCustomer | null>(null);
  const [orderType, setOrderType] = useState<'PICKUP' | 'DELIVERY' | 'DINE_IN'>('PICKUP');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const submitOrderRef = React.useRef<(() => void) | null>(null);
  const [recordCashPayment] = useRecordCashPaymentMutation();

  const { data: activeSessions = [] } = useGetActiveStoreSessionsQuery(storeId || '', {
    skip: !storeId || !isManager,
  });

  const {
    data: todayData,
    isLoading: todayLoading,
    isError: todayError,
    refetch: refetchToday,
  } = useGetTodaySalesMetricsQuery(storeId, {
    skip: activeTab !== 'reports' || !storeId,
  });
  const {
    data: weekData,
    isLoading: weekLoading,
    isError: weekError,
  } = useGetSalesTrendsQuery(
    { period: 'WEEKLY', storeId },
    { skip: activeTab !== 'reports' || !storeId }
  );
  const {
    data: monthData,
    isLoading: monthLoading,
    isError: monthError,
  } = useGetSalesTrendsQuery(
    { period: 'MONTHLY', storeId },
    { skip: activeTab !== 'reports' || !storeId }
  );
  const {
    data: topProducts,
    isLoading: topLoading,
    isError: topError,
  } = useGetTopProductsQuery(
    { period: 'TODAY', sortBy: 'REVENUE', storeId },
    { skip: activeTab !== 'reports' || !storeId }
  );
  const {
    data: staffData,
    isLoading: staffLoading,
    isError: staffError,
  } = useGetStaffLeaderboardQuery(
    { period: 'TODAY', storeId },
    { skip: activeTab !== 'reports' || !storeId || !isManager }
  );
  const {
    data: orders = [],
    isLoading: ordersLoading,
    isError: ordersError,
    refetch: refetchOrders,
  } = useGetStoreOrdersQuery(storeId, {
    skip: !storeId || activeTab !== 'reports',
  });

  const today = new Date().toDateString();
  const todayOrders = orders.filter((order: Order) => {
    return new Date(order.createdAt).toDateString() === today;
  });
  const totalSales = sumOrderTotals(todayOrders);

  const handleNewOrder = useCallback(() => {
    setOrderItems([]);
    setCustomer(null);
    setSelectedTable(null);
    setOrderUser(null);

    if (!user) {
      setShowPINModal(true);
    } else {
      setOrderUser({
        userId: user.id,
        name: user.name,
        type: user.type,
        role: user.role || 'Staff',
        storeId: user.storeId || storeId || '',
      });
      enqueueSnackbar(`Order started by ${user.name}`, { variant: 'success' });
    }
  }, [user, storeId, enqueueSnackbar]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setActiveTab('orders');
      }
      if (e.key === 'F2') {
        e.preventDefault();
        setActiveTab('history');
      }
      if (e.key === 'F3') {
        e.preventDefault();
        setActiveTab('reports');
      }
      if (e.key === 'Escape' && activeTab === 'orders') {
        e.preventDefault();
        handleNewOrder();
      }
      if (e.key === 'Enter' && e.ctrlKey && activeTab === 'orders') {
        e.preventDefault();
        submitOrderRef.current?.();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [activeTab, handleNewOrder]);

  const handleAddItem = (item: MenuItem, quantity: number = 1) => {
    const existingIndex = orderItems.findIndex((orderItem) => orderItem.menuItemId === item.id);

    if (existingIndex >= 0) {
      const updatedItems = [...orderItems];
      updatedItems[existingIndex].quantity += quantity;
      setOrderItems(updatedItems);
    } else {
      setOrderItems([
        ...orderItems,
        {
          menuItemId: item.id,
          name: item.name,
          price: apiPriceToCartMajor(item.basePrice, currency),
          quantity,
          specialInstructions: '',
          image: item.imageUrl,
          allergens: item.allergens ?? [],
        },
      ]);
    }
  };

  const handleRemoveItem = (menuItemId: string) => {
    setOrderItems(orderItems.filter((item) => item.menuItemId !== menuItemId));
  };

  const handleUpdateQuantity = (menuItemId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveItem(menuItemId);
    } else {
      setOrderItems(
        orderItems.map((item) =>
          item.menuItemId === menuItemId ? { ...item, quantity } : item
        )
      );
    }
  };

  const handleUpdateInstructions = (menuItemId: string, instructions: string) => {
    setOrderItems(
      orderItems.map((item) =>
        item.menuItemId === menuItemId ? { ...item, specialInstructions: instructions } : item
      )
    );
  };

  const handlePINAuthenticated = (userData: {
    userId: string;
    name: string;
    type: string;
    role: string;
    storeId: string;
  }) => {
    setOrderUser(userData);
    setShowPINModal(false);
    enqueueSnackbar(`Order started by ${userData.name}`, { variant: 'success' });
  };

  const handleOrderComplete = () => {
    setOrderItems([]);
    setCustomer(null);
    setSelectedTable(null);
    setOrderUser(null);
    enqueueSnackbar('Order completed successfully!', { variant: 'success' });
  };

  const handleMarkAsPaid = async (order: Order) => {
    const confirmed = window.confirm(
      `Mark this order as PAID?\n\n` +
        `Order: #${order.orderNumber}\n` +
        `Amount: ${fmt(order.total)}\n` +
        `Payment Method: ${order.paymentMethod}\n\n` +
        `This confirms that CASH payment has been received.`
    );

    if (!confirmed) return;

    try {
      await recordCashPayment({
        orderId: order.id,
        amount: order.total,
        customerId: order.customerId || 'walk-in',
        customerEmail: order.customerEmail || undefined,
        customerPhone: order.customerPhone || '0000000000',
        storeId: order.storeId,
        orderType: order.orderType,
        paymentMethod: 'CASH',
        notes: `Cash payment recorded for Order #${order.orderNumber}`,
      }).unwrap();

      enqueueSnackbar(
        `Order #${order.orderNumber} marked as PAID — Cash payment of ${fmt(order.total)} recorded.`,
        { variant: 'success' }
      );
    } catch (error: unknown) {
      console.error('Failed to record cash payment:', error);
      enqueueSnackbar(
        `Failed to mark order as paid. ${getRtkErrorMessage(error, 'Please try again.')}`,
        { variant: 'error' }
      );
    }
  };

  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = resolvePosDeliveryFee(orderType, subtotal, cartDeliveryFee);
  const { total: orderTotal } = computePreCheckoutTotals(subtotal, deliveryFee, storeCountryCode);

  const reportsLoading = todayLoading || weekLoading || monthLoading;

  const kpiCard = (
    title: string,
    value: string,
    subtitle: string,
    accent: string,
    loading?: boolean,
    error?: boolean
  ) => (
    <div
      style={{
        padding: pos.space[4],
        borderRadius: pos.radius.lg,
        backgroundColor: pos.surface,
        boxShadow: pos.shadow.raised.sm,
        border: `1px solid ${pos.border}`,
        borderLeft: `4px solid ${accent}`,
        minHeight: 96,
      }}
      data-testid={`pos-kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div
        style={{
          fontSize: pos.type.fontSize.xs,
          color: pos.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: pos.space[2],
          fontWeight: pos.type.fontWeight.semibold,
        }}
      >
        {title}
      </div>
      {error ? (
        <div style={{ fontSize: pos.type.fontSize.sm, color: pos.error }}>Unavailable</div>
      ) : loading ? (
        <div
          style={{
            width: 80,
            height: 28,
            borderRadius: 6,
            background: pos.border,
            animation: 'posPulse 1.5s ease-in-out infinite',
          }}
        />
      ) : (
        <>
          <div
            style={{
              fontSize: pos.type.fontSize['2xl'],
              fontWeight: pos.type.fontWeight.extrabold,
              color: pos.ink,
              marginBottom: pos.space[1],
            }}
          >
            {value}
          </div>
          <div style={{ fontSize: pos.type.fontSize.xs, color: pos.muted }}>{subtitle}</div>
        </>
      )}
    </div>
  );

  return (
    <div
      data-testid="pos-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: pos.surfaceBg,
        fontFamily: pos.font,
      }}
    >
      <style>{`
        @keyframes posPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>

      {/* Header */}
      <header
        data-testid="pos-header"
        style={{
          minHeight: 64,
          backgroundColor: pos.headerBg,
          borderBottom: `3px solid ${pos.role}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${pos.space[4]}`,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          flexShrink: 0,
          gap: pos.space[3],
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: pos.space[3] }}>
          <div
            style={{
              fontSize: pos.type.fontSize.xl,
              fontWeight: pos.type.fontWeight.extrabold,
              color: pos.ink,
              letterSpacing: '-0.3px',
            }}
          >
            MaSoVa{' '}
            <span style={{ color: pos.role }}>POS</span>
          </div>
          <div
            style={{
              height: 28,
              width: 1,
              backgroundColor: 'rgba(255,255,255,0.12)',
            }}
          />
          <div
            data-testid="pos-store-label"
            style={{
              fontSize: pos.type.fontSize.sm,
              color: pos.headerMuted,
              fontWeight: pos.type.fontWeight.semibold,
            }}
          >
            {selectedStoreName || storeId || 'Point of Sale'}
            {storeCountryCode ? (
              <span style={{ marginLeft: 8, color: pos.role, fontSize: pos.type.fontSize.xs }}>
                {storeCountryCode} · {currency}
              </span>
            ) : null}
          </div>
        </div>

        {/* Tabs — all cashier roles */}
        <nav
          data-testid="pos-tab-bar"
          style={{
            display: 'flex',
            gap: 4,
            backgroundColor: pos.headerBgAlt,
            padding: 4,
            borderRadius: pos.radius.md,
          }}
          aria-label="POS sections"
        >
          {POS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              data-testid={`pos-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              style={{
                ...posTouchBtnBase,
                minHeight: 44,
                padding: `${pos.space[2]} ${pos.space[4]}`,
                borderRadius: pos.radius.sm,
                fontSize: pos.type.fontSize.sm,
                ...(activeTab === tab.key
                  ? {
                      background: `linear-gradient(135deg, ${pos.role} 0%, ${pos.roleDark} 100%)`,
                      color: '#ffffff',
                      boxShadow: `0 4px 12px ${pos.roleShadow}`,
                    }
                  : {
                      background: 'transparent',
                      color: pos.headerMuted,
                    }),
              }}
            >
              {tab.label}
              <span
                style={{
                  fontSize: 10,
                  opacity: 0.7,
                  fontWeight: pos.type.fontWeight.medium,
                }}
              >
                {tab.shortcut}
              </span>
            </button>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: pos.space[3], flexWrap: 'wrap' }}>
          {orderUser && (
            <div
              data-testid="pos-order-user"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: pos.space[2],
                padding: `${pos.space[2]} ${pos.space[3]}`,
                backgroundColor: pos.headerBgAlt,
                borderRadius: pos.radius.md,
                border: `2px solid ${pos.success}`,
                minHeight: pos.touchMin,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: pos.success,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: pos.headerMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Taking Order
                </div>
                <div
                  style={{
                    fontSize: pos.type.fontSize.sm,
                    color: pos.success,
                    fontWeight: pos.type.fontWeight.bold,
                  }}
                >
                  {orderUser.name}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'orders' && orderItems.length > 0 && (
            <div
              data-testid="pos-cart-total"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: pos.space[2],
                padding: `${pos.space[2]} ${pos.space[3]}`,
                backgroundColor: pos.roleSoft,
                border: `1px solid ${pos.roleBorder}`,
                borderRadius: pos.radius.md,
                minHeight: pos.touchMin,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: pos.headerMuted,
                  textTransform: 'uppercase',
                }}
              >
                Cart
              </span>
              <span
                style={{
                  fontSize: pos.type.fontSize.lg,
                  fontWeight: pos.type.fontWeight.extrabold,
                  color: pos.role,
                }}
              >
                {fmt(orderTotal)}
              </span>
            </div>
          )}

          {isManager && (
            <div style={{ display: 'flex', gap: pos.space[2] }}>
              <button
                type="button"
                onClick={() => setClockInModalOpen(true)}
                style={{
                  ...posTouchBtnBase,
                  background: `linear-gradient(135deg, ${pos.success} 0%, ${pos.successDark} 100%)`,
                  color: '#ffffff',
                  boxShadow: `0 4px 12px ${pos.success}55`,
                }}
              >
                Clock In
              </button>
              <button
                type="button"
                onClick={() => setClockOutModalOpen(true)}
                disabled={activeSessions.length === 0}
                style={{
                  ...posTouchBtnBase,
                  background:
                    activeSessions.length === 0
                      ? pos.faint
                      : `linear-gradient(135deg, ${pos.error} 0%, ${pos.errorDark} 100%)`,
                  color: '#ffffff',
                  opacity: activeSessions.length === 0 ? 0.5 : 1,
                  cursor: activeSessions.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Clock Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ORDERS — dense 3-column board */}
      {activeTab === 'orders' && (
        <div
          data-testid="pos-orders-board"
          style={{
            flex: 1,
            overflow: 'hidden',
            padding: pos.space[3],
            backgroundColor: pos.surfaceBg,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: pos.space[3],
              flex: 1,
              minHeight: 0,
            }}
          >
            <div style={{ ...posPanelShell, flex: '5 1 0' }} data-testid="pos-menu-column">
              <MenuPanel onAddItem={handleAddItem} />
            </div>
            <div style={{ ...posPanelShell, flex: '3 1 0' }} data-testid="pos-cart-column">
              <OrderPanel
                items={orderItems}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveItem={handleRemoveItem}
                onUpdateInstructions={handleUpdateInstructions}
                onNewOrder={handleNewOrder}
                orderType={orderType}
                onOrderTypeChange={setOrderType}
                selectedTable={selectedTable}
                onTableSelect={setSelectedTable}
              />
            </div>
            <div style={{ ...posPanelShell, flex: '3 1 0' }} data-testid="pos-pay-column">
              <CustomerPanel
                items={orderItems}
                customer={customer}
                onCustomerChange={setCustomer}
                orderType={orderType}
                selectedTable={selectedTable}
                onOrderComplete={handleOrderComplete}
                userId={user?.id || orderUser?.userId}
                storeId={storeId}
                submitOrderRef={submitOrderRef}
                orderCreatedBy={orderUser}
              />
            </div>
          </div>
        </div>
      )}

      {/* HISTORY */}
      {activeTab === 'history' && (
        <div
          data-testid="pos-history-panel"
          style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}
        >
          <OrderHistory embedded storeIdOverride={storeId || undefined} />
        </div>
      )}

      {/* REPORTS */}
      {activeTab === 'reports' && (
        <div
          data-testid="pos-reports-panel"
          style={{
            flex: 1,
            overflow: 'auto',
            padding: pos.space[4],
            backgroundColor: pos.surfaceBg,
          }}
        >
          {!storeId && (
            <div
              data-testid="pos-reports-no-store"
              style={{
                padding: pos.space[6],
                textAlign: 'center',
                color: pos.muted,
                border: `2px dashed ${pos.border}`,
                borderRadius: pos.radius.lg,
                background: pos.surface,
              }}
            >
              Select a store to load reports.
            </div>
          )}

          {storeId && (
            <>
              {todayError && (
                <div
                  data-testid="pos-reports-error"
                  style={{
                    marginBottom: pos.space[4],
                    padding: pos.space[4],
                    borderRadius: pos.radius.md,
                    background: pos.warningSoft,
                    border: `2px solid ${pos.warning}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: pos.space[3],
                    flexWrap: 'wrap',
                  }}
                >
                  <WarningAmberIcon style={{ color: pos.warningDark }} />
                  <span style={{ flex: 1, color: pos.ink }}>Unable to load sales metrics.</span>
                  <button
                    type="button"
                    onClick={() => void refetchToday()}
                    style={{
                      ...posTouchBtnBase,
                      background: pos.role,
                      color: '#ffffff',
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: pos.space[3],
                  marginBottom: pos.space[5],
                }}
              >
                {kpiCard(
                  "Today's Sales",
                  fmt(todayData?.todaySales || 0),
                  todayData?.percentChangeFromYesterday != null
                    ? `${todayData.percentChangeFromYesterday >= 0 ? '↑' : '↓'} ${Math.abs(todayData.percentChangeFromYesterday).toFixed(1)}% vs yesterday`
                    : '—',
                  pos.success,
                  todayLoading,
                  todayError
                )}
                {kpiCard(
                  'This Week',
                  fmt(weekData?.totalSales || 0),
                  `${weekData?.totalOrders || 0} orders`,
                  pos.role,
                  weekLoading,
                  weekError
                )}
                {kpiCard(
                  'This Month',
                  fmt(monthData?.totalSales || 0),
                  `${monthData?.totalOrders || 0} orders`,
                  pos.warning,
                  monthLoading,
                  monthError
                )}
                {kpiCard(
                  "Today's Orders",
                  String(todayOrders.length),
                  `${fmt(totalSales)} total`,
                  pos.info,
                  ordersLoading,
                  ordersError
                )}
              </div>

              <div style={{ marginBottom: pos.space[5] }}>
                <h2
                  style={{
                    margin: `0 0 ${pos.space[3]} 0`,
                    fontSize: pos.type.fontSize.lg,
                    fontWeight: pos.type.fontWeight.bold,
                    color: pos.ink,
                  }}
                >
                  Real-Time Performance
                </h2>
                <MetricsTiles storeId={storeId} />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: pos.space[4],
                  marginBottom: pos.space[5],
                }}
              >
                {/* Top sellers */}
                <div
                  style={{
                    padding: pos.space[4],
                    borderRadius: pos.radius.lg,
                    backgroundColor: pos.surface,
                    boxShadow: pos.shadow.raised.sm,
                    border: `1px solid ${pos.border}`,
                  }}
                >
                  <h3
                    style={{
                      margin: `0 0 ${pos.space[3]} 0`,
                      fontSize: pos.type.fontSize.base,
                      fontWeight: pos.type.fontWeight.bold,
                      color: pos.ink,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <LocalFireDepartmentIcon style={{ fontSize: 20, color: pos.error }} />
                    Top Sellers Today
                  </h3>
                  {topLoading && (
                    <div data-testid="pos-top-sellers-loading" style={{ color: pos.muted }}>
                      Loading…
                    </div>
                  )}
                  {topError && (
                    <div data-testid="pos-top-sellers-error" style={{ color: pos.error }}>
                      Could not load top products.
                    </div>
                  )}
                  {!topLoading && !topError && topProducts && topProducts.topProducts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: pos.space[2] }}>
                      {topProducts.topProducts.slice(0, 5).map((item, index) => (
                        <div
                          key={item.itemId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: pos.space[3],
                            borderRadius: pos.radius.md,
                            backgroundColor: index === 0 ? pos.warningSoft : pos.surfaceElevated,
                            border:
                              index === 0
                                ? `2px solid ${pos.warning}`
                                : `1px solid ${pos.border}`,
                            minHeight: pos.touchMin,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: pos.space[2] }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                backgroundColor: index === 0 ? pos.warning : pos.role,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: pos.inverse,
                                fontWeight: pos.type.fontWeight.bold,
                                fontSize: pos.type.fontSize.sm,
                              }}
                            >
                              {index === 0 ? (
                                <EmojiEventsIcon style={{ fontSize: 18 }} />
                              ) : (
                                `#${index + 1}`
                              )}
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: pos.type.fontSize.sm,
                                  fontWeight: pos.type.fontWeight.bold,
                                  color: pos.ink,
                                }}
                              >
                                {item.itemName || 'Product'}
                              </div>
                              <div style={{ fontSize: pos.type.fontSize.xs, color: pos.muted }}>
                                {item.quantitySold} sold
                              </div>
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: pos.type.fontSize.sm,
                              fontWeight: pos.type.fontWeight.bold,
                              color: pos.success,
                            }}
                          >
                            {fmt(item.revenue)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!topLoading &&
                    !topError &&
                    (!topProducts || topProducts.topProducts.length === 0) && (
                      <div
                        data-testid="pos-top-sellers-empty"
                        style={{
                          padding: pos.space[6],
                          textAlign: 'center',
                          color: pos.muted,
                        }}
                      >
                        No sales data yet today
                      </div>
                    )}
                </div>

                {/* Recent orders */}
                <div
                  style={{
                    padding: pos.space[4],
                    borderRadius: pos.radius.lg,
                    backgroundColor: pos.surface,
                    boxShadow: pos.shadow.raised.sm,
                    border: `1px solid ${pos.border}`,
                  }}
                >
                  <h3
                    style={{
                      margin: `0 0 ${pos.space[3]} 0`,
                      fontSize: pos.type.fontSize.base,
                      fontWeight: pos.type.fontWeight.bold,
                      color: pos.ink,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <ReceiptLongIcon style={{ fontSize: 20, color: pos.role }} />
                    Recent Orders
                  </h3>
                  {ordersLoading && (
                    <div data-testid="pos-recent-orders-loading" style={{ color: pos.muted }}>
                      Loading…
                    </div>
                  )}
                  {ordersError && (
                    <div
                      data-testid="pos-recent-orders-error"
                      style={{
                        color: pos.error,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      Could not load orders.
                      <button
                        type="button"
                        onClick={() => void refetchOrders()}
                        style={{
                          ...posTouchBtnBase,
                          minHeight: 36,
                          background: pos.role,
                          color: pos.inverse,
                          fontSize: 12,
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {!ordersLoading && !ordersError && todayOrders.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: pos.space[2] }}>
                      {todayOrders.slice(0, 5).map((order: Order) => {
                        const payStyle = paymentMethodBadgeStyle(order.paymentMethod);
                        return (
                          <div
                            key={order.id}
                            style={{
                              padding: pos.space[3],
                              borderRadius: pos.radius.md,
                              backgroundColor: pos.surfaceElevated,
                              border: `1px solid ${pos.border}`,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: pos.space[2],
                              flexWrap: 'wrap',
                              minHeight: pos.touchMin,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: pos.type.fontSize.sm,
                                  fontWeight: pos.type.fontWeight.semibold,
                                  color: pos.ink,
                                }}
                              >
                                #{order.orderNumber}
                              </div>
                              <div style={{ fontSize: pos.type.fontSize.xs, color: pos.muted }}>
                                {formatPosTime(order.createdAt, locale)}
                              </div>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: pos.space[2],
                                flexWrap: 'wrap',
                              }}
                            >
                              <Badge variant={orderStatusBadgeVariant(order.status)} size="sm">
                                {order.status.replace('_', ' ')}
                              </Badge>
                              {order.paymentMethod && (
                                <span
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    ...payStyle,
                                  }}
                                >
                                  {order.paymentMethod}
                                </span>
                              )}
                              {order.paymentStatus === 'PENDING' && (
                                <span
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    backgroundColor: pos.warningSoft,
                                    color: pos.warningDark,
                                  }}
                                >
                                  UNPAID
                                </span>
                              )}
                              <div
                                style={{
                                  fontSize: pos.type.fontSize.sm,
                                  fontWeight: pos.type.fontWeight.bold,
                                  color: pos.role,
                                }}
                              >
                                {fmt(order.total || 0)}
                              </div>
                              {order.paymentStatus === 'PENDING' &&
                                order.paymentMethod === 'CASH' && (
                                  <button
                                    type="button"
                                    onClick={() => void handleMarkAsPaid(order)}
                                    style={{
                                      ...posTouchBtnBase,
                                      minHeight: 40,
                                      padding: '8px 12px',
                                      backgroundColor: pos.success,
                                      color: pos.inverse,
                                      fontSize: 12,
                                    }}
                                  >
                                    <AttachMoneyIcon style={{ fontSize: 16 }} />
                                    Mark Paid
                                  </button>
                                )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!ordersLoading && !ordersError && todayOrders.length === 0 && (
                    <div
                      data-testid="pos-recent-orders-empty"
                      style={{
                        padding: pos.space[6],
                        textAlign: 'center',
                        color: pos.muted,
                      }}
                    >
                      No orders yet today
                    </div>
                  )}
                </div>
              </div>

              {isManager && (
                <div
                  style={{
                    padding: pos.space[4],
                    borderRadius: pos.radius.lg,
                    backgroundColor: pos.surface,
                    boxShadow: pos.shadow.raised.sm,
                    border: `1px solid ${pos.border}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: pos.space[3],
                      flexWrap: 'wrap',
                      gap: pos.space[2],
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: pos.type.fontSize.base,
                        fontWeight: pos.type.fontWeight.bold,
                        color: pos.ink,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <PeopleIcon style={{ fontSize: 20, color: pos.role }} />
                      Staff Leaderboard
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate('/manager?section=people&tab=leaderboard')}
                    >
                      Full Leaderboard →
                    </Button>
                  </div>
                  {staffLoading && <div style={{ color: pos.muted }}>Loading…</div>}
                  {staffError && (
                    <div style={{ color: pos.error }}>Could not load staff rankings.</div>
                  )}
                  {!staffLoading &&
                    !staffError &&
                    staffData &&
                    staffData.rankings.length > 0 && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                          gap: pos.space[3],
                        }}
                      >
                        {staffData.rankings.slice(0, 6).map((staff, index) => (
                          <div
                            key={staff.staffId}
                            style={{
                              padding: pos.space[3],
                              borderRadius: pos.radius.md,
                              background:
                                index === 0 ? pos.warningSoft : pos.surfaceElevated,
                              border:
                                index === 0
                                  ? `2px solid ${pos.warning}`
                                  : `1px solid ${pos.border}`,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              minHeight: pos.touchMin,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: pos.space[2] }}>
                              <div
                                style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: '50%',
                                  backgroundColor: index === 0 ? pos.warning : pos.role,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: pos.inverse,
                                  fontWeight: pos.type.fontWeight.bold,
                                }}
                              >
                                {index === 0 ? (
                                  <WorkspacePremiumIcon style={{ fontSize: 20 }} />
                                ) : (
                                  `#${index + 1}`
                                )}
                              </div>
                              <div>
                                <div
                                  style={{
                                    fontSize: pos.type.fontSize.sm,
                                    fontWeight: pos.type.fontWeight.bold,
                                    color: pos.ink,
                                  }}
                                >
                                  {staff.staffName}
                                </div>
                                <div style={{ fontSize: pos.type.fontSize.xs, color: pos.muted }}>
                                  {staff.ordersProcessed} orders
                                </div>
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: pos.type.fontSize.base,
                                fontWeight: pos.type.fontWeight.bold,
                                color: pos.success,
                              }}
                            >
                              {fmt(staff.salesGenerated)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  {!staffLoading &&
                    !staffError &&
                    (!staffData || staffData.rankings.length === 0) && (
                      <div style={{ color: pos.muted, textAlign: 'center', padding: pos.space[4] }}>
                        No staff sales rankings yet today
                      </div>
                    )}
                </div>
              )}

              {reportsLoading && (
                <div data-testid="pos-reports-loading" style={{ display: 'none' }} />
              )}
            </>
          )}
        </div>
      )}

      {storeId && (
        <ClockInModal
          isOpen={clockInModalOpen}
          onClose={() => setClockInModalOpen(false)}
          storeId={storeId}
        />
      )}
      {storeId && (
        <ClockOutModal
          isOpen={clockOutModalOpen}
          onClose={() => setClockOutModalOpen(false)}
          storeId={storeId}
        />
      )}
      <PINAuthModal
        isOpen={showPINModal}
        onClose={() => setShowPINModal(false)}
        onAuthenticated={handlePINAuthenticated}
      />
    </div>
  );
};

export default POSDashboard;
