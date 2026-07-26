import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectCurrentUser, logout } from '../../store/slices/authSlice';
import { usePageStore } from '../../hooks/usePageStore';
import { withPageStoreContext } from '../../hoc/withPageStoreContext';
import { clearReturnUrl } from '../../utils/security';
import { t, Icons } from './manager-tokens';
import { useGetActiveStoresQuery, type Store } from '../../store/api/storeApi';
import { setSelectedStore, setStoreCurrency, selectSelectedStoreId, selectSelectedStoreName } from '../../store/slices/cartSlice';
import { storeCurrencyPayload, resolveStoreMarket } from '../../utils/storeCurrency';
import { useGetVersionQuery } from '../../store/api/systemApi';

const DashboardSection = React.lazy(() => import('./DashboardSection'));
const OrdersSection = React.lazy(() => import('./OrdersSection'));
const InventorySection = React.lazy(() => import('./InventorySection'));
const OperationsSection = React.lazy(() => import('./OperationsSection'));
const PeopleSection = React.lazy(() => import('./PeopleSection'));
const AnalyticsSection = React.lazy(() => import('./AnalyticsSection'));
const AIAgentsSection = React.lazy(() => import('./AIAgentsSection'));
const FiscalCompliancePage = React.lazy(() => import('./FiscalCompliancePage'));
const RightSidebar = React.lazy(() => import('./RightSidebar'));

const sections = [
  { id: 'dashboard', label: 'Dashboard', icon: Icons.Grid },
  { id: 'orders', label: 'Orders & Payments', icon: Icons.File },
  { id: 'inventory', label: 'Inventory & Supply', icon: Icons.Box },
  { id: 'operations', label: 'Operations', icon: Icons.Settings },
  { id: 'people', label: 'People & Marketing', icon: Icons.Users },
  { id: 'analytics', label: 'Analytics & Reports', icon: Icons.BarChart },
  { id: 'ai', label: 'AI Agents', icon: Icons.Sparkle },
  { id: 'compliance', label: 'Fiscal Compliance', icon: Icons.Shield },
];

const SIDEBAR_EXPANDED = 240;
const SIDEBAR_COLLAPSED = 72;

// Glass style helpers
const glass = (opacity = 0.6, blur = 20): React.CSSProperties => ({
  background: `rgba(255, 255, 255, ${opacity})`,
  backdropFilter: `blur(${blur}px)`,
  WebkitBackdropFilter: `blur(${blur}px)`,
});

