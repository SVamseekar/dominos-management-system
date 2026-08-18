import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, CircularProgress, Box } from '@mui/material';
import { Provider } from 'react-redux';
import { SnackbarProvider } from 'notistack';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { store } from './store/store';
import { MaSoVaTheme } from './styles/theme';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { NotificationSystem } from './components/common/NotificationSystem';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { TokenRefreshManager } from './components/auth/TokenRefreshManager';
import { ConnectionMonitorProvider } from './components/common/ConnectionMonitorProvider';
import { ChatWidget } from './components/chat/ChatWidget';
import { CookieConsent } from './components/gdpr/CookieConsent';
import { GoogleAnalytics } from './components/GoogleAnalytics';
import { AppSeo } from './components/seo/AppSeo';
import { CustomerLayout } from './components/customer/CustomerLayout';
import { StoreLocaleSync } from './components/i18n/StoreLocaleSync';

// Lazy load components
const ProductSitePage = React.lazy(() => import('./apps/ProductSite/ProductSitePage'))

const HomePage = React.lazy(() => import('./apps/PublicWebsite/HomePage'));
const PromotionsPage = React.lazy(() => import('./apps/PublicWebsite/PromotionsPage'));
const PublicMenuPage = React.lazy(() => import('./apps/PublicWebsite/PublicMenuPage'));
const LoginPage = React.lazy(() => import('./pages/auth/LoginPage'));
const CustomerLoginPage = React.lazy(() => import('./pages/auth/CustomerLoginPage'));
const RegisterPage = React.lazy(() => import('./pages/auth/RegisterPage'));
const CheckoutPage = React.lazy(() => import('./pages/checkout/CheckoutPage'));
const GuestCheckoutPage = React.lazy(() => import('./pages/checkout/GuestCheckoutPage'));
const PaymentPage = React.lazy(() => import('./pages/customer/PaymentPage'));
const PaymentSuccessPage = React.lazy(() => import('./pages/customer/PaymentSuccessPage'));
const PaymentFailedPage = React.lazy(() => import('./pages/customer/PaymentFailedPage'));
const TrackingPage = React.lazy(() => import('./pages/customer/TrackingPage'));
const LiveTrackingPage = React.lazy(() => import('./pages/customer/LiveTrackingPage'));
const OrderTrackingPage = React.lazy(() => import('./pages/customer/OrderTrackingPage'));
const PublicRatingPage = React.lazy(() => import('./pages/PublicRatingPage'));
const CustomerDashboard = React.lazy(() => import('./pages/customer/CustomerDashboard'));
const ProfilePage = React.lazy(() => import('./pages/customer/ProfilePage'));
const ManagerShell = React.lazy(() => import('./pages/manager/ManagerShell'));
const StaffProfilePage = React.lazy(() => import('./pages/staff/StaffProfilePage'));
const KitchenDisplayPage = React.lazy(() => import('./pages/kitchen/KitchenDisplayPage'));
const DriverDashboard = React.lazy(() => import('./pages/driver/DriverDashboard'));
const POSSystem = React.lazy(() => import('./apps/POSSystem/POSSystem'));
const KioskSetupPage = React.lazy(() => import('./pages/kiosk/KioskSetupPage'));
const GdprRequests = React.lazy(() => import('./pages/GdprRequests').then(m => ({ default: m.GdprRequests })));
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = React.lazy(() => import('./pages/TermsOfService').then(m => ({ default: m.TermsOfService })));
const CookiePolicy = React.lazy(() => import('./pages/CookiePolicy').then(m => ({ default: m.CookiePolicy })));
const RefundPolicy = React.lazy(() => import('./pages/RefundPolicy').then(m => ({ default: m.RefundPolicy })));
// Kiosk mode hook
import { useKioskMode } from './hooks/useKioskMode';

// Loading component
const AppLoader = () => (
  <Box
    display="flex"
    justifyContent="center"
    alignItems="center"
    minHeight="100vh"
    bgcolor="transparent"
  >
    <CircularProgress color="primary" size={60} />
  </Box>
);

// Kiosk Mode Initializer component
const KioskModeInitializer: React.FC = () => {
  const { isLoading } = useKioskMode();

  if (isLoading) {
    return <AppLoader />;
  }

  return null;
};

