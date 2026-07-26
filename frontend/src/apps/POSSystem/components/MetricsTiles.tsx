// src/apps/POSSystem/components/MetricsTiles.tsx
import React from 'react';
import {
  useGetTodaySalesMetricsQuery,
  useGetAverageOrderValueQuery,
  useGetDriverStatusQuery,
} from '../../../store/api/analyticsApi';
import Card from '../../../components/ui/neumorphic/Card';
import { colors, spacing, typography } from '../../../styles/design-tokens';
import { pos } from '../posTokens';
import { usePosMarket } from '../usePosMarket';
import EuroIcon from '@mui/icons-material/Euro';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import BarChartIcon from '@mui/icons-material/BarChart';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

interface MetricsTilesProps {
  storeId?: string;
}

/**
 * Real-time metrics display for POS dashboard
 * Shows today's sales, comparisons, and operational stats
 */
const MetricsTiles: React.FC<MetricsTilesProps> = ({ storeId }) => {
  const { currency, marketReady, fmt } = usePosMarket();
  const SalesCurrencyIcon =
    currency === 'INR' ? CurrencyRupeeIcon : currency === 'EUR' ? EuroIcon : AttachMoneyIcon;
  // Fetch real-time metrics from analytics service
  const {
    data: salesMetrics,
    isLoading: salesLoading,
    error: salesError,
    refetch: refetchSales,
  } = useGetTodaySalesMetricsQuery(storeId, {
    pollingInterval: 60000, // Refresh every minute
    skip: !storeId, // Skip if no storeId
  });

  const {
    data: avgOrderValue,
    isLoading: avgLoading,
    error: avgError,
  } = useGetAverageOrderValueQuery(storeId, {
    pollingInterval: 60000,
    skip: !storeId,
  });

  const {
    data: driverStatus,
    isLoading: driverLoading,
    error: driverError,
  } = useGetDriverStatusQuery(storeId, {
    pollingInterval: 30000, // Refresh every 30 seconds
    skip: !storeId,
  });

  const isLoading = salesLoading || avgLoading || driverLoading;

  if (!marketReady) {
    return (
      <div
        data-testid="metrics-tiles-market-loading"
        style={{
          padding: spacing[4],
          borderRadius: 12,
          background: pos.infoSoft,
          border: `1px solid ${pos.info}`,
          color: pos.ink,
          fontSize: 13,
        }}
      >
        Loading store market for metrics…
      </div>
    );
  }

  // Show error state if sales data fails to load — do not invent offline numbers
  if (salesError) {
    return (
      <Card
        elevation="sm"
        padding="base"
        style={{
          background: `linear-gradient(135deg, ${colors.semantic.warningLight}22 0%, ${colors.semantic.warning}11 100%)`,
          border: `2px solid ${colors.semantic.warning}`,
          textAlign: 'center',
        }}
        data-testid="metrics-tiles-error"
      >
        <WarningAmberIcon style={{ fontSize: '16px', marginRight: '6px', verticalAlign: 'middle' }} />
        Unable to load sales metrics.
        <button
          type="button"
          onClick={() => void refetchSales()}
          style={{
            marginLeft: 12,
            border: 'none',
            background: colors.brand.primary,
            color: colors.text.inverse,
            borderRadius: 8,
            padding: '4px 10px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          Retry
        </button>
      </Card>
    );
  }

  interface MetricCardProps {
    title: string;
    value: string;
    subtitle?: string;
    icon: React.ReactNode;
    trendLabel?: string;
    trendValue?: number;
    bgColor?: string;
  }

  const MetricCard = ({
    title,
    value,
    subtitle,
    icon,
    trendLabel,
    trendValue,
    bgColor = colors.brand.primary
  }: MetricCardProps) => (
    <Card
      elevation="md"
      padding="lg"
      interactive
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing[4],
        transition: 'all 0.3s ease',
        border: `2px solid transparent`
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.borderColor = bgColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: '12px',
        background: `linear-gradient(135deg, ${bgColor} 0%, ${bgColor}dd 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.text.inverse,
        fontSize: typography.fontSize['2xl'],
        boxShadow: `0 8px 16px ${bgColor}44`,
        flexShrink: 0
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.semibold,
          color: colors.text.secondary,
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {title}
        </p>
        <h4 style={{
          margin: `${spacing[1]} 0`,
          fontSize: typography.fontSize['2xl'],
          fontWeight: typography.fontWeight.extrabold,
          color: colors.text.primary,
          lineHeight: '1.2'
        }}>
          {isLoading ? (
            <div style={{
              width: '80px',
              height: '20px',
              borderRadius: '4px',
              background: colors.surface.border,
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
          ) : value}
        </h4>
        {subtitle && (
          <p style={{
            margin: 0,
            fontSize: typography.fontSize.xs,
            color: colors.text.secondary
          }}>
            {subtitle}
          </p>
        )}
        {trendLabel && trendValue !== undefined && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing[1],
            marginTop: spacing[2]
          }}>
            <span style={{
              fontSize: typography.fontSize.base,
              color: trendValue >= 0 ? colors.semantic.success : colors.semantic.error
            }}>
              {trendValue >= 0 ? <TrendingUpIcon style={{ fontSize: '16px' }} /> : <TrendingDownIcon style={{ fontSize: '16px' }} />}
            </span>
            <span style={{
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.bold,
              color: trendValue >= 0 ? colors.semantic.success : colors.semantic.error
            }}>
              {trendValue >= 0 ? '+' : ''}{trendValue.toFixed(1)}%
            </span>
            <span style={{
              fontSize: typography.fontSize.xs,
              color: colors.text.secondary
            }}>
              {trendLabel}
            </span>
          </div>
        )}
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </Card>
  );

  return (
    <div
      data-testid="metrics-tiles"
      style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: spacing[3],
    }}
    >
      {/* Today's Sales — analytics amounts are major units (EUR) */}
      <MetricCard
        title="Today's Sales"
        value={salesMetrics ? fmt(salesMetrics.todaySales) : '-'}
        subtitle={salesMetrics ? `${salesMetrics.todayOrderCount} orders` : 'Loading...'}
        icon={<SalesCurrencyIcon style={{ fontSize: '28px' }} />}
        trendLabel="vs yesterday"
        trendValue={salesMetrics?.percentChangeFromYesterday}
        bgColor={colors.semantic.success}
      />

      {/* Average Order Value */}
      <MetricCard
        title="Avg Order Value"
        value={avgError ? '—' : avgOrderValue ? fmt(avgOrderValue.averageOrderValue) : '-'}
        subtitle={avgError ? 'AOV unavailable' : avgOrderValue ? `${avgOrderValue.totalOrders} orders` : 'Loading...'}
        icon={<ShoppingCartIcon style={{ fontSize: '28px' }} />}
        trendLabel={avgOrderValue && !avgError ? 'vs yesterday' : undefined}
        trendValue={avgError ? undefined : avgOrderValue?.percentChange}
        bgColor={pos.role}
      />

      {/* Year-over-Year Comparison */}
      <MetricCard
        title="Last Year (Same Day)"
        value={salesMetrics ? fmt(salesMetrics.lastYearSameDaySales) : '-'}
        trendLabel="YoY growth"
        trendValue={salesMetrics?.percentChangeFromLastYear}
        icon={<BarChartIcon style={{ fontSize: '28px' }} />}
        bgColor={colors.semantic.warning}
      />

      {/* Active Deliveries */}
      <MetricCard
        title="Active Deliveries"
        value={driverError ? '—' : driverStatus?.activeDeliveries != null ? String(driverStatus.activeDeliveries) : '-'}
        subtitle={
          driverError
            ? 'Driver status unavailable'
            : driverStatus
              ? `${driverStatus.availableDrivers}/${driverStatus.totalDrivers} drivers available`
              : 'Loading...'
        }
        icon={<LocalShippingIcon style={{ fontSize: '28px' }} />}
        bgColor={pos.roleDark}
      />
    </div>
  );
};

export default MetricsTiles;
