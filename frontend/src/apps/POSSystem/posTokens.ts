/**
 * POS dark-premium craft system — staff landscape surface.
 * Layout + glass chrome + orange energy (Pinterest craft ref).
 * Not a consumer phone app; keep 3-column cashier workflow.
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

  accent: CASHIER_ROLE,
  accentSoft: 'rgba(249, 115, 22, 0.15)',
  accentDark: '#ea580c',

  surface: '#1a1c24',
  surfaceAlt: '#14161c',
  surfaceElevated: '#22252f',
  surfaceBg: '#0c0d10',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  ink: '#f5f5f7',
  muted: '#9ca3af',
  faint: '#6b7280',
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

  headerBg: 'rgba(10, 11, 14, 0.92)',
  headerBgAlt: '#16181f',
  headerMuted: '#94a3b8',

  glass: 'rgba(26, 28, 36, 0.72)',
  glassBorder: 'rgba(255,255,255,0.1)',
  glow: 'radial-gradient(ellipse 80% 50% at 20% -10%, rgba(249,115,22,0.18), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 10%, rgba(234,88,12,0.08), transparent 50%)',

  font: typography.fontFamily.primary,
  mono: typography.fontFamily.mono,

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
    inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
    glow: `0 0 40px rgba(249,115,22,0.12)`,
  },
  type: typography,
} as const;

export type PosTokens = typeof pos;

/** Glass column shell — menu / cart / pay */
export const posPanelShell: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: 20,
  background: `linear-gradient(165deg, ${pos.surfaceElevated} 0%, ${pos.surface} 48%, ${pos.surfaceAlt} 100%)`,
  boxShadow: `${pos.shadow.raised.md}, ${pos.shadow.inset}`,
  border: `1px solid ${pos.glassBorder}`,
  boxSizing: 'border-box',
  minWidth: 0,
  backdropFilter: 'blur(12px)',
};

export const posTouchBtnBase: CSSProperties = {
  minHeight: pos.touchMin,
  minWidth: pos.touchMin,
  border: 'none',
  borderRadius: 14,
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
  boxShadow: `0 6px 20px ${pos.roleShadow}`,
  borderRadius: 999,
};

export const posTouchBtnGhost: CSSProperties = {
  ...posTouchBtnBase,
  background: 'rgba(255,255,255,0.04)',
  color: pos.ink,
  border: `1px solid ${pos.border}`,
  borderRadius: 14,
};

export const posTouchBtnDanger: CSSProperties = {
  ...posTouchBtnBase,
  background: pos.errorSoft,
  color: pos.errorDark,
  border: `1px solid ${pos.error}`,
  borderRadius: 14,
};

/** Shared dark field for POS forms */
export const posField: CSSProperties = {
  width: '100%',
  minHeight: pos.touchMin,
  padding: '12px 14px',
  border: `1px solid ${pos.border}`,
  borderRadius: 14,
  outline: 'none',
  backgroundColor: 'rgba(0,0,0,0.35)',
  fontSize: 14,
  color: pos.ink,
  fontFamily: pos.font,
  boxSizing: 'border-box',
  transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
};

export const posFieldFocus = {
  borderColor: pos.role,
  boxShadow: `0 0 0 3px ${pos.roleSoft}`,
} as const;

export const posLabel: CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: pos.muted,
};

export const posSectionTitle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 800,
  color: pos.ink,
  letterSpacing: '-0.02em',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

export const posPanelHeader: CSSProperties = {
  padding: '14px 16px',
  borderBottom: `1px solid ${pos.border}`,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)',
  flexShrink: 0,
};

export const posAmbientRoot: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  backgroundColor: pos.surfaceBg,
  backgroundImage: pos.glow,
  fontFamily: pos.font,
  color: pos.ink,
};
