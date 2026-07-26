// src/apps/POSSystem/components/MenuPanel.tsx
/**
 * Craft menu column — photo grid, icon cuisine rail, popular strip, detail sheet.
 * Landscape cashier floor (not consumer phone layout).
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  useGetAvailableMenuQuery,
  Cuisine,
  MenuCategory,
  DietaryType,
  type MenuItem,
} from '../../../store/api/menuApi';
import { useAppSelector } from '../../../store/hooks';
import {
  selectSelectedStoreId,
  selectCartCurrency,
  selectCartLocale,
} from '../../../store/slices/cartSlice';
import { formatMoney } from '../../../utils/currency';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import SearchIcon from '@mui/icons-material/Search';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import RefreshIcon from '@mui/icons-material/Refresh';
import LunchDiningIcon from '@mui/icons-material/LunchDining';
import LocalPizzaIcon from '@mui/icons-material/LocalPizza';
import RiceBowlIcon from '@mui/icons-material/RiceBowl';
import LocalCafeIcon from '@mui/icons-material/LocalCafe';
import IcecreamIcon from '@mui/icons-material/Icecream';
import RamenDiningIcon from '@mui/icons-material/RamenDining';
import SetMealIcon from '@mui/icons-material/SetMeal';
import FastfoodIcon from '@mui/icons-material/Fastfood';
import {
  pos,
  posTouchBtnBase,
  posPanelHeader,
  posSectionTitle,
  posField,
} from '../posTokens';
import ItemCustomizeSheet from './ItemCustomizeSheet';

interface MenuPanelProps {
  onAddItem: (item: MenuItem, quantity?: number, instructions?: string) => void;
}

const CUISINE_LABEL: Record<string, string> = {
  SOUTH_INDIAN: 'South Indian',
  NORTH_INDIAN: 'North Indian',
  INDO_CHINESE: 'Indo-Chinese',
  ITALIAN: 'Italian',
  AMERICAN: 'American',
  CONTINENTAL: 'Continental',
  BEVERAGES: 'Drinks',
  DESSERTS: 'Desserts',
};

function cuisineIcon(cuisine: Cuisine): React.ReactNode {
  const sx = { fontSize: 22 };
  switch (cuisine) {
    case Cuisine.AMERICAN:
      return <LunchDiningIcon style={sx} />;
    case Cuisine.ITALIAN:
      return <LocalPizzaIcon style={sx} />;
    case Cuisine.SOUTH_INDIAN:
    case Cuisine.NORTH_INDIAN:
      return <RiceBowlIcon style={sx} />;
    case Cuisine.INDO_CHINESE:
      return <RamenDiningIcon style={sx} />;
    case Cuisine.CONTINENTAL:
      return <SetMealIcon style={sx} />;
    case Cuisine.BEVERAGES:
      return <LocalCafeIcon style={sx} />;
    case Cuisine.DESSERTS:
      return <IcecreamIcon style={sx} />;
    default:
      return <FastfoodIcon style={sx} />;
  }
}

function getCategoriesForCuisine(cuisine: Cuisine): MenuCategory[] {
  const categoryMap: Record<Cuisine, MenuCategory[]> = {
    [Cuisine.SOUTH_INDIAN]: [
      MenuCategory.DOSA,
      MenuCategory.IDLY_VADA,
      MenuCategory.SOUTH_INDIAN_MEALS,
      MenuCategory.RICE_VARIETIES,
    ],
    [Cuisine.NORTH_INDIAN]: [
      MenuCategory.CURRY_GRAVY,
      MenuCategory.DAL_DISHES,
      MenuCategory.NORTH_INDIAN_MEALS,
      MenuCategory.RICE_VARIETIES,
      MenuCategory.CHAPATI_ROTI,
      MenuCategory.NAAN_KULCHA,
    ],
    [Cuisine.INDO_CHINESE]: [
      MenuCategory.FRIED_RICE,
      MenuCategory.NOODLES,
      MenuCategory.MANCHURIAN,
    ],
    [Cuisine.ITALIAN]: [MenuCategory.PIZZA, MenuCategory.SIDES],
    [Cuisine.AMERICAN]: [MenuCategory.BURGER, MenuCategory.SIDES],
    [Cuisine.CONTINENTAL]: [MenuCategory.SIDES],
    [Cuisine.BEVERAGES]: [
      MenuCategory.HOT_DRINKS,
      MenuCategory.COLD_DRINKS,
      MenuCategory.TEA_CHAI,
    ],
    [Cuisine.DESSERTS]: [
      MenuCategory.COOKIES_BROWNIES,
      MenuCategory.ICE_CREAM,
      MenuCategory.DESSERT_SPECIALS,
    ],
  };
  return categoryMap[cuisine] || [];
}

const MenuPanel: React.FC<MenuPanelProps> = ({ onAddItem }) => {
  const currency = useAppSelector(selectCartCurrency);
  const locale = useAppSelector(selectCartLocale);
  const selectedStoreId = useAppSelector(selectSelectedStoreId);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState<Cuisine>(Cuisine.SOUTH_INDIAN);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | null>(null);
  const [selectedDietary, setSelectedDietary] = useState<DietaryType | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);

  const { data: menuItems = [], isLoading, error, refetch } = useGetAvailableMenuQuery(
    undefined,
    { refetchOnMountOrArgChange: true }
  );

  useEffect(() => {
    if (selectedStoreId) void refetch();
  }, [selectedStoreId, refetch]);

  const availableCategories = getCategoriesForCuisine(selectedCuisine);

  const filteredItems = useMemo(() => {
    return menuItems.filter((item: MenuItem) => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCuisine = item.cuisine === selectedCuisine;
      const matchesCategory = selectedCategory === null || item.category === selectedCategory;
      const matchesDietary = !selectedDietary || item.dietaryInfo?.includes(selectedDietary);
      return matchesSearch && matchesCuisine && matchesCategory && matchesDietary && item.isAvailable;
    });
  }, [menuItems, searchTerm, selectedCuisine, selectedCategory, selectedDietary]);

  const popularItems = useMemo(
    () =>
      menuItems
        .filter(
          (item: MenuItem) =>
            item.isRecommended && item.isAvailable && item.cuisine === selectedCuisine
        )
        .slice(0, 8),
    [menuItems, selectedCuisine]
  );

  const flashAdd = (item: MenuItem, qty = 1, instructions?: string) => {
    onAddItem(item, qty, instructions);
    setJustAddedId(item.id);
    window.setTimeout(() => setJustAddedId((id) => (id === item.id ? null : id)), 320);
  };

  return (
    <div
      data-testid="menu-panel"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      <div style={posPanelHeader}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 12,
            gap: 12,
          }}
        >
          <div>
            <h3 style={posSectionTitle}>
              <RestaurantMenuIcon style={{ fontSize: 22, color: pos.role }} />
              Menu
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: pos.muted }}>
              Tap photo for details · <span style={{ color: pos.role }}>+</span> to quick-add
            </p>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              background: pos.roleSoft,
              color: pos.role,
              padding: '8px 12px',
              borderRadius: 999,
              border: `1px solid ${pos.roleBorder}`,
              whiteSpace: 'nowrap',
            }}
          >
            {filteredItems.length} live
          </span>
        </div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <SearchIcon
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 18,
              color: pos.faint,
              pointerEvents: 'none',
            }}
          />
          <input
            type="search"
            placeholder="Search your menu…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search menu items"
            style={{
              ...posField,
              paddingLeft: 44,
              borderRadius: 999,
              background: 'rgba(0,0,0,0.4)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = pos.role;
              e.currentTarget.style.boxShadow = `0 0 0 3px ${pos.roleSoft}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = pos.border;
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Icon cuisine rail */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            overflowX: 'auto',
            paddingBottom: 8,
            marginBottom: 8,
            scrollbarWidth: 'thin',
          }}
        >
          {Object.values(Cuisine).map((cuisine) => {
            const active = selectedCuisine === cuisine;
            return (
              <button
                key={cuisine}
                type="button"
                onClick={() => {
                  setSelectedCuisine(cuisine);
                  setSelectedCategory(null);
                }}
                style={{
                  ...posTouchBtnBase,
                  flexDirection: 'column',
                  gap: 6,
                  minWidth: 76,
                  minHeight: 72,
                  padding: '10px 8px',
                  borderRadius: 16,
                  ...(active
                    ? {
                        background: `linear-gradient(160deg, ${pos.role} 0%, ${pos.roleDark} 100%)`,
                        color: '#fff',
                        boxShadow: `0 8px 22px ${pos.roleShadow}`,
                        border: 'none',
                      }
                    : {
                        background: 'rgba(255,255,255,0.04)',
                        color: pos.muted,
                        border: `1px solid ${pos.border}`,
                      }),
                }}
              >
                {cuisineIcon(cuisine)}
                <span style={{ fontSize: 10, lineHeight: 1.15, textAlign: 'center', fontWeight: 700 }}>
                  {CUISINE_LABEL[cuisine] || cuisine.replace(/_/g, ' ')}
                </span>
              </button>
            );
          })}
        </div>

        {availableCategories.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              style={{
                ...posTouchBtnBase,
                minHeight: 36,
                padding: '6px 14px',
                borderRadius: 999,
                fontSize: 12,
                ...(selectedCategory === null
                  ? { background: pos.role, color: '#fff', border: 'none' }
                  : {
                      background: 'transparent',
                      color: pos.muted,
                      border: `1px solid ${pos.border}`,
                    }),
              }}
            >
              All
            </button>
            {availableCategories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                style={{
                  ...posTouchBtnBase,
                  minHeight: 36,
                  padding: '6px 14px',
                  borderRadius: 999,
                  fontSize: 12,
                  ...(selectedCategory === category
                    ? { background: pos.roleDark, color: '#fff', border: 'none' }
                    : {
                        background: 'transparent',
                        color: pos.muted,
                        border: `1px solid ${pos.border}`,
                      }),
                }}
              >
                {category.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(
            [
              { key: null, label: 'All diet' },
              { key: DietaryType.VEGETARIAN, label: 'Veg' },
              { key: DietaryType.VEGAN, label: 'Vegan' },
              { key: DietaryType.NON_VEGETARIAN, label: 'Non-veg' },
            ] as const
          ).map(({ key, label }) => {
            const active = selectedDietary === key;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setSelectedDietary(key)}
                style={{
                  ...posTouchBtnBase,
                  minHeight: 32,
                  padding: '4px 12px',
                  borderRadius: 999,
                  fontSize: 11,
                  ...(active
                    ? {
                        background:
                          key === DietaryType.NON_VEGETARIAN
                            ? pos.error
                            : key === DietaryType.VEGAN
                              ? pos.successDark
                              : pos.success,
                        color: '#fff',
                        border: 'none',
                      }
                    : {
                        background: 'rgba(255,255,255,0.03)',
                        color: pos.faint,
                        border: `1px solid ${pos.border}`,
                      }),
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Popular Now rail */}
      {!searchTerm && selectedCategory === null && popularItems.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${pos.border}`,
            background: `linear-gradient(90deg, ${pos.roleSoft} 0%, transparent 70%)`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 800,
                color: pos.role,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <LocalFireDepartmentIcon style={{ fontSize: 16 }} />
              Popular now
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 12,
              overflowX: 'auto',
              paddingBottom: 4,
              scrollbarWidth: 'thin',
            }}
          >
            {popularItems.map((item: MenuItem) => (
              <button
                key={item.id}
                type="button"
                onClick={() => flashAdd(item)}
                style={{
                  flex: '0 0 148px',
                  border: `1px solid ${pos.border}`,
                  borderRadius: 18,
                  overflow: 'hidden',
                  padding: 0,
                  background: pos.surfaceAlt,
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: pos.shadow.soft,
                  fontFamily: pos.font,
                }}
              >
                <div style={{ height: 88, position: 'relative', background: pos.surfaceElevated }}>
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 28,
                        fontWeight: 800,
                        color: pos.role,
                      }}
                    >
                      {item.name.charAt(0)}
                    </div>
                  )}
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      right: 8,
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: pos.role,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: 20,
                      boxShadow: `0 4px 12px ${pos.roleShadow}`,
                    }}
                  >
                    +
                  </span>
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: pos.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.name}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: pos.role, marginTop: 2 }}>
                    {formatMoney(item.basePrice, currency, locale)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 14,
          minHeight: 0,
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        {isLoading && (
          <div
            data-testid="menu-loading"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 14,
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 200,
                  borderRadius: 18,
                  background: pos.surfaceElevated,
                  border: `1px solid ${pos.border}`,
                  animation: 'posMenuPulse 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.05}s`,
                }}
              />
            ))}
            <style>{`
              @keyframes posMenuPulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.4; }
              }
            `}</style>
          </div>
        )}

        {error && (
          <div
            data-testid="menu-error"
            style={{
              padding: 28,
              borderRadius: 18,
              border: `1px solid ${pos.error}`,
              background: pos.errorSoft,
              textAlign: 'center',
            }}
          >
            <p style={{ margin: '0 0 8px', color: pos.ink, fontWeight: 700 }}>Couldn’t load menu</p>
            <p style={{ margin: '0 0 16px', color: pos.muted, fontSize: 13 }}>
              Check network or store selection, then retry.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              style={{
                ...posTouchBtnBase,
                background: pos.role,
                color: '#fff',
                borderRadius: 999,
              }}
            >
              <RefreshIcon style={{ fontSize: 18 }} />
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && filteredItems.length === 0 && (
          <div
            data-testid="menu-empty"
            style={{
              padding: 40,
              borderRadius: 18,
              border: `1px dashed ${pos.border}`,
              background: pos.surface,
              textAlign: 'center',
              color: pos.muted,
            }}
          >
            <RestaurantMenuIcon style={{ fontSize: 44, color: pos.faint, marginBottom: 12 }} />
            <div style={{ fontWeight: 700, color: pos.ink, marginBottom: 6 }}>
              {searchTerm ? 'No matches' : 'No items match'}
            </div>
            <div style={{ fontSize: 13 }}>
              {searchTerm
                ? 'Try another search or clear filters.'
                : 'Switch cuisine or category to browse available items.'}
            </div>
          </div>
        )}

        {!isLoading && !error && filteredItems.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 14,
            }}
          >
            {filteredItems.map((item: MenuItem) => {
              const flash = justAddedId === item.id;
              return (
                <div
                  key={item.id}
                  data-testid={`menu-item-${item.id}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 18,
                    overflow: 'hidden',
                    border: flash ? `2px solid ${pos.success}` : `1px solid ${pos.border}`,
                    background: flash ? pos.successSoft : pos.surface,
                    boxShadow: pos.shadow.raised.sm,
                    transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                    minHeight: 210,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSheetItem(item)}
                    style={{
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      background: pos.surfaceAlt,
                      height: 110,
                      position: 'relative',
                      display: 'block',
                      width: '100%',
                    }}
                    aria-label={`Details for ${item.name}`}
                  >
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
                          background: `linear-gradient(145deg, ${pos.surfaceElevated}, ${pos.surfaceAlt})`,
                          fontSize: 36,
                          fontWeight: 900,
                          color: pos.faint,
                        }}
                      >
                        {item.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {item.isRecommended && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '4px 8px',
                          borderRadius: 8,
                          background: pos.role,
                          color: '#fff',
                          textTransform: 'uppercase',
                        }}
                      >
                        Hot
                      </span>
                    )}
                  </button>

                  <div
                    style={{
                      padding: 12,
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: pos.ink,
                        lineHeight: 1.25,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        minHeight: '2.4em',
                      }}
                    >
                      {item.name}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {item.dietaryInfo?.includes(DietaryType.VEGETARIAN) && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: 6,
                            background: pos.successSoft,
                            color: pos.successDark,
                          }}
                        >
                          VEG
                        </span>
                      )}
                      {item.dietaryInfo?.includes(DietaryType.NON_VEGETARIAN) && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: 6,
                            background: pos.errorSoft,
                            color: pos.errorDark,
                          }}
                        >
                          NON-VEG
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        marginTop: 'auto',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 16, fontWeight: 900, color: pos.role }}>
                        {formatMoney(item.basePrice, currency, locale)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Add ${item.name}`}
                        onClick={() => flashAdd(item)}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: '50%',
                          border: 'none',
                          background: `linear-gradient(145deg, ${pos.role}, ${pos.roleDark})`,
                          color: '#fff',
                          fontSize: 24,
                          fontWeight: 900,
                          cursor: 'pointer',
                          boxShadow: `0 6px 16px ${pos.roleShadow}`,
                          flexShrink: 0,
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ItemCustomizeSheet
        item={sheetItem}
        open={!!sheetItem}
        onClose={() => setSheetItem(null)}
        onAdd={(item, quantity, instructions) => flashAdd(item, quantity, instructions)}
      />
    </div>
  );
};

export default MenuPanel;