const App: React.FC = () => {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? ''}>
    <Provider store={store}>
      <StoreLocaleSync />
      <TokenRefreshManager />
      <KioskModeInitializer />
      <ConnectionMonitorProvider>
        <ThemeProvider theme={MaSoVaTheme}>
          <CssBaseline />
          <SnackbarProvider
            maxSnack={4}
            autoHideDuration={3000}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            preventDuplicate
            dense
          >
            <ErrorBoundary>
              <Router>
                <AppSeo />
                <div className="App">
                  <Suspense fallback={<AppLoader />}>
                    <Routes>
                  {/* Public Routes - No Login Required */}
                  <Route path="/" element={<ProductSitePage />} />
                  <Route path="/order" element={<CustomerLayout><HomePage /></CustomerLayout>} />
                  <Route path="/menu" element={<CustomerLayout><PublicMenuPage /></CustomerLayout>} />
                  <Route path="/promotions" element={<CustomerLayout><PromotionsPage /></CustomerLayout>} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/cookies" element={<CookiePolicy />} />
                  <Route path="/refunds" element={<RefundPolicy />} />

                  {/* Authentication & Checkout Routes - Public */}
                  <Route path="/login" element={<Navigate to="/customer-login" replace />} />
                  <Route path="/customer-login" element={<CustomerLayout><CustomerLoginPage /></CustomerLayout>} />
                  <Route path="/staff-login" element={<LoginPage />} />
                  <Route path="/register" element={<CustomerLayout><RegisterPage /></CustomerLayout>} />
                  <Route path="/checkout" element={<CustomerLayout><CheckoutPage /></CustomerLayout>} />
                  <Route path="/guest-checkout" element={<CustomerLayout><GuestCheckoutPage /></CustomerLayout>} />
                  <Route path="/payment" element={<CustomerLayout><PaymentPage /></CustomerLayout>} />
                  <Route path="/payment/success" element={<CustomerLayout><PaymentSuccessPage /></CustomerLayout>} />
                  <Route path="/payment/failed" element={<CustomerLayout><PaymentFailedPage /></CustomerLayout>} />
                  <Route path="/tracking/:orderId" element={<CustomerLayout><TrackingPage /></CustomerLayout>} />
                  <Route path="/live-tracking/:orderId" element={<CustomerLayout><LiveTrackingPage /></CustomerLayout>} />
                  <Route path="/rate/:orderId/:token" element={<CustomerLayout><PublicRatingPage /></CustomerLayout>} />

                  {/* Customer Dashboard - Login required */}
                  <Route
                    path="/customer-dashboard"
                    element={
                      <ProtectedRoute allowedRoles={['CUSTOMER']} requireAuth={true}>
                        <CustomerLayout><CustomerDashboard /></CustomerLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/customer/orders"
                    element={
                      <ProtectedRoute allowedRoles={['CUSTOMER']} requireAuth={true}>
                        <CustomerLayout><OrderTrackingPage /></CustomerLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/customer/profile"
                    element={
                      <ProtectedRoute allowedRoles={['CUSTOMER']} requireAuth={true}>
                        <CustomerLayout><ProfilePage /></CustomerLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/customer/notifications"
                    element={<Navigate to="/customer/profile?section=notifications" replace />}
                  />
                  <Route
                    path="/customer/gdpr"
                    element={
                      <ProtectedRoute allowedRoles={['CUSTOMER']} requireAuth={true}>
                        <CustomerLayout><GdprRequests /></CustomerLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Kitchen Display - Public Access (No Login Required) */}
                  <Route path="/kitchen" element={<KitchenDisplayPage />} />
                  <Route path="/kitchen/:storeId" element={<KitchenDisplayPage />} />

                  {/* Manager Dashboard - Consolidated Shell */}
                  <Route
                    path="/manager"
                    element={
                      <ProtectedRoute allowedRoles={['MANAGER', 'ASSISTANT_MANAGER']}>
                        <ManagerShell />
                      </ProtectedRoute>
                    }
                  />

                  {/* Legacy manager URL redirects */}
                  <Route path="/manager/payments" element={<Navigate to="/manager?section=orders&tab=payments" replace />} />
                  <Route path="/manager/refunds" element={<Navigate to="/manager?section=orders&tab=refunds" replace />} />
                  <Route path="/manager/orders" element={<Navigate to="/manager?section=orders&tab=orders" replace />} />
                  <Route path="/manager/consolidated-orders" element={<Navigate to="/manager?section=orders&tab=orders" replace />} />
                  <Route path="/manager/deliveries" element={<Navigate to="/manager?section=orders&tab=deliveries" replace />} />
                  <Route path="/manager/inventory" element={<Navigate to="/manager?section=inventory&tab=stock" replace />} />
                  <Route path="/manager/suppliers" element={<Navigate to="/manager?section=inventory&tab=suppliers" replace />} />
                  <Route path="/manager/purchase-orders" element={<Navigate to="/manager?section=inventory&tab=purchase-orders" replace />} />
                  <Route path="/manager/waste-analysis" element={<Navigate to="/manager?section=inventory&tab=waste" replace />} />
                  <Route path="/manager/recipes" element={<Navigate to="/manager?section=operations&tab=recipes" replace />} />
                  <Route path="/manager/drivers" element={<Navigate to="/manager?section=operations&tab=drivers" replace />} />
                  <Route path="/manager/stores" element={<Navigate to="/manager?section=operations&tab=stores" replace />} />
                  <Route path="/manager/kiosk" element={<Navigate to="/manager?section=operations&tab=kiosks" replace />} />
                  <Route path="/manager/staff" element={<Navigate to="/manager?section=people&tab=staff" replace />} />
                  <Route path="/manager/staff-scheduling" element={<Navigate to="/manager?section=people&tab=scheduling" replace />} />
                  <Route path="/manager/staff-leaderboard" element={<Navigate to="/manager?section=people&tab=leaderboard" replace />} />
                  <Route path="/manager/customers" element={<Navigate to="/manager?section=people&tab=customers" replace />} />
                  <Route path="/manager/campaigns" element={<Navigate to="/manager?section=people&tab=campaigns" replace />} />
                  <Route path="/manager/reviews" element={<Navigate to="/manager?section=people&tab=reviews" replace />} />
                  <Route path="/manager/kitchen-analytics" element={<Navigate to="/manager?section=analytics&tab=kitchen" replace />} />
                  <Route path="/manager/product-analytics" element={<Navigate to="/manager?section=analytics&tab=products" replace />} />
                  <Route path="/manager/advanced-reports" element={<Navigate to="/manager?section=analytics&tab=reports" replace />} />
                  <Route path="/manager/equipment-monitoring" element={<Navigate to="/manager?section=analytics&tab=equipment" replace />} />
                  {/* K9: no dual MUI analytics — always shell analytics */}
                  <Route path="/manager/analytics" element={<Navigate to="/manager?section=analytics&tab=kitchen" replace />} />

                  {/* Staff Profile - stays as separate route */}
                  <Route
                    path="/manager/staff/:staffId/profile"
                    element={
                      <ProtectedRoute allowedRoles={['MANAGER', 'ASSISTANT_MANAGER']}>
                        <StaffProfilePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/staff/profile"
                    element={
                      <ProtectedRoute allowedRoles={['STAFF', 'MANAGER', 'ASSISTANT_MANAGER']}>
                        <StaffProfilePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/kitchen/*"
                    element={
                      <ProtectedRoute allowedRoles={['STAFF', 'MANAGER', 'ASSISTANT_MANAGER']}>
                        <KitchenDisplayPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/driver/*"
                    element={
                      <ProtectedRoute allowedRoles={['DRIVER']}>
                        <DriverDashboard />
                      </ProtectedRoute>
                    }
                  />
                  {/* POS System - Public Access (PIN authentication per order) */}
                  <Route path="/pos/*" element={<POSSystem />} />
                  {/* Kiosk Setup (Public) */}
                  <Route path="/kiosk-setup" element={<KioskSetupPage />} />

                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
                <NotificationSystem />
                <ChatWidget />

                <CookieConsent />
                <GoogleAnalytics />
              </div>
            </Router>
          </ErrorBoundary>
        </SnackbarProvider>
      </ThemeProvider>
      </ConnectionMonitorProvider>
    </Provider>
    </GoogleOAuthProvider>
  );
};

export default App;