// eslint-disable-next-line react-refresh/only-export-components -- page component with HOC export
function ManagerShell() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectCurrentUser);
  const { selectedStoreId, setStore: setPageStore } = usePageStore();
  const storeId = selectedStoreId || currentUser?.storeId || '';

  const activeSection = searchParams.get('section') || 'dashboard';
  const activeTab = searchParams.get('tab') || '';

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [storeDropOpen, setStoreDropOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState(searchParams.get('q') || '');
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef<HTMLDivElement>(null);

  // Store selector
  const reduxStoreId = useAppSelector(selectSelectedStoreId);
  const reduxStoreName = useAppSelector(selectSelectedStoreName);
  const { data: stores = [], isLoading: storesLoading } = useGetActiveStoresQuery();
  const { data: versionInfo } = useGetVersionQuery();

  // Auto-select the manager's assigned store on first load
  useEffect(() => {
    if (storesLoading || stores.length === 0 || selectedStoreId) return;
    const userStoreId = currentUser?.storeId;
    if (!userStoreId) return;
    const match = stores.find((s: Store) => s.storeCode === userStoreId || s.id === userStoreId);
    if (match) {
      dispatch(setSelectedStore({ storeId: match.storeCode, storeName: match.name }));
      if (resolveStoreMarket(match).resolved) {
        dispatch(setStoreCurrency(storeCurrencyPayload(match)));
      }
      setPageStore(match.storeCode, match.name);
    }
  }, [stores, storesLoading, selectedStoreId, currentUser?.storeId, dispatch, setPageStore]);

  const setSection = (id: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('section', id);
    params.delete('tab');
    setSearchParams(params);
  };

  const setTab = (tab: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    setSearchParams(params);
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (storeRef.current && !storeRef.current.contains(e.target as Node)) setStoreDropOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userName = currentUser?.name || 'Manager';
  const initials = userName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleStoreSelect = (code: string, name: string) => {
    dispatch(setSelectedStore({ storeId: code, storeName: name }));
    const store = stores.find((s: Store) => s.storeCode === code || s.id === code);
    if (store && resolveStoreMarket(store).resolved) {
      dispatch(setStoreCurrency(storeCurrencyPayload(store)));
    }
    setStoreDropOpen(false);
  };

  const handleLogout = () => {
    clearReturnUrl();
    dispatch(logout());
    navigate('/staff-login');
  };

  const sidebarWidth = sidebarOpen ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;

  return (
    <div style={{
      display: 'flex', height: '100vh', width: '100vw', position: 'fixed', top: 0, left: 0,
      fontFamily: t.font,
      background: `
        radial-gradient(ellipse at 20% 50%, rgba(255, 107, 53, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(59, 130, 246, 0.06) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 80%, rgba(16, 185, 129, 0.05) 0%, transparent 50%),
        linear-gradient(135deg, #f0ebe3 0%, #faf7f2 30%, #eef2f7 70%, #f5f0eb 100%)
      `,
    }}>

      {/* LEFT SIDEBAR */}
      <div style={{
        width: sidebarWidth,
        ...glass(0.7, 24),
        borderRight: '1px solid rgba(255,255,255,0.5)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        padding: sidebarOpen ? '24px 14px' : '24px 10px',
        overflowY: 'auto', overflowX: 'hidden',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '4px 0 30px rgba(0,0,0,0.03)',
      }}>

        {/* Logo + Collapse toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'space-between' : 'center', marginBottom: 32, minHeight: 36, paddingLeft: sidebarOpen ? 4 : 0 }}>
          {sidebarOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${t.orange}, ${t.orangeDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.white, fontWeight: 800, fontSize: 16, boxShadow: `0 4px 12px ${t.orange}40` }}>M</div>
              <span style={{ fontSize: 19, fontWeight: 700, color: t.black }}>MaSoVa</span>
            </div>
          ) : (
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${t.orange}, ${t.orangeDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.white, fontWeight: 800, fontSize: 16, boxShadow: `0 4px 12px ${t.orange}40` }}>M</div>
          )}
          <div
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              width: 28, height: 28, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: t.grayMuted,
              background: 'rgba(0,0,0,0.04)',
              transition: 'transform 0.25s ease',
              transform: sidebarOpen ? 'rotate(0deg)' : 'rotate(180deg)',
              flexShrink: 0,
              marginLeft: sidebarOpen ? 0 : 0,
            }}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <Icons.ChevronLeft />
          </div>
        </div>

        {/* Nav items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sections.map(s => {
            const isActive = activeSection === s.id;
            return (
              <div
                key={s.id}
                onClick={() => setSection(s.id)}
                title={!sidebarOpen ? s.label : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: sidebarOpen ? '11px 14px' : '11px 0',
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  borderRadius: 10,
                  background: isActive ? `linear-gradient(135deg, ${t.orange}18, ${t.orange}10)` : 'transparent',
                  color: isActive ? t.orange : t.gray,
                  fontWeight: isActive ? 600 : 500, fontSize: 14, cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                {isActive && <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, borderRadius: 2, background: t.orange }} />}
                <s.icon />
                {sidebarOpen && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>}
              </div>
            );
          })}
        </div>

        {/* Version + logout at bottom */}
        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          {sidebarOpen && versionInfo && (
            <div style={{ padding: '0 14px 12px', fontSize: 11, color: t.grayMuted }}>
              v{versionInfo.version}
            </div>
          )}
          <div
            onClick={handleLogout}
            title={!sidebarOpen ? 'Logout' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: sidebarOpen ? '11px 14px' : '11px 0',
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              borderRadius: 10, color: t.gray, fontWeight: 500, fontSize: 14, cursor: 'pointer',
            }}
          >
            <Icons.Logout />
            {sidebarOpen && <span>Logout</span>}
          </div>
        </div>
      </div>

      {/* MIDDLE + RIGHT */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* HEADER */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 28px',
          ...glass(0.65, 20),
          borderBottom: '1px solid rgba(255,255,255,0.4)',
          flexShrink: 0, height: t.headerHeight,
          boxShadow: '0 2px 20px rgba(0,0,0,0.03)',
          position: 'relative', zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Hamburger for collapsed sidebar on small or when collapsed */}
            {!sidebarOpen && (
              <div
                onClick={() => setSidebarOpen(true)}
                style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.gray, background: 'rgba(0,0,0,0.04)' }}
              >
                <Icons.Menu />
              </div>
            )}
            <div>
              <h1 style={{ fontSize: 21, fontWeight: 700, color: t.black, margin: 0 }}>
                {sections.find(s => s.id === activeSection)?.label || 'Dashboard'}
              </h1>
              <p style={{ fontSize: 13, color: t.gray, margin: 0, fontWeight: 500 }}>
                Hello {userName.split(' ')[0]}, welcome back!
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Store Selector */}
            <div ref={storeRef} style={{ position: 'relative' }}>
              <div
                onClick={() => { setStoreDropOpen(!storeDropOpen); setProfileOpen(false); setNotifOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 14px', borderRadius: 10,
                  border: `1px solid ${storeDropOpen ? t.orange : 'rgba(0,0,0,0.08)'}`,
                  background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(8px)',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, color: t.black, fontFamily: t.font,
                  minWidth: 160, justifyContent: 'space-between',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {storesLoading ? 'Loading...' : reduxStoreName || 'Select Store'}
                </span>
                <Icons.Down />
              </div>
              {storeDropOpen && (
                <div style={{
                  position: 'absolute', top: 44, left: 0, minWidth: 280, maxHeight: 320, overflowY: 'auto',
                  ...glass(0.9, 24), borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
                  border: '1px solid rgba(255,255,255,0.5)', zIndex: 100,
                }}>
                  {stores.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', color: t.grayMuted, fontSize: 13 }}>No stores available</div>
                  ) : stores.map(store => {
                    const isSel = reduxStoreId === store.storeCode;
                    return (
                      <div
                        key={store.id}
                        onClick={() => handleStoreSelect(store.storeCode, store.name)}
                        style={{
                          padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: isSel ? `${t.orange}10` : 'transparent',
                          borderBottom: '1px solid rgba(0,0,0,0.04)',
                        }}
                        onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
                        onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: isSel ? 600 : 500, color: isSel ? t.orange : t.black }}>{store.name}</div>
                          <div style={{ fontSize: 11, color: t.grayMuted }}>{store.address?.city}, {store.address?.state}</div>
                        </div>
                        {isSel && <div style={{ width: 8, height: 8, borderRadius: 4, background: t.orange }} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Search — jumps to Orders with ?q= (list filters client-side) */}
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: t.gray }}><Icons.Search /></div>
              <input
                placeholder="Search orders…"
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const q = headerSearch.trim();
                  const params = new URLSearchParams(searchParams);
                  params.set('section', 'orders');
                  params.set('tab', 'orders');
                  if (q) params.set('q', q);
                  else params.delete('q');
                  setSearchParams(params);
                }}
                title="Press Enter to search orders by number, customer, phone, or email"
                style={{
                  padding: '9px 16px 9px 36px', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, width: 220,
                  background: 'rgba(255,255,255,0.6)', outline: 'none', fontFamily: t.font,
                  backdropFilter: 'blur(8px)',
                }}
              />
            </div>
            {/* Bell / Notifications */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <div onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }} style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${notifOpen ? t.orange : 'rgba(0,0,0,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: notifOpen ? t.orange : t.gray, background: 'rgba(255,255,255,0.5)' }}>
                <Icons.Bell />
              </div>
              {notifOpen && (
                <div style={{ position: 'absolute', top: 46, right: 0, width: 300, ...glass(0.85, 24), borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.5)', zIndex: 100, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', fontWeight: 600, fontSize: 14, color: t.black }}>Notifications</div>
                  <div style={{ padding: 20, textAlign: 'center', color: t.grayMuted, fontSize: 13 }}>No new notifications</div>
                </div>
              )}
            </div>
            {/* Settings */}
            <div
              onClick={() => { setSearchParams({ section: 'operations', tab: 'stores' }); }}
              style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.gray, background: 'rgba(255,255,255,0.5)' }}
              title="Store Settings"
            >
              <Icons.Settings />
            </div>
            {/* Profile Dropdown */}
            <div ref={profileRef} style={{ position: 'relative' }}>
              <div onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 12px 5px 5px', border: `1px solid ${profileOpen ? t.orange : 'rgba(0,0,0,0.08)'}`, borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.5)' }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${t.orange}, ${t.orangeDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.white, fontWeight: 700, fontSize: 11 }}>{initials}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.black, lineHeight: 1.2 }}>{userName}</div>
                  <div style={{ fontSize: 11, color: t.gray, fontWeight: 500, lineHeight: 1.2 }}>{currentUser?.type || 'Manager'}</div>
                </div>
                <Icons.Down />
              </div>
              {profileOpen && (
                <div style={{ position: 'absolute', top: 50, right: 0, width: 220, ...glass(0.9, 24), borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.5)', zIndex: 100, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: t.black }}>{userName}</div>
                    <div style={{ fontSize: 12, color: t.grayMuted }}>{currentUser?.email || ''}</div>
                  </div>
                  <div
                    onClick={() => { setProfileOpen(false); navigate('/staff/profile'); }}
                    style={{ padding: '10px 16px', fontSize: 13, color: t.black, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Icons.Users /> My Profile
                  </div>
                  <div
                    onClick={() => { setProfileOpen(false); setSearchParams({ section: 'people', tab: 'staff' }); }}
                    style={{ padding: '10px 16px', fontSize: 13, color: t.black, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Icons.Settings /> Staff Settings
                  </div>
                  <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <div
                      onClick={() => { setProfileOpen(false); handleLogout(); }}
                      style={{ padding: '10px 16px', fontSize: 13, color: t.red, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Icons.Logout /> Logout
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CONTENT ROW: Middle + Right sidebar */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* MIDDLE CONTENT */}
          <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
            <React.Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: t.gray }}>Loading...</div>}>
              {activeSection === 'dashboard' && <DashboardSection storeId={storeId} />}
              {activeSection === 'orders' && <OrdersSection storeId={storeId} activeTab={activeTab} onTabChange={setTab} />}
              {activeSection === 'inventory' && <InventorySection storeId={storeId} activeTab={activeTab} onTabChange={setTab} />}
              {activeSection === 'operations' && <OperationsSection storeId={storeId} activeTab={activeTab} onTabChange={setTab} />}
              {activeSection === 'people' && <PeopleSection storeId={storeId} activeTab={activeTab} onTabChange={setTab} />}
              {activeSection === 'analytics' && <AnalyticsSection storeId={storeId} activeTab={activeTab} onTabChange={setTab} />}
              {activeSection === 'ai' && <AIAgentsSection storeId={storeId} />}
              {activeSection === 'compliance' && <FiscalCompliancePage storeId={storeId} />}
            </React.Suspense>
          </div>

          {/* RIGHT SIDEBAR */}
          <div style={{
            width: t.rightSidebarWidth,
            ...glass(0.55, 20),
            borderLeft: '1px solid rgba(255,255,255,0.4)',
            overflowY: 'auto', flexShrink: 0,
            boxShadow: '-2px 0 20px rgba(0,0,0,0.02)',
          }}>
            <React.Suspense fallback={null}>
              <RightSidebar section={activeSection} storeId={storeId} />
            </React.Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- HOC default export
export default withPageStoreContext(ManagerShell, 'manager-shell');
