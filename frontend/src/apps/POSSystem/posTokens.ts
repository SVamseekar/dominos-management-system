/**
 * POS dark-premium tokens — staff landscape surface.
 * Accent = warm orange (Pinterest craft ref). Cashier blue #2196F3 retired for POS chrome.
 * Do not import manager-tokens or customer --dp-* here.
 */
import type { CSSProperties } from 'react';
import { spacing, typography, borderRadius } from '../../styles/design-tokens';

/** POS accent — warm orange (was cashier blue #2196F3) */
export const CASHIER_ROLE = '#f97316';

export const pos = {
  role: CASHIER_ROLE,
  roleSoft: 'rgba(249, 115, 22, 0.15)',
  roleBorder: 'rgba(249, 115, 22, 0.45)',
  roleShadow: 'rgba(249, 115, 22, 0.35)',
  roleDark: '#ea580c',

  /** Aliases for design-spec accent naming */
  accent: CASHIER_ROLE,
  accentSoft: 'rgba(249, 115, 22, 0.15)',
  accentDark: '#ea580c',

  surface: '#1a1c24',
  surfaceAlt: '#14161c',
  surfaceElevated: '#22252f',
  surfaceBg: '#0c0d10',
  border: 'rgba(255,255,255,0.08)',
  ink: '#f5f5f7',
  muted: '#9ca3af',
  faint: '#6b7280',
  /** Text / icon on solid accent & success buttons */
  inverse: '#ffffff',

  brand: '#e53e3e',
  brandSecondary: CASHIER_ROLE,

  success: '#10b981',
  successDark: '#34d399',
  successSoft: 'rgba(16, 185, 129, 0.18)',
  warning: '#f59e0b',
  warningDark: '#fbbf24',
  warningSoft: 'rgba(245, 158, 11, 0.18)',
  error: '#ef4444',
  errorDark: '#f87171',
  errorSoft: 'rgba(239, 68, 68, 0.18)',
  info: '#60a5fa',
  infoDark: '#93c5fd',
  infoSoft: 'rgba(96, 165, 250, 0.15)',

  headerBg: '#0a0b0e',
  headerBgAlt: '#16181f',
  headerMuted: '#94a3b8',

  font: typography.fontFamily.primary,
  mono: typography.fontFamily.mono,

  /** Minimum touch target for cashier floor (plan: ≥48px) */
  touchMin: 48,

  radius: {
    sm: borderRadius.sm,
    md: borderRadius.md,
    lg: borderRadius.lg,
    xl: borderRadius.xl,
    full: borderRadius.full,
  },

  space: spacing,
  shadow: {
    raised: {
      sm: '0 4px 16px rgba(0,0,0,0.35)',
      md: '0 8px 28px rgba(0,0,0,0.45)',
      lg: '0 16px 48px rgba(0,0,0,0.55)',
    },
    soft: '0 2px 8px rgba(0,0,0,0.25)',
    inset: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  type: typography,
} as const;

export type PosTokens = typeof pos;

/** Shared dense panel chrome for menu / cart / pay columns */
export const posPanelShell: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: pos.radius.lg,
  backgroundColor: pos.surface,
  boxShadow: pos.shadow.raised.sm,
  border: `1px solid ${pos.border}`,
  boxSizing: 'border-box',
  minWidth: 0,
};

/** Touch-friendly button base for POS operators */
export const posTouchBtnBase: CSSProperties = {
  minHeight: pos.touchMin,
  minWidth: pos.touchMin,
  border: 'none',
  borderRadius: pos.radius.md,
  fontFamily: pos.font,
  fontWeight: pos.type.fontWeight.bold,
  fontSize: pos.type.fontSize.sm,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '12px 16px',
  transition: 'transform 0.12s ease, opacity 0.12s ease, box-shadow 0.12s ease',
};

export const posTouchBtnPrimary: CSSProperties = {
  ...posTouchBtnBase,
  background: `linear-gradient(135deg, ${pos.role} 0%, ${pos.roleDark} 100%)`,
  color: '#ffffff',
  boxShadow: `0 4px 14px ${pos.roleShadow}`,
};

export const posTouchBtnGhost: CSSProperties = {
  ...posTouchBtnBase,
  background: pos.surfaceElevated,
  color: pos.ink,
  border: `1px solid ${pos.border}`,
};

export const posTouchBtnDanger: CSSProperties = {
  ...posTouchBtnBase,
  background: pos.errorSoft,
  color: pos.errorDark,
  border: `1px solid ${pos.error}`,
};
