/**
 * Optional item detail sheet — image, allergens, qty, note, orange Add.
 * Variants only when menu item provides them (no invented sizes).
 */
import React, { useState, useEffect } from 'react';
import type { MenuItem } from '../../../store/api/menuApi';
import { useAppSelector } from '../../../store/hooks';
import { selectCartCurrency, selectCartLocale } from '../../../store/slices/cartSlice';
import { formatMoney } from '../../../utils/currency';
import CloseIcon from '@mui/icons-material/Close';
import { pos, posTouchBtnBase, posTouchBtnPrimary, posField, posLabel } from '../posTokens';
import { ALLERGEN_LABELS, type AllergenType } from '../../../constants/allergens';

interface ItemCustomizeSheetProps {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
  onAdd: (item: MenuItem, quantity: number, instructions?: string) => void;
}

const ItemCustomizeSheet: React.FC<ItemCustomizeSheetProps> = ({
  item,
  open,
  onClose,
  onAdd,
}) => {
  const currency = useAppSelector(selectCartCurrency);
  const locale = useAppSelector(selectCartLocale);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open && item) {
      setQty(1);
      setNote('');
    }
  }, [open, item?.id]);

  if (!open || !item) return null;

  const allergens = (item.allergens ?? []) as AllergenType[];
  const price = formatMoney(item.basePrice, currency, locale);

  return (
    <div
      data-testid="item-customize-sheet-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        data-testid="item-customize-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-sheet-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          maxHeight: '88vh',
          overflow: 'auto',
          borderRadius: 24,
          background: `linear-gradient(180deg, ${pos.surfaceElevated} 0%, ${pos.surface} 100%)`,
          border: `1px solid ${pos.glassBorder}`,
          boxShadow: pos.shadow.raised.lg,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ position: 'relative', height: 200, background: pos.surfaceAlt }}>
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 64,
                fontWeight: 800,
                color: pos.faint,
                background: `radial-gradient(circle at 30% 30%, ${pos.roleSoft}, ${pos.surfaceAlt})`,
              }}
            >
              {item.name.charAt(0)}
            </div>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(0,0,0,0.55)',
              color: pos.ink,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseIcon />
          </button>
        </div>

        <div style={{ padding: 20, display: 1 }}>
          <h2
            id="item-sheet-title"
            style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: pos.ink }}
          >
            {item.name}
          </h2>
          <div style={{ fontSize: 20, fontWeight: 800, color: pos.role, marginBottom: 12 }}>
            {price}
          </div>
          {item.description && (
            <p style={{ margin: '0 0 14px', fontSize: 13, color: pos.muted, lineHeight: 1.45 }}>
              {item.description}
            </p>
          )}

          {allergens.length > 0 && (
            <div
              style={{
                marginBottom: 14,
                padding: 10,
                borderRadius: 12,
                background: pos.warningSoft,
                border: `1px solid ${pos.warning}`,
                fontSize: 12,
                color: pos.warningDark,
              }}
            >
              <strong>Allergens:</strong>{' '}
              {allergens.map((a) => ALLERGEN_LABELS[a] || a).join(', ')}
            </div>
          )}

          {item.variants && item.variants.length > 0 && (
            <p style={{ margin: '0 0 12px', fontSize: 12, color: pos.muted }}>
              {item.variants.length} size option(s) available — use note for preference on POS.
            </p>
          )}

          <label style={posLabel}>Special instructions</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="No onion, extra spice…"
            style={{ ...posField, marginBottom: 16 }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <button
              type="button"
              aria-label="Decrease"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              style={{
                ...posTouchBtnBase,
                width: 48,
                height: 48,
                background: pos.surfaceAlt,
                border: `1px solid ${pos.border}`,
                color: pos.ink,
                fontSize: 22,
              }}
            >
              −
            </button>
            <span style={{ minWidth: 32, textAlign: 'center', fontSize: 20, fontWeight: 800 }}>
              {qty}
            </span>
            <button
              type="button"
              aria-label="Increase"
              onClick={() => setQty((q) => q + 1)}
              style={{
                ...posTouchBtnBase,
                width: 48,
                height: 48,
                background: pos.role,
                color: '#fff',
                fontSize: 22,
              }}
            >
              +
            </button>
            <button
              type="button"
              data-testid="item-sheet-add"
              onClick={() => {
                onAdd(item, qty, note.trim() || undefined);
                onClose();
              }}
              style={{
                ...posTouchBtnPrimary,
                flex: 1,
                minHeight: 52,
                fontSize: 16,
              }}
            >
              Add · {price}
              {qty > 1 ? ` × ${qty}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemCustomizeSheet;
