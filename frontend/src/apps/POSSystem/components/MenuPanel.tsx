// src/apps/POSSystem/components/MenuPanel.tsx
/**
 * POS menu column — store menu from commerce API only.
 * Cuisine / category / dietary from MenuItem fields (MaSoVa enums).
 * Landscape staff grid: search → filters → add to ticket.
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

/** Display labels for existing Cuisine enum values only */
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

/** Prefer order when picking default cuisine — only if present in loaded menu */
const CUISINE_DEFAULT_PRIORITY: Cuisine[] = [
  Cuisine.ITALIAN,
  Cuisine.CONTINENTAL,
  Cuisine.AMERICAN,
  Cuisine.SOUTH_INDIAN,
  Cuisine.NORTH_INDIAN,
  Cuisine.INDO_CHINESE,
  Cuisine.BEVERAGES,
  Cuisine.DESSERTS,
];

function cuisineIcon(cuisine: Cuisine): React.ReactNode {
  const sx = { fontSize: 20 };
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

function formatCategoryLabel(category: string): string {
  return category.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

const chip: React.CSSProperties = {
  ...posTouchBtnBase,
  minHeight: 40,
  padding: '8px 12px',
  fontSize: 12,
  borderRadius: 10,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const MenuPanel: React.FC<MenuPanelProps> = ({ onAddItem }) => {
  const currency = useAppSelector(selectCartCurrency);
  const locale = useAppSelector(selectCartLocale);
  const selectedStoreId = useAppSelector(selectSelectedStoreId);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState<Cuisine | null>(null);
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

  /** Cuisines that actually appear on the loaded store menu */
  const availableCuisines = useMemo(() => {
    const set = new Set<Cuisine>();
    menuItems.forEach((item) => {
      if (item.isAvailable && item.cuisine) set.add(item.cuisine);
    });
    const list = Array.from(set);
    list.sort((a, b) => {
      const ia = CUISINE_DEFAULT_PRIORITY.indexOf(a);
      const ib = CUISINE_DEFAULT_PRIORITY.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return list;
  }, [menuItems]);

  // Sync selection to menu data (never invent a cuisine not on the menu)
  useEffect(() => {
    if (availableCuisines.length === 0) {
      setSelectedCuisine(null);
      return;
    }
    if (!selectedCuisine || !availableCuisines.includes(selectedCuisine)) {
      setSelectedCuisine(availableCuisines[0]);
      setSelectedCategory(null);
    }
  }, [availableCuisines, selectedCuisine]);

  /** Categories from items in the active cuisine — not a hard-coded map alone */
  const availableCategories = useMemo(() => {
    if (!selectedCuisine) return [] as MenuCategory[];
    const set = new Set<MenuCategory>();
    menuItems.forEach((item) => {
      if (item.isAvailable && item.cuisine === selectedCuisine && item.category) {
        set.add(item.category);
      }
    });
    return Array.from(set).sort();
  }, [menuItems, selectedCuisine]);

  const filteredItems = useMemo(() => {
    return menuItems.filter((item: MenuItem) => {
      if (!item.isAvailable) return false;
      const matchesSearch =
        !searchTerm ||
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCuisine = !selectedCuisine || item.cuisine === selectedCuisine;
      const matchesCategory = selectedCategory === null || item.category === selectedCategory;
      const matchesDietary = !selectedDietary || item.dietaryInfo?.includes(selectedDietary);
      // When searching globally, show across cuisines
      if (searchTerm.trim()) {
        return matchesSearch && matchesDietary;
      }
      return matchesSearch && matchesCuisine && matchesCategory && matchesDietary;
    });
  }, [menuItems, searchTerm, selectedCuisine, selectedCategory, selectedDietary]);

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
            alignItems: 'center',
            marginBottom: 12,
            gap: 12,
          }}
        >
          <h3 style={posSectionTitle}>
            <RestaurantMenuIcon style={{ fontSize: 22, color: pos.role }} />
            Menu
          </h3>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: pos.muted,
              background: 'rgba(255,255,255,0.04)',
              padding: '6px 10px',
              borderRadius: 8,
              border: `1px solid ${pos.border}`,
            }}
          >
            {filteredItems.length} items
          </span>
        </div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <SearchIcon
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 18,
              color: pos.faint,
              pointerEvents: 'none',
            }}
          />
          <input
            type="search"
            placeholder="Search menu…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search menu items"
            style={{
              ...posField,
              paddingLeft: 40,
              borderRadius: 10,
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

        {/* Cuisine — only those returned on the store menu */}
        {!searchTerm.trim() && availableCuisines.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              paddingBottom: 8,
              marginBottom: 8,
              scrollbarWidth: 'thin',
            }}
          >
            {availableCuisines.map((cuisine) => {
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
                    ...chip,
                    flexDirection: 'column',
                    gap: 4,
                    minWidth: 72,
                    minHeight: 64,
                    ...(active
                      ? {
                          background: pos.role,
                          color: '#fff',
                          border: 'none',
                          boxShadow: `0 4px 12px ${pos.roleShadow}`,
                        }
                      : {
                          background: pos.surfaceElevated,
                          color: pos.muted,
                          border: `1px solid ${pos.border}`,
                        }),
                  }}
                >
                  {cuisineIcon(cuisine)}
                  <span style={{ fontSize: 10, fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }}>
                    {CUISINE_LABEL[cuisine] || formatCategoryLabel(cuisine)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!searchTerm.trim() && availableCategories.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 6,
              marginBottom: 6,
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              style={{
                ...chip,
                minHeight: 36,
                ...(selectedCategory === null
                  ? { background: pos.roleDark, color: '#fff', border: 'none' }
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
                  ...chip,
                  minHeight: 36,
                  ...(selectedCategory === category
                    ? { background: pos.roleDark, color: '#fff', border: 'none' }
                    : {
                        background: 'transparent',
                        color: pos.muted,
                        border: `1px solid ${pos.border}`,
                      }),
                }}
              >
                {formatCategoryLabel(category)}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(
            [
              { key: null, label: 'All diet' },
              { key: DietaryType.VEGETARIAN, label: 'Vegetarian' },
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
                  ...chip,
                  minHeight: 32,
                  padding: '4px 10px',
                  fontSize: 11,
                  ...(active
                    ? {
                        background:
                          key === DietaryType.NON_VEGETARIAN
                            ? pos.error
                            : key === DietaryType.VEGAN
                              ? pos.successDark
                              : key === DietaryType.VEGETARIAN
                                ? pos.success
                                : pos.role,
                        color: '#fff',
                        border: 'none',
                      }
                    : {
                        background: 'transparent',
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

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 12,
          minHeight: 0,
          background: pos.surfaceAlt,
        }}
      >
        {isLoading && (
          <div
            data-testid="menu-loading"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
              gap: 10,
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 168,
                  borderRadius: 12,
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
              padding: 24,
              borderRadius: 12,
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
              padding: 32,
              borderRadius: 12,
              border: `1px dashed ${pos.border}`,
              background: pos.surface,
              textAlign: 'center',
              color: pos.muted,
            }}
          >
            <RestaurantMenuIcon style={{ fontSize: 40, color: pos.faint, marginBottom: 10 }} />
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
              gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
              gap: 10,
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
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: flash ? `2px solid ${pos.success}` : `1px solid ${pos.border}`,
                    background: flash ? pos.successSoft : pos.surface,
                    minHeight: 176,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSheetItem(item)}
                    style={{
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      background: pos.surfaceElevated,
                      height: 96,
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
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
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
                          top: 6,
                          left: 6,
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '3px 6px',
                          borderRadius: 4,
                          background: pos.role,
                          color: '#fff',
                        }}
                      >
                        Rec
                      </span>
                    )}
                  </button>

                  <div
                    style={{
                      padding: 10,
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
                            fontWeight: 700,
                            padding: '2px 5px',
                            borderRadius: 4,
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
                            fontWeight: 700,
                            padding: '2px 5px',
                            borderRadius: 4,
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
                      <span style={{ fontSize: 15, fontWeight: 800, color: pos.ink }}>
                        {formatMoney(item.basePrice, currency, locale)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Add ${item.name}`}
                        onClick={() => flashAdd(item)}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 10,
                          border: 'none',
                          background: pos.role,
                          color: '#fff',
                          fontSize: 22,
                          fontWeight: 800,
                          cursor: 'pointer',
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
