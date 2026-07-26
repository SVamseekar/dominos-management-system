// src/apps/POSSystem/components/OrderPanel.tsx
/**
 * POS cart column — dense line items, large steppers, sticky totals.
 * Pattern: Toast / Square order ticket.
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
import { AllergenType, ALLERGEN_LABELS } from '../../../constants/allergens';
import type { POSOrderItem } from '../types';
import { pos, posTouchBtnBase } from '../posTokens';
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
      {/* Header + order type */}
      <div
        style={{
          padding: pos.space[3],
          borderBottom: `2px solid ${pos.border}`,
          background: `linear-gradient(180deg, ${pos.surface} 0%, ${pos.surfaceAlt} 100%)`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: pos.space[3],
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
              gap: pos.space[2],
            }}
          >
            <ShoppingCartIcon style={{ fontSize: 22, color: pos.role }} />
            Cart
            {itemCount > 0 && (
              <span
                style={{
                  minWidth: 24,
                  height: 24,
                  borderRadius: pos.radius.full,
                  background: pos.role,
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 6px',
                }}
              >
                {itemCount}
              </span>
            )}
          </h3>
          {items.length > 0 && (
            <button
              type="button"
              onClick={onNewOrder}
              style={{
                ...posTouchBtnBase,
                minHeight: 40,
                padding: '8px 14px',
                background: pos.errorSoft,
                color: pos.errorDark,
                border: `1px solid ${pos.error}`,
                fontSize: 12,
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Segmented order type — full-width touch targets */}
        <div
          role="group"
          aria-label="Order type"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 6,
            background: pos.surfaceAlt,
            padding: 4,
            borderRadius: pos.radius.md,
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
                  minHeight: 52,
                  flexDirection: 'column',
                  gap: 2,
                  padding: '8px 4px',
                  fontSize: 11,
                  borderRadius: pos.radius.sm,
                  ...(active
                    ? {
                        background: `linear-gradient(135deg, ${pos.role} 0%, ${pos.roleDark} 100%)`,
                        color: '#ffffff',
                        boxShadow: `0 4px 10px ${pos.roleShadow}`,
                      }
                    : {
                        background: 'transparent',
                        color: pos.muted,
                      }),
                }}
              >
                <type.Icon style={{ fontSize: 20 }} />
                <span>{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Line items */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: pos.space[3],
          minHeight: 0,
          background: pos.surfaceBg,
        }}
      >
        {items.length === 0 ? (
          <div
            data-testid="cart-empty"
            style={{
              marginTop: pos.space[6],
              padding: pos.space[6],
              borderRadius: pos.radius.lg,
              border: `2px dashed ${pos.border}`,
              background: pos.surface,
              textAlign: 'center',
            }}
          >
            <ShoppingCartIcon style={{ fontSize: 40, color: pos.faint, marginBottom: 12 }} />
            <div style={{ fontWeight: 700, color: pos.ink, marginBottom: 6 }}>Cart is empty</div>
            <div style={{ fontSize: 13, color: pos.muted, lineHeight: 1.4 }}>
              Tap menu items on the left to build the order. Pay on the right when ready.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item) => (
              <div
                key={item.menuItemId}
                data-testid={`cart-line-${item.menuItemId}`}
                style={{
                  padding: 12,
                  borderRadius: pos.radius.md,
                  background: pos.surface,
                  border: `1px solid ${pos.border}`,
                  boxShadow: pos.shadow.raised.sm,
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
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: pos.ink,
                        lineHeight: 1.25,
                      }}
                    >
                      {item.name}
                    </div>
                    <div style={{ fontSize: 12, color: pos.muted, marginTop: 2 }}>
                      {fmt(item.price)} each
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: pos.roleDark,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fmt(item.price * item.quantity)}
                  </div>
                </div>

                {/* Large steppers */}
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
                        borderRadius: pos.radius.md,
                        border: `1px solid ${pos.border}`,
                        background: pos.surfaceAlt,
                        color: pos.ink,
                        fontSize: 22,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: pos.font,
                      }}
                    >
                      −
                    </button>
                    <span
                      style={{
                        minWidth: 36,
                        textAlign: 'center',
                        fontSize: 18,
                        fontWeight: 800,
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
                        borderRadius: pos.radius.md,
                        border: 'none',
                        background: pos.role,
                        color: pos.inverse,
                        fontSize: 22,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: pos.font,
                        boxShadow: `0 2px 8px ${pos.roleShadow}`,
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
                      borderRadius: pos.radius.md,
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
                    width: '100%',
                    minHeight: 40,
                    padding: '8px 10px',
                    border: `1px solid ${pos.border}`,
                    borderRadius: pos.radius.sm,
                    outline: 'none',
                    backgroundColor: pos.surfaceAlt,
                    fontSize: 12,
                    color: pos.ink,
                    fontFamily: pos.font,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky ticket footer */}
      {items.length > 0 && (
        <div
          data-testid="cart-totals"
          style={{
            padding: pos.space[3],
            borderTop: `2px solid ${pos.border}`,
            background: pos.surface,
            flexShrink: 0,
            boxShadow: '0 -8px 24px rgba(0,0,0,0.35)',
          }}
        >
          {orderAllergens.length > 0 && (
            <div
              style={{
                backgroundColor: pos.warningSoft,
                border: `1px solid ${pos.warning}`,
                borderRadius: pos.radius.sm,
                padding: 10,
                marginBottom: 10,
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

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: pos.muted,
              marginBottom: 4,
            }}
          >
            <span>{t('cart.subtotal')}</span>
            <span style={{ fontWeight: 600, color: pos.ink }}>{fmt(subtotal)}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: pos.muted,
              marginBottom: 4,
            }}
          >
            <span>{taxLabel}</span>
            <span style={{ fontWeight: 600, color: pos.ink }}>{formatTaxDisplay(tax, fmt)}</span>
          </div>
          {orderType === 'DELIVERY' && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: pos.muted,
                marginBottom: 4,
              }}
            >
              <span>{t('cart.delivery_fee')}</span>
              <span style={{ fontWeight: 600, color: pos.ink }}>
                {deliveryFee === 0 ? '—' : fmt(deliveryFee)}
              </span>
            </div>
          )}
          <div
            style={{
              height: 1,
              background: pos.border,
              margin: '10px 0',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: pos.ink }}>{t('cart.total')}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: pos.role }}>{fmt(total)}</span>
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: pos.faint,
              textAlign: 'center',
            }}
          >
            Complete payment →
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderPanel;
