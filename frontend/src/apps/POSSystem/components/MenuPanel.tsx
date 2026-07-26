// src/apps/POSSystem/components/MenuPanel.tsx
/**
 * POS menu column — dark photo grid, cuisine chips, popular strip.
 * Large touch targets for landscape cashier floor.
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
import { pos, posTouchBtnBase } from '../posTokens';

interface MenuPanelProps {
  onAddItem: (item: MenuItem, quantity?: number) => void;
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

const chipBase: React.CSSProperties = {
  ...posTouchBtnBase,
  minHeight: 44,
  padding: '8px 14px',
  fontSize: pos.type.fontSize.xs,
  fontWeight: pos.type.fontWeight.semibold,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const MenuPanel: React.FC<MenuPanelProps> = ({ onAddItem }) => {
  const currency = useAppSelector(selectCartCurrency);
  const locale = useAppSelector(selectCartLocale);
  const selectedStoreId = useAppSelector(selectSelectedStoreId);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState<Cuisine>(Cuisine.SOUTH_INDIAN);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | null>(null);
  const [selectedDietary, setSelectedDietary] = useState<DietaryType | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const { data: menuItems = [], isLoading, error, refetch } = useGetAvailableMenuQuery(
    undefined,
    { refetchOnMountOrArgChange: true }
  );

  useEffect(() => {
    if (selectedStoreId) {
      void refetch();
    }
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
        .slice(0, 6),
    [menuItems, selectedCuisine]
  );

  const handleAdd = (item: MenuItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onAddItem(item);
    setJustAddedId(item.id);
    window.setTimeout(() => setJustAddedId((id) => (id === item.id ? null : id)), 280);
  };

  return (
    <div
      data-testid="menu-panel"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      {/* Sticky filter header */}
      <div
        style={{
          padding: pos.space[3],
          borderBottom: `1px solid ${pos.border}`,
          background: `linear-gradient(180deg, ${pos.surfaceElevated} 0%, ${pos.surface} 100%)`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: pos.space[2],
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
            <RestaurantMenuIcon style={{ fontSize: 22, color: pos.role }} />
            Menu
          </h3>
          <span
            style={{
              fontSize: pos.type.fontSize.xs,
              fontWeight: pos.type.fontWeight.semibold,
              background: pos.roleSoft,
              color: pos.role,
              padding: '4px 10px',
              borderRadius: pos.radius.full,
              border: `1px solid ${pos.roleBorder}`,
            }}
          >
            {filteredItems.length} items
          </span>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: pos.space[2] }}>
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
            placeholder="Search menu…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search menu items"
            style={{
              width: '100%',
              minHeight: pos.touchMin,
              padding: `12px 14px 12px 44px`,
              border: `1px solid ${pos.border}`,
              borderRadius: pos.radius.md,
              outline: 'none',
              backgroundColor: pos.surfaceAlt,
              fontSize: pos.type.fontSize.sm,
              color: pos.ink,
              fontFamily: pos.font,
              boxSizing: 'border-box',
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

        {/* Cuisine strip with icons */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 6,
            marginBottom: 6,
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
                  ...chipBase,
                  flexDirection: 'column',
                  gap: 4,
                  minWidth: 72,
                  minHeight: 64,
                  padding: '8px 10px',
                  ...(active
                    ? {
                        background: `linear-gradient(145deg, ${pos.role} 0%, ${pos.roleDark} 100%)`,
                        color: pos.inverse,
                        boxShadow: `0 4px 14px ${pos.roleShadow}`,
                        border: 'none',
                      }
                    : {
                        background: pos.surfaceElevated,
                        color: pos.muted,
                        border: `1px solid ${pos.border}`,
                      }),
                }}
              >
                {cuisineIcon(cuisine)}
                <span style={{ fontSize: 10, lineHeight: 1.15, textAlign: 'center' }}>
                  {CUISINE_LABEL[cuisine] || cuisine.replace(/_/g, ' ')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Category chips */}
        {availableCategories.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 4,
              marginBottom: 6,
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              style={{
                ...chipBase,
                minHeight: 36,
                ...(selectedCategory === null
                  ? { background: pos.roleDark, color: pos.inverse, border: 'none' }
                  : {
                      background: pos.surfaceAlt,
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
                  ...chipBase,
                  minHeight: 36,
                  ...(selectedCategory === category
                    ? { background: pos.roleDark, color: pos.inverse, border: 'none' }
                    : {
                        background: pos.surfaceAlt,
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

        {/* Dietary pills */}
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
                  ...chipBase,
                  minHeight: 32,
                  padding: '6px 12px',
                  fontSize: 11,
                  ...(active
                    ? {
                        background:
                          key === DietaryType.NON_VEGETARIAN
                            ? pos.error
                            : key === DietaryType.VEGAN
                              ? pos.successDark
                              : pos.success,
                        color: pos.inverse,
                        border: 'none',
                      }
                    : {
                        background: pos.surfaceAlt,
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

      {/* Popular strip — horizontal photo cards when available */}
      {!searchTerm && selectedCategory === null && popularItems.length > 0 && (
        <div
          style={{
            padding: `${pos.space[2]} ${pos.space[3]}`,
            backgroundColor: pos.roleSoft,
            borderBottom: `1px solid ${pos.roleBorder}`,
            flexShrink: 0,
          }}
        >
          <p
            style={{
              margin: `0 0 ${pos.space[2]} 0`,
              fontSize: 11,
              fontWeight: pos.type.fontWeight.bold,
              color: pos.role,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <LocalFireDepartmentIcon style={{ fontSize: 14 }} />
            Popular — tap to add
          </p>
          <div
            style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              paddingBottom: 4,
              scrollbarWidth: 'thin',
            }}
          >
            {popularItems.map((item: MenuItem) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleAdd(item)}
                style={{
                  ...posTouchBtnBase,
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  minWidth: 120,
                  maxWidth: 140,
                  minHeight: 48,
                  padding: 0,
                  overflow: 'hidden',
                  background: pos.surfaceElevated,
                  border: `1px solid ${pos.border}`,
                  borderRadius: pos.radius.md,
                  color: pos.ink,
                  boxShadow: pos.shadow.soft,
                }}
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    style={{
                      width: '100%',
                      height: 64,
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      height: 48,
                      background: `linear-gradient(135deg, ${pos.roleSoft}, ${pos.surfaceAlt})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      fontWeight: 800,
                      color: pos.role,
                    }}
                  >
                    {item.name.charAt(0)}
                  </div>
                )}
                <div style={{ padding: '8px 10px', textAlign: 'left' }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: pos.role, fontWeight: 700, marginTop: 2 }}>
                    {formatMoney(item.basePrice, currency, locale)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: pos.space[3],
          minHeight: 0,
          background: pos.surfaceBg,
        }}
      >
        {isLoading && (
          <div
            data-testid="menu-loading"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 12,
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 168,
                  borderRadius: pos.radius.md,
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
                50% { opacity: 0.45; }
              }
            `}</style>
          </div>
        )}

        {error && (
          <div
            data-testid="menu-error"
            style={{
              padding: pos.space[6],
              borderRadius: pos.radius.lg,
              border: `1px solid ${pos.error}`,
              background: pos.errorSoft,
              textAlign: 'center',
            }}
          >
            <p style={{ margin: `0 0 ${pos.space[3]} 0`, color: pos.ink, fontWeight: 600 }}>
              Couldn’t load menu
            </p>
            <p style={{ margin: `0 0 ${pos.space[4]} 0`, color: pos.muted, fontSize: 13 }}>
              Check network or store selection, then retry.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              style={{
                ...posTouchBtnBase,
                background: pos.role,
                color: pos.inverse,
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
              padding: pos.space[8],
              borderRadius: pos.radius.lg,
              border: `1px dashed ${pos.border}`,
              background: pos.surface,
              textAlign: 'center',
              color: pos.muted,
            }}
          >
            <RestaurantMenuIcon style={{ fontSize: 40, color: pos.faint, marginBottom: 12 }} />
            <div style={{ fontWeight: 600, color: pos.ink, marginBottom: 6 }}>
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
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 12,
            }}
          >
            {filteredItems.map((item: MenuItem) => {
              const flash = justAddedId === item.id;
              return (
                <div
                  key={item.id}
                  data-testid={`menu-item-${item.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleAdd(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleAdd(item);
                    }
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    textAlign: 'left',
                    minHeight: 168,
                    padding: 0,
                    overflow: 'hidden',
                    borderRadius: pos.radius.md,
                    border: flash ? `2px solid ${pos.success}` : `1px solid ${pos.border}`,
                    background: flash ? pos.successSoft : pos.surface,
                    cursor: 'pointer',
                    boxShadow: pos.shadow.raised.sm,
                    transition:
                      'transform 0.12s ease, border-color 0.12s ease, background 0.12s ease',
                    fontFamily: pos.font,
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = pos.role;
                    e.currentTarget.style.transform = 'scale(0.98)';
                    e.currentTarget.style.boxShadow = `0 8px 20px ${pos.roleShadow}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = flash ? pos.success : pos.border;
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = pos.shadow.raised.sm as string;
                  }}
                >
                  {/* Image / placeholder */}
                  <div
                    style={{
                      height: 88,
                      background: pos.surfaceAlt,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
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
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: `linear-gradient(145deg, ${pos.surfaceElevated}, ${pos.surfaceAlt})`,
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
                          top: 8,
                          left: 8,
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '3px 6px',
                          borderRadius: 6,
                          background: pos.role,
                          color: pos.inverse,
                          textTransform: 'uppercase',
                        }}
                      >
                        Hot
                      </span>
                    )}
                  </div>

                  <div style={{ padding: 10, display: 1, display: 'flex', flexDirection: 'column' }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: pos.ink,
                        lineHeight: 1.25,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        minHeight: '2.5em',
                        marginBottom: 6,
                      }}
                    >
                      {item.name}
                    </span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
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
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: pos.role,
                        }}
                      >
                        {formatMoney(item.basePrice, currency, locale)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Add ${item.name}`}
                        onClick={(e) => handleAdd(item, e)}
                        style={{
                          width: 48,
                          height: 48,
                          minWidth: 48,
                          minHeight: 48,
                          borderRadius: pos.radius.full,
                          background: `linear-gradient(135deg, ${pos.role} 0%, ${pos.roleDark} 100%)`,
                          color: pos.inverse,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: 22,
                          lineHeight: 1,
                          border: 'none',
                          cursor: 'pointer',
                          boxShadow: `0 4px 12px ${pos.roleShadow}`,
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
    </div>
  );
};

export default MenuPanel;
