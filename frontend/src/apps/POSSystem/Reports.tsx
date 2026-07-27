// src/apps/POSSystem/Reports.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LockIcon from '@mui/icons-material/Lock';
import BarChartIcon from '@mui/icons-material/BarChart';
import PeopleIcon from '@mui/icons-material/People';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { useAppSelector } from '../../store/hooks';
import {
  useGetTodaySalesMetricsQuery,
  useGetSalesTrendsQuery,
  useGetStaffLeaderboardQuery,
  useGetTopProductsQuery,
} from '../../store/api/analyticsApi';
import AppHeader from '../../components/common/AppHeader';
import Card from '../../components/ui/neumorphic/Card';
import Button from '../../components/ui/neumorphic/Button';
import { colors, shadows, spacing, typography } from '../../styles/design-tokens';
import { usePosMarket } from './usePosMarket';

/**
 * Reports Page (Manager Only)
 * Sales analytics, inventory insights, and staff performance
 */
const Reports: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);
  const { fmt, marketReady } = usePosMarket();
  const [activeTab, setActiveTab] = useState<'sales' | 'staff' | 'inventory'>('sales');

  const storeId = user?.storeId;
  // Fetch real data from APIs (store-scoped for DOM001 correctness)
  const { data: todayData, isLoading: loadingToday, isError: errorToday } = useGetTodaySalesMetricsQuery(storeId, { skip: !storeId });
  const { data: weekData, isLoading: loadingWeek, isError: errorWeek } = useGetSalesTrendsQuery({ period: 'WEEKLY', storeId }, { skip: !storeId });
  const { data: monthData, isLoading: loadingMonth, isError: errorMonth } = useGetSalesTrendsQuery({ period: 'MONTHLY', storeId }, { skip: !storeId });
  const { data: topProducts, isLoading: loadingProducts, isError: errorProducts } = useGetTopProductsQuery({
    period: 'TODAY',
    sortBy: 'REVENUE',
    storeId,
  }, { skip: !storeId });
  const { data: staffData, isLoading: loadingStaff, isError: errorStaff } = useGetStaffLeaderboardQuery({
    period: 'TODAY',
    storeId,
  }, { skip: !storeId });

  // Check if user is manager
  if (user?.type !== 'MANAGER') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: colors.surface.background,
        fontFamily: typography.fontFamily.primary,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing[6]
      }}>
        <Card
          elevation="lg"
          padding="lg"
          style={{
            maxWidth: '500px',
            textAlign: 'center',
            background: `linear-gradient(135deg, ${colors.semantic.errorLight}22 0%, ${colors.semantic.error}11 100%)`,
            border: `2px solid ${colors.semantic.error}`
          }}
        >
          <div style={{
            fontSize: typography.fontSize['2xl'],
            marginBottom: spacing[4]
          }}>
            <LockIcon style={{ fontSize: '40px', color: colors.semantic.error }} />
          </div>
          <h2 style={{
            margin: `0 0 ${spacing[3]} 0`,
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
            color: colors.semantic.error
          }}>
            Access Denied
          </h2>
          <p style={{
            margin: `0 0 ${spacing[4]} 0`,
            color: colors.text.secondary
          }}>
            This page is only accessible to managers.
          </p>
          <Button
            variant="primary"
            onClick={() => navigate('/pos')}
          >
            ← Back to POS
          </Button>
        </Card>
      </div>
    );
  }

  const isLoading = loadingToday || loadingWeek || loadingMonth || loadingProducts || loadingStaff;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: colors.surface.background,
      fontFamily: typography.fontFamily.primary
    }}>
      {/* App Header */}
      <AppHeader title={`Reports & Analytics - ${user?.name || 'Manager'}`} />

      {/* Action Bar with Tabs */}
      <div style={{
        padding: `${spacing[2]} ${spacing[6]}`,
        backgroundColor: colors.surface.primary,
        borderBottom: `1px solid ${colors.surface.border}`,
        display: 'flex',
        gap: spacing[3],
        alignItems: 'center',
        flexShrink: 0
      }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/pos')}
        >
          ← Back to POS
        </Button>

        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          gap: spacing[2]
        }}>
          {[
            { key: 'sales', label: 'Sales', Icon: BarChartIcon },
            { key: 'staff', label: 'Staff', Icon: PeopleIcon },
            { key: 'inventory', label: 'Inventory', Icon: InventoryIcon }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as 'sales' | 'staff' | 'inventory')}
              style={{
                padding: `${spacing[2]} ${spacing[4]}`,
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                fontFamily: typography.fontFamily.primary,
                transition: 'all 0.2s ease',
                ...(activeTab === tab.key ? {
                  background: `linear-gradient(135deg, ${colors.brand.primary} 0%, ${colors.brand.secondary} 100%)`,
                  color: colors.text.inverse,
                  boxShadow: shadows.floating.md
                } : {
                  background: colors.surface.secondary,
                  color: colors.text.secondary,
                  boxShadow: shadows.raised.sm
                })
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.key) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = shadows.floating.sm;
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.key) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = shadows.raised.sm;
                }
              }}
            >
              <tab.Icon style={{ fontSize: '16px', marginRight: '6px', verticalAlign: 'middle' }} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: spacing[6]
      }}>
        {/* Loading State */}
        {isLoading && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing[10],
            color: colors.text.secondary
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: `4px solid ${colors.surface.border}`,
              borderTopColor: colors.brand.primary,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}

        {!isLoading && (
          <>
            {/* Sales Tab */}
            {activeTab === 'sales' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
                {/* Metrics Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: spacing[4]
                }}>
                  <Card
                    elevation="md"
                    padding="lg"
                    style={{
                      background: `linear-gradient(135deg, ${colors.semantic.successLight}22 0%, ${colors.semantic.success}11 100%)`,
                      border: `2px solid ${colors.semantic.success}`
                    }}
                  >
                    <div style={{
                      fontSize: typography.fontSize.sm,
                      color: colors.text.secondary,
                      marginBottom: spacing[2]
                    }}>
                      Today's Sales
                    </div>
                    <div style={{
                      fontSize: typography.fontSize['2xl'],
                      fontWeight: typography.fontWeight.extrabold,
                      color: colors.text.primary,
                      marginBottom: spacing[2]
                    }}>
                      {errorToday ? '—' : fmt(todayData?.todaySales || 0)}
                    </div>
                    <div style={{
                      fontSize: typography.fontSize.xs,
                      color: errorToday
                        ? colors.semantic.error
                        : todayData?.percentChangeFromYesterday && todayData.percentChangeFromYesterday >= 0
                          ? colors.semantic.success
                          : colors.semantic.error
                    }}>
                      {errorToday
                        ? 'Sales API failed'
                        : todayData?.percentChangeFromYesterday
                          ? `${todayData.percentChangeFromYesterday >= 0 ? '+' : ''}${todayData.percentChangeFromYesterday.toFixed(1)}% vs yesterday`
                          : '—'}
                    </div>
                  </Card>

                  <Card elevation="md" padding="lg">
                    <div style={{
                      fontSize: typography.fontSize.sm,
                      color: colors.text.secondary,
                      marginBottom: spacing[2]
                    }}>
                      This Week
                    </div>
                    <div style={{
                      fontSize: typography.fontSize['2xl'],
                      fontWeight: typography.fontWeight.extrabold,
                      color: colors.text.primary,
                      marginBottom: spacing[2]
                    }}>
                      {errorWeek ? '—' : fmt(weekData?.totalSales || 0)}
                    </div>
                    <div style={{
                      fontSize: typography.fontSize.xs,
                      color: colors.text.secondary
                    }}>
                      {errorWeek ? 'Trends API failed' : `${weekData?.totalOrders || 0} orders`}
                    </div>
                  </Card>

                  <Card elevation="md" padding="lg">
                    <div style={{
                      fontSize: typography.fontSize.sm,
                      color: colors.text.secondary,
                      marginBottom: spacing[2]
                    }}>
                      This Month
                    </div>
                    <div style={{
                      fontSize: typography.fontSize['2xl'],
                      fontWeight: typography.fontWeight.extrabold,
                      color: colors.text.primary,
                      marginBottom: spacing[2]
                    }}>
                      {errorMonth ? '—' : fmt(monthData?.totalSales || 0)}
                    </div>
                    <div style={{
                      fontSize: typography.fontSize.xs,
                      color: colors.text.secondary
                    }}>
                      {errorMonth ? 'Trends API failed' : `${monthData?.totalOrders || 0} orders`}
                    </div>
                  </Card>
                </div>

                {/* Top Selling Items */}
                <Card elevation="md" padding="lg">
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: spacing[4]
                  }}>
                    <h3 style={{
                      margin: 0,
                      fontSize: typography.fontSize.lg,
                      fontWeight: typography.fontWeight.bold,
                      color: colors.text.primary
                    }}>
                      <LocalFireDepartmentIcon style={{ fontSize: '18px', color: colors.semantic.error, marginRight: '6px', verticalAlign: 'middle' }} />
                      Top Selling Items (Today)
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate('/manager?section=analytics&tab=products')}
                    >
                      View Full Analytics →
                    </Button>
                  </div>
                  <div style={{
                    height: '1px',
                    background: colors.surface.border,
                    marginBottom: spacing[4]
                  }} />
                  {errorProducts ? (
                    <div style={{
                      padding: spacing[6],
                      textAlign: 'center',
                      color: colors.semantic.error,
                    }}>
                      Failed to load top products.
                    </div>
                  ) : topProducts && topProducts.topProducts.length > 0 ? (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                      gap: spacing[3]
                    }}>
                      {topProducts.topProducts.slice(0, 5).map((item) => (
                        <div
                          key={item.itemId}
                          style={{
                            padding: spacing[3],
                            borderRadius: '10px',
                            background: colors.surface.secondary,
                            boxShadow: shadows.raised.sm,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <div style={{
                              fontSize: typography.fontSize.sm,
                              fontWeight: typography.fontWeight.bold,
                              color: colors.text.primary,
                              marginBottom: spacing[1]
                            }}>
                              {item.itemName}
                            </div>
                            <div style={{
                              fontSize: typography.fontSize.xs,
                              color: colors.text.secondary
                            }}>
                              {item.quantitySold} sold
                            </div>
                          </div>
                          <div style={{
                            fontSize: typography.fontSize.base,
                            fontWeight: typography.fontWeight.bold,
                            color: colors.brand.primary
                          }}>
                            {fmt(item.revenue)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      padding: spacing[6],
                      textAlign: 'center',
                      color: colors.text.secondary
                    }}>
                      No sales data available
                    </div>
                  )}
                </Card>

                {/* Advanced Reports Button */}
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => navigate('/manager?section=analytics&tab=reports')}
                  style={{ width: '100%' }}
                >
                  <TrendingUpIcon style={{ fontSize: '16px', marginRight: '6px', verticalAlign: 'middle' }} />
                  View Advanced Reports (Charts & Trends)
                </Button>
              </div>
            )}

            {/* Staff Performance Tab */}
            {activeTab === 'staff' && (
              <Card elevation="md" padding="lg">
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: spacing[4]
                }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: typography.fontSize.lg,
                    fontWeight: typography.fontWeight.bold,
                    color: colors.text.primary
                  }}>
                    <PeopleIcon style={{ fontSize: '18px', marginRight: '6px', verticalAlign: 'middle' }} />
                    Staff Performance (Today)
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate('/manager?section=people&tab=leaderboard')}
                  >
                    View Full Leaderboard →
                  </Button>
                </div>
                <div style={{
                  height: '1px',
                  background: colors.surface.border,
                  marginBottom: spacing[4]
                }} />
                {errorStaff ? (
                  <div style={{
                    padding: spacing[6],
                    textAlign: 'center',
                    color: colors.semantic.error,
                  }}>
                    Failed to load staff leaderboard.
                  </div>
                ) : staffData && staffData.rankings.length > 0 ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: spacing[3]
                  }}>
                    {staffData.rankings.slice(0, 5).map((staff, index) => (
                      <div
                        key={staff.staffId}
                        style={{
                          padding: spacing[3],
                          borderRadius: '10px',
                          background: index === 0
                            ? `linear-gradient(135deg, ${colors.semantic.warningLight}22 0%, ${colors.semantic.warning}11 100%)`
                            : colors.surface.secondary,
                          border: index === 0 ? `2px solid ${colors.semantic.warning}` : 'none',
                          boxShadow: shadows.raised.sm,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{
                            fontSize: typography.fontSize.sm,
                            fontWeight: typography.fontWeight.bold,
                            color: colors.text.primary,
                            marginBottom: spacing[1]
                          }}>
                            {index === 0 && <WorkspacePremiumIcon style={{ fontSize: '14px', color: colors.semantic.warning, marginRight: '4px', verticalAlign: 'middle' }} />}#{index + 1} {staff.staffName}
                          </div>
                          <div style={{
                            fontSize: typography.fontSize.xs,
                            color: colors.text.secondary
                          }}>
                            {staff.ordersProcessed} orders processed
                          </div>
                        </div>
                        <div style={{
                          fontSize: typography.fontSize.base,
                          fontWeight: typography.fontWeight.bold,
                          color: colors.brand.primary
                        }}>
                          {fmt(staff.salesGenerated)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    padding: spacing[6],
                    textAlign: 'center',
                    color: colors.text.secondary
                  }}>
                    No staff performance data available
                  </div>
                )}
              </Card>
            )}

            {/* Inventory Tab */}
            {activeTab === 'inventory' && (
              <Card
                elevation="md"
                padding="lg"
                style={{
                  textAlign: 'center',
                  background: `linear-gradient(135deg, ${colors.semantic.infoLight}22 0%, ${colors.semantic.info}11 100%)`,
                  border: `2px solid ${colors.semantic.info}`
                }}
              >
                <div style={{
                  marginBottom: spacing[4]
                }}>
                  <InventoryIcon style={{ fontSize: '48px', color: colors.semantic.info }} />
                </div>
                <h3 style={{
                  margin: `0 0 ${spacing[3]} 0`,
                  fontSize: typography.fontSize.xl,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.text.primary
                }}>
                  Inventory Management
                </h3>
                <p style={{
                  margin: `0 0 ${spacing[4]} 0`,
                  color: colors.text.secondary
                }}>
                  Comprehensive inventory tracking available in the Manager Dashboard
                </p>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => navigate('/manager/inventory')}
                >
                  Go to Inventory Management
                </Button>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Reports;
