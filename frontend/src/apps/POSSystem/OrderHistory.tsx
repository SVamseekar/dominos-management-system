// src/apps/POSSystem/OrderHistory.tsx
/**
 * POS order history — embeddable in dashboard or standalone.
 * Print labeled Unavailable (I5); store-scoped list with full states.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PrintIcon from '@mui/icons-material/Print';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useGetStoreOrdersQuery, type Order } from '../../store/api/orderApi';
import { getRtkErrorMessage } from '../shared/rtkError';
import { useRecordCashPaymentMutation } from '../../store/api/paymentApi';
import { useAppSelector } from '../../store/hooks';
import {
  selectCartCurrency,
  selectCartLocale,
  selectSelectedStoreId,
} from '../../store/slices/cartSlice';
import { formatMajorAmount } from '../../utils/currency';
import AppHeader from '../../components/common/AppHeader';
import Badge from '../../components/ui/neumorphic/Badge';
import { useSnackbar } from 'notistack';
import { pos, posTouchBtnBase } from './posTokens';
import {
  orderStatusBadgeVariant,
  paymentMethodBadgeStyle,
  formatPosTime,
  sumOrderTotals,
} from './posHelpers';

interface OrderHistoryProps {
  /** When true, omit full-page header/back chrome (used inside POSDashboard tab) */
  embedded?: boolean;
  storeIdOverride?: string;
}

