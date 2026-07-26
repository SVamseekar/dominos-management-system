// src/apps/POSSystem/components/OrderPanel.tsx
/**
 * Craft cart ticket — segmented order type, receipt lines, sticky totals.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../../store/hooks';
import {
  selectCartCurrency,
  selectCartLocale,
  selectStoreCountryCode,
  selectDeliveryFeeINR,
} from '../../../store/slices/cartSlice';
import { formatMajorAmount } from '../../../utils/currency';
import { computePreCheckoutTotals, formatTaxDisplay } from '../../../utils/orderTax';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { AllergenType, ALLERGEN_LABELS } from '../../../constants/allergens';
import type { POSOrderItem } from '../types';
import {
  pos,
  posTouchBtnBase,
  posPanelHeader,
  posSectionTitle,
  posField,
  posTouchBtnDanger,
} from '../posTokens';
import { resolvePosDeliveryFee } from '../posHelpers';

interface OrderPanelProps {
  items: POSOrderItem[];
  onUpdateQuantity: (menuItemId: string, quantity: number) => void;
  onRemoveItem: (menuItemId: string) => void;
  onUpdateInstructions: (menuItemId: string, instructions: string) => void;
  onNewOrder: () => void;
  orderType: 'PICKUP' | 'DELIVERY' | 'DINE_IN';
  onOrderTypeChange: (type: 'PICKUP' | 'DELIVERY' | 'DINE_IN') => void;
  selectedTable?: string | null;
  onTableSelect: (table: string | null) => void;
}

const OrderPanel: React.FC<OrderPanelProps> = ({
  items,
  onUpdateQuantity,
  onRemoveItem,
  onUpdateInstructions,
  onNewOrder,
  orderType,
  onOrderTypeChange,
  selectedTable: _selectedTable,
  onTableSelect: _onTableSelect,
}) => {
  const { t } = useTranslation();
  const currency = useAppSelector(selectCartCurrency);
  const locale = useAppSelector(selectCartLocale);
  const storeCountryCode = useAppSelector(selectStoreCountryCode);
  const cartDeliveryFee = useAppSelector(selectDeliveryFeeINR);
  const fmt = (v: number) => formatMajorAmount(v, currency, locale);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = resolvePosDeliveryFee(orderType, subtotal, cartDeliveryFee);
  const { tax, taxLabel, total } = computePreCheckoutTotals(
    subtotal,
    deliveryFee,
    storeCountryCode
  );

  const orderAllergens: AllergenType[] = Array.from(
    new Set(items.flatMap((item) => (item.allergens ?? []) as AllergenType[]))
  );

  const itemCount = items.reduce((n, i) => n + i.quantity, 0);

  const orderTypes = [
    { value: 'PICKUP' as const, label: t('staff.pickup'), Icon: ShoppingBagIcon },
    { value: 'DELIVERY' as const, label: t('staff.delivery'), Icon: LocalShippingIcon },
    { value: 'DINE_IN' as const, label: t('staff.dine_in'), Icon: TableRestaurantIcon },
  ];

  return (
    <div
      data-testid="order-panel"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      <div style={{ ...posPanelHeader, borderTop: `3px solid ${pos.role}` }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <h3 style={posSectionTitle}>
            <ReceiptLongIcon style={{ fontSize: 22, color: pos.role }} />
            Ticket
            {itemCount > 0 && (
              <span
                style={{
                  minWidth: 26,
                  height: 26,
                  borderRadius: 999,
                  background: pos.role,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 8px',
                }}
              >
                {itemCount}
              </span>
            )}
          </h3>
          {items.length > 0 && (
            <button type="button" onClick={onNewOrder} style={{ ...posTouchBtnDanger, minHeight: 40, padding: '8px 12px', fontSize: 12 }}>
              Clear
            </button>
          )}
        </div>

        <div
          role="group"
          aria-label="Order type"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 6,
            background: 'rgba(0,0,0,0.35)',
            padding: 5,
            borderRadius: 16,
            border: `1px solid ${pos.border}`,
          }}
        >
          {orderTypes.map((type) => {
            const active = orderType === type.value;
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => onOrderTypeChange(type.value)}
                style={{
                  ...posTouchBtnBase,
                  minHeight: 56,
                  flexDirection: 'column',
                  gap: 4,
                  padding: '8px 4px',
                  fontSize: 11,
                  borderRadius: 12,
                  ...(active
                    ? {
                        background: `linear-gradient(160deg, ${pos.role}, ${pos.roleDark})`,
                        color: '#fff',
                        boxShadow: `0 6px 16px ${pos.roleShadow}`,
                      }
                    : {
                        background: 'transparent',
                        color: pos.muted,
                      }),
                }}
              >
                <type.Icon style={{ fontSize: 22 }} />
                <span style={{ fontWeight: 800 }}>{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 12,
          minHeight: 0,
          background: 'rgba(0,0,0,0.18)',
        }}
      >
        {items.length === 0 ? (
          <div
            data-testid="cart-empty"
            style={{
              marginTop: 24,
              padding: 28,
              borderRadius: 18,
              border: `1px dashed ${pos.border}`,
              background: `radial-gradient(circle at 50% 0%, ${pos.roleSoft}, ${pos.surface} 60%)`,
              textAlign: 'center',
            }}
          >
            <ShoppingCartIcon style={{ fontSize: 44, color: pos.faint, marginBottom: 12 }} />
            <div style={{ fontWeight: 800, color: pos.ink, marginBottom: 6, fontSize: 16 }}>
              Ticket is empty
            </div>
            <div style={{ fontSize: 13, color: pos.muted, lineHeight: 1.45 }}>
              Build the order from the menu. Payment stays on the right when ready.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {items.map((item, idx) => (
              <div
                key={item.menuItemId}
                data-testid={`cart-line-${item.menuItemId}`}
                style={{
                  padding: '14px 4px',
                  borderBottom:
                    idx < items.length - 1 ? `1px dashed ${pos.border}` : 'none',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: pos.ink, lineHeight: 1.25 }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 12, color: pos.muted, marginTop: 2 }}>
                      {fmt(item.price)} each
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: pos.role, whiteSpace: 'nowrap' }}>
                    {fmt(item.price * item.quantity)}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => onUpdateQuantity(item.menuItemId, item.quantity - 1)}
                      style={{
                        width: pos.touchMin,
                        height: pos.touchMin,
                        borderRadius: 14,
                        border: `1px solid ${pos.border}`,
                        background: 'rgba(0,0,0,0.35)',
                        color: pos.ink,
                        fontSize: 22,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      −
                    </button>
                    <span
                      style={{
                        minWidth: 36,
                        textAlign: 'center',
                        fontSize: 18,
                        fontWeight: 900,
                        color: pos.ink,
                      }}
                    >
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => onUpdateQuantity(item.menuItemId, item.quantity + 1)}
                      style={{
                        width: pos.touchMin,
                        height: pos.touchMin,
                        borderRadius: 14,
                        border: 'none',
                        background: `linear-gradient(145deg, ${pos.role}, ${pos.roleDark})`,
                        color: '#fff',
                        fontSize: 22,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 4px 12px ${pos.roleShadow}`,
                      }}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => onRemoveItem(item.menuItemId)}
                    style={{
                      width: pos.touchMin,
                      height: pos.touchMin,
                      borderRadius: 14,
                      border: 'none',
                      background: pos.errorSoft,
                      color: pos.errorDark,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <DeleteOutlineIcon style={{ fontSize: 22 }} />
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Note (optional)"
                  value={item.specialInstructions || ''}
                  onChange={(e) => onUpdateInstructions(item.menuItemId, e.target.value)}
                  style={{
                    ...posField,
                    minHeight: 40,
                    fontSize: 12,
                    borderRadius: 10,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div
          data-testid="cart-totals"
          style={{
            padding: 16,
            borderTop: `1px solid ${pos.border}`,
            background: `linear-gradient(180deg, ${pos.surfaceElevated} 0%, ${pos.surface} 100%)`,
            flexShrink: 0,
            boxShadow: '0 -12px 32px rgba(0,0,0,0.35)',
          }}
        >
          {orderAllergens.length > 0 && (
            <div
              style={{
                backgroundColor: pos.warningSoft,
                border: `1px solid ${pos.warning}`,
                borderRadius: 12,
                padding: 10,
                marginBottom: 12,
                display: 'flex',
                gap: 8,
              }}
            >
              <WarningAmberIcon style={{ fontSize: 18, color: pos.warningDark, flexShrink: 0 }} />
              <div style={{ fontSize: 11, color: pos.warningDark, lineHeight: 1.35 }}>
                <strong>Allergens:</strong> {orderAllergens.map((a) => ALLERGEN_LABELS[a]).join(', ')}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: pos.muted, marginBottom: 6 }}>
            <span>{t('cart.subtotal')}</span>
            <span style={{ fontWeight: 700, color: pos.ink }}>{fmt(subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: pos.muted, marginBottom: 6 }}>
            <span>{taxLabel}</span>
            <span style={{ fontWeight: 700, color: pos.ink }}>{formatTaxDisplay(tax, fmt)}</span>
          </div>
          {orderType === 'DELIVERY' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: pos.muted, marginBottom: 6 }}>
              <span>{t('cart.delivery_fee')}</span>
              <span style={{ fontWeight: 700, color: pos.ink }}>
                {deliveryFee === 0 ? '—' : fmt(deliveryFee)}
              </span>
            </div>
          )}
          <div
            style={{
              height: 1,
              background: `linear-gradient(90deg, transparent, ${pos.role}88, transparent)`,
              margin: '12px 0',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: pos.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('cart.total')}
            </span>
            <span style={{ fontSize: 28, fontWeight: 900, color: pos.role, letterSpacing: '-0.03em' }}>
              {fmt(total)}
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: pos.faint, textAlign: 'center' }}>
            Complete pay →
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderPanel;