const OrderHistory: React.FC<OrderHistoryProps> = ({
  embedded = false,
  storeIdOverride,
}) => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAppSelector((state) => state.auth);
  const currency = useAppSelector(selectCartCurrency);
  const locale = useAppSelector(selectCartLocale);
  const selectedStoreId = useAppSelector(selectSelectedStoreId);
  const fmt = (v: number) => formatMajorAmount(v, currency, locale);
  const storeId = storeIdOverride || selectedStoreId || user?.storeId;

  const [searchTerm, setSearchTerm] = useState('');
  const [recordCashPayment, { isLoading: markingPaid }] = useRecordCashPaymentMutation();

  const {
    data: orders = [],
    isLoading,
    error,
    refetch,
  } = useGetStoreOrdersQuery(storeId, {
    skip: !storeId,
  });

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
        `Order #${order.orderNumber} marked as PAID — ${fmt(order.total)}`,
        { variant: 'success' }
      );
    } catch (err: unknown) {
      console.error('Failed to record cash payment:', err);
      enqueueSnackbar(
        getRtkErrorMessage(err, 'Failed to mark order as paid.'),
        { variant: 'error' }
      );
    }
  };

  const today = new Date().toDateString();
  const todayOrders = orders.filter((order: Order) => {
    return new Date(order.createdAt).toDateString() === today;
  });

  const filteredOrders = todayOrders.filter((order: Order) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      order.orderNumber.toLowerCase().includes(searchLower) ||
      order.customerName?.toLowerCase().includes(searchLower) ||
      order.customerPhone?.includes(searchTerm)
    );
  });

  const totalSales = sumOrderTotals(filteredOrders);

  const body = (
    <div
      data-testid="pos-order-history"
      style={{
        flex: 1,
        overflow: 'auto',
        padding: embedded ? pos.space[4] : pos.space[6],
        background: pos.surfaceBg,
        backgroundImage: pos.glow,
        minHeight: 0,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <h2
          style={{
            margin: '0 0 4px',
            fontSize: 22,
            fontWeight: 900,
            color: pos.ink,
            letterSpacing: '-0.03em',
          }}
        >
          Today&apos;s orders
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: pos.muted }}>
          Search, mark cash paid, open in manager
        </p>
      </div>
      {/* Summary strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: pos.space[3],
          alignItems: 'center',
          marginBottom: pos.space[4],
        }}
      >
        <div
          style={{
            flex: '1 1 240px',
            position: 'relative',
          }}
        >
          <SearchIcon
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 18,
              color: pos.faint,
            }}
          />
          <input
            type="search"
            placeholder="Search order #, name, phone…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search orders"
            style={{
              width: '100%',
              minHeight: pos.touchMin,
              padding: '12px 14px 12px 44px',
              border: `2px solid ${pos.border}`,
              borderRadius: pos.radius.md,
              outline: 'none',
              backgroundColor: pos.surface,
              fontSize: pos.type.fontSize.sm,
              color: pos.ink,
              fontFamily: pos.font,
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            gap: pos.space[2],
            alignItems: 'center',
          }}
        >
          <div
            style={{
              minHeight: pos.touchMin,
              padding: '0 16px',
              borderRadius: pos.radius.md,
              background: pos.roleSoft,
              color: pos.roleDark,
              display: 'flex',
              alignItems: 'center',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {filteredOrders.length} orders
          </div>
          <div
            style={{
              minHeight: pos.touchMin,
              padding: '0 16px',
              borderRadius: pos.radius.md,
              background: `linear-gradient(135deg, ${pos.success} 0%, ${pos.successDark} 100%)`,
              color: pos.inverse,
              display: 'flex',
              alignItems: 'center',
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            {fmt(totalSales)}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            style={{
              ...posTouchBtnBase,
              background: pos.surface,
              color: pos.role,
              border: `2px solid ${pos.roleBorder}`,
            }}
            aria-label="Refresh orders"
          >
            <RefreshIcon style={{ fontSize: 20 }} />
          </button>
        </div>
      </div>

      {!storeId && (
        <div
          data-testid="history-no-store"
          style={{
            padding: pos.space[8],
            textAlign: 'center',
            border: `2px dashed ${pos.border}`,
            borderRadius: pos.radius.lg,
            background: pos.surface,
            color: pos.muted,
          }}
        >
          Select a store to load today’s orders.
        </div>
      )}

      {storeId && isLoading && (
        <div
          data-testid="history-loading"
          style={{
            display: 'grid',
            gap: 12,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 96,
                borderRadius: pos.radius.md,
                background: pos.border,
                animation: 'posHistPulse 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.08}s`,
              }}
            />
          ))}
          <style>{`
            @keyframes posHistPulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.45; }
            }
          `}</style>
        </div>
      )}

      {storeId && error && (
        <div
          data-testid="history-error"
          style={{
            padding: pos.space[6],
            borderRadius: pos.radius.lg,
            border: `2px solid ${pos.error}`,
            background: pos.errorSoft,
            textAlign: 'center',
          }}
        >
          <ErrorOutlineIcon style={{ fontSize: 32, color: pos.error, marginBottom: 8 }} />
          <div style={{ fontWeight: 700, color: pos.ink, marginBottom: 8 }}>
            Failed to load orders
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            style={{
              ...posTouchBtnBase,
              background: pos.role,
              color: pos.inverse,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {storeId && !isLoading && !error && filteredOrders.length === 0 && (
        <div
          data-testid="history-empty"
          style={{
            padding: pos.space[8],
            borderRadius: pos.radius.lg,
            border: `2px dashed ${pos.border}`,
            background: pos.surface,
            textAlign: 'center',
            color: pos.muted,
          }}
        >
          <InfoOutlinedIcon style={{ fontSize: 36, color: pos.faint, marginBottom: 8 }} />
          <div style={{ fontWeight: 700, color: pos.ink, marginBottom: 6 }}>
            {searchTerm ? 'No matching orders' : 'No orders today yet'}
          </div>
          <div style={{ fontSize: 13 }}>
            {searchTerm
              ? 'Try a different search.'
              : 'Completed POS charges will appear here for this store.'}
          </div>
        </div>
      )}

      {storeId && !isLoading && !error && filteredOrders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredOrders.map((order: Order) => {
            const payStyle = paymentMethodBadgeStyle(order.paymentMethod);
            return (
              <article
                key={order.id}
                data-testid={`history-order-${order.orderNumber}`}
                style={{
                  padding: pos.space[4],
                  borderRadius: 18,
                  background: `linear-gradient(165deg, ${pos.surfaceElevated}, ${pos.surface})`,
                  border: `1px solid ${pos.border}`,
                  boxShadow: pos.shadow.raised.sm,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  borderLeft: `3px solid ${pos.role}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 800,
                        color: pos.ink,
                      }}
                    >
                      Order #{order.orderNumber}
                    </div>
                    <div style={{ fontSize: 12, color: pos.muted, marginTop: 2 }}>
                      {formatPosTime(order.createdAt, locale)}
                      {(order.customerName || order.customerPhone) && (
                        <>
                          {' · '}
                          <strong style={{ color: pos.ink }}>
                            {order.customerName || 'Walk-in'}
                          </strong>
                          {order.customerPhone ? ` · ${order.customerPhone}` : ''}
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: pos.role,
                    }}
                  >
                    {fmt(order.total || 0)}
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Badge variant={orderStatusBadgeVariant(order.status)} size="sm">
                    {order.status.replace('_', ' ')}
                  </Badge>
                  <Badge variant="secondary" size="sm">
                    {(order.orderType || '').replace('_', ' ')}
                  </Badge>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      ...payStyle,
                    }}
                  >
                    {order.paymentMethod || '—'}
                  </span>
                  {order.paymentStatus === 'PAID' ? (
                    <Badge variant="success" size="sm">
                      <CheckCircleOutlineIcon
                        style={{ fontSize: 12, marginRight: 3, verticalAlign: 'middle' }}
                      />
                      Paid
                    </Badge>
                  ) : order.paymentStatus === 'PENDING' ? (
                    <Badge variant="warning" size="sm">
                      <MoneyOffIcon
                        style={{ fontSize: 12, marginRight: 3, verticalAlign: 'middle' }}
                      />
                      Unpaid
                    </Badge>
                  ) : null}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  {order.paymentStatus === 'PENDING' && order.paymentMethod === 'CASH' && (
                    <button
                      type="button"
                      disabled={markingPaid}
                      onClick={() => void handleMarkAsPaid(order)}
                      style={{
                        ...posTouchBtnBase,
                        background: pos.success,
                        color: pos.inverse,
                        fontSize: 13,
                      }}
                    >
                      <AttachMoneyIcon style={{ fontSize: 18 }} />
                      Mark as Paid
                    </button>
                  )}
                  <button
                    type="button"
                    disabled
                    title="Receipt print is not available yet"
                    style={{
                      ...posTouchBtnBase,
                      background: pos.surfaceAlt,
                      color: pos.faint,
                      cursor: 'not-allowed',
                      fontSize: 13,
                      border: `1px solid ${pos.border}`,
                    }}
                    data-testid="history-print-unavailable"
                  >
                    <PrintIcon style={{ fontSize: 18 }} />
                    Print · Unavailable
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/manager?section=orders&tab=orders`)}
                    style={{
                      ...posTouchBtnBase,
                      background: pos.surface,
                      color: pos.role,
                      border: `2px solid ${pos.roleBorder}`,
                      fontSize: 13,
                    }}
                  >
                    <VisibilityIcon style={{ fontSize: 18 }} />
                    View in Manager
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
          backgroundColor: pos.surfaceBg,
          fontFamily: pos.font,
        }}
      >
        <div
          style={{
            padding: `${pos.space[3]} ${pos.space[4]}`,
            borderBottom: `1px solid ${pos.border}`,
            background: pos.surface,
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: pos.type.fontSize.lg,
              fontWeight: pos.type.fontWeight.bold,
              color: pos.ink,
            }}
          >
            Today’s orders
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: pos.muted }}>
            Store-scoped history · mark cash paid here
          </p>
        </div>
        {body}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: pos.surfaceBg,
        fontFamily: pos.font,
      }}
    >
      <AppHeader title={`Order History - ${user?.name || 'Staff'}`} />
      <div
        style={{
          padding: `${pos.space[2]} ${pos.space[6]}`,
          backgroundColor: pos.surface,
          borderBottom: `1px solid ${pos.border}`,
          display: 'flex',
          gap: pos.space[3],
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/pos')}
          style={{
            ...posTouchBtnBase,
            background: pos.roleSoft,
            color: pos.roleDark,
            border: `1px solid ${pos.roleBorder}`,
          }}
        >
          ← Back to POS
        </button>
      </div>
      {body}
    </div>
  );
};

export default OrderHistory;
