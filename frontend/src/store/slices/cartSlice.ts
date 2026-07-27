import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category?: string;
  toppings?: string[];
  size?: string;
  imageUrl?: string;
  variant?: string;
  customizations?: string[];
}

interface CartState {
  items: CartItem[];
  total: number;
  itemCount: number;
  deliveryFee: number;
  isLoading: boolean;
  selectedStoreId: string | null;
  selectedStoreName: string | null;
  currency: string;   // ISO 4217 — default 'INR' for India stores
  locale: string;     // BCP 47 — default 'en-IN' for India stores
  storeCountryCode: string | null; // ISO 3166-1 alpha-2; null = India GST legacy
  /**
   * True only after setStoreCurrency from a store profile for the current selectedStoreId.
   * localStorage may restore currency, but POS/pay must re-hydrate from store API.
   */
  storeMarketSynced: boolean;
}

// Load cart from localStorage
const loadCartFromStorage = (): CartState => {
  try {
    const cartStr = localStorage.getItem('cart');
    if (cartStr) {
      const savedCart = JSON.parse(cartStr);
      return {
        items: savedCart.items || [],
        total: savedCart.total || 0,
        itemCount: savedCart.itemCount || 0,
        deliveryFee: 0, // Set dynamically when delivery address is entered
        isLoading: false,
        selectedStoreId: savedCart.selectedStoreId || null,
        selectedStoreName: savedCart.selectedStoreName || null,
        currency: savedCart.currency || 'INR',
        locale: savedCart.locale || 'en-IN',
        storeCountryCode: savedCart.storeCountryCode ?? null,
        // Always re-sync market from store API after reload (never trust stale cache alone)
        storeMarketSynced: false,
      };
    }
  } catch (e) {
    console.error('Failed to load cart from localStorage:', e);
  }
  return {
    items: [],
    total: 0,
    itemCount: 0,
    deliveryFee: 0,
    isLoading: false,
    selectedStoreId: null,
    selectedStoreName: null,
    currency: 'INR',
    locale: 'en-IN',
    storeCountryCode: null,
    storeMarketSynced: false,
  };
};

// Save cart to localStorage
const saveCartToStorage = (state: CartState) => {
  try {
    localStorage.setItem('cart', JSON.stringify({
      items: state.items,
      total: state.total,
      itemCount: state.itemCount,
      selectedStoreId: state.selectedStoreId,
      selectedStoreName: state.selectedStoreName,
      currency: state.currency,
      locale: state.locale,
      storeCountryCode: state.storeCountryCode,
    }));
  } catch (e) {
    console.error('Failed to save cart to localStorage:', e);
  }
};

const initialState: CartState = loadCartFromStorage();

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addToCart: (state, action: PayloadAction<Omit<CartItem, 'quantity'> & { quantity?: number }>) => {
      const { quantity = 1, ...item } = action.payload;
      const existingItem = state.items.find(i => i.id === item.id);

      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        state.items.push({ ...item, quantity });
      }

      cartSlice.caseReducers.calculateTotals(state);
      saveCartToStorage(state);
    },

    removeFromCart: (state, action: PayloadAction<string>) => {
      const itemId = action.payload;
      const existingItem = state.items.find(i => i.id === itemId);

      if (existingItem) {
        if (existingItem.quantity > 1) {
          existingItem.quantity -= 1;
        } else {
          state.items = state.items.filter(i => i.id !== itemId);
        }
      }

      cartSlice.caseReducers.calculateTotals(state);
      saveCartToStorage(state);
    },

    removeItemCompletely: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(i => i.id !== action.payload);
      cartSlice.caseReducers.calculateTotals(state);
      saveCartToStorage(state);
    },

    updateItemQuantity: (state, action: PayloadAction<{ id: string; quantity: number }>) => {
      const { id, quantity } = action.payload;
      const existingItem = state.items.find(i => i.id === id);

      if (existingItem) {
        if (quantity <= 0) {
          state.items = state.items.filter(i => i.id !== id);
        } else {
          existingItem.quantity = quantity;
        }
      }

      cartSlice.caseReducers.calculateTotals(state);
      saveCartToStorage(state);
    },

    clearCart: (state) => {
      state.items = [];
      state.total = 0;
      state.itemCount = 0;
      saveCartToStorage(state);
    },

    calculateTotals: (state) => {
      state.itemCount = state.items.reduce((total, item) => total + item.quantity, 0);
      const subtotal = state.items.reduce((total, item) => total + (item.price * item.quantity), 0);
      state.total = subtotal + (state.itemCount > 0 ? state.deliveryFee : 0);
    },

    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    setDeliveryFee: (state, action: PayloadAction<number>) => {
      state.deliveryFee = action.payload;
      cartSlice.caseReducers.calculateTotals(state);
    },

    setSelectedStore: (state, action: PayloadAction<{ storeId: string; storeName: string }>) => {
      if (state.selectedStoreId !== action.payload.storeId) {
        state.storeMarketSynced = false;
      }
      state.selectedStoreId = action.payload.storeId;
      state.selectedStoreName = action.payload.storeName;
      saveCartToStorage(state);
    },

    clearSelectedStore: (state) => {
      state.selectedStoreId = null;
      state.selectedStoreName = null;
      state.storeMarketSynced = false;
      saveCartToStorage(state);
    },

    setStoreCurrency: (state, action: PayloadAction<{ currency: string; locale: string; countryCode?: string | null }>) => {
      const nextCountry =
        action.payload.countryCode !== undefined ? action.payload.countryCode : state.storeCountryCode;
      const storeContextChanged =
        action.payload.currency !== state.currency || nextCountry !== state.storeCountryCode;

      if (storeContextChanged && state.items.length > 0) {
        state.items = [];
        state.total = 0;
        state.itemCount = 0;
        state.deliveryFee = 0;
      }

      state.currency = action.payload.currency;
      state.locale = action.payload.locale;
      if (action.payload.countryCode !== undefined) {
        state.storeCountryCode = action.payload.countryCode;
      }
      state.storeMarketSynced = true;
      saveCartToStorage(state);
    },
  },
});

export const {
  addToCart,
  removeFromCart,
  removeItemCompletely,
  updateItemQuantity,
  clearCart,
  calculateTotals,
  setLoading,
  setDeliveryFee,
  setSelectedStore,
  clearSelectedStore,
  setStoreCurrency,
} = cartSlice.actions;

// Selectors
export const selectCartItems = (state: { cart: CartState }) => state.cart.items;
export const selectCartTotal = (state: { cart: CartState }) => state.cart.total;
export const selectCartItemCount = (state: { cart: CartState }) => state.cart.itemCount;
export const selectCartSubtotal = (state: { cart: CartState }) =>
  state.cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
export const selectDeliveryFee = (state: { cart: CartState }) => state.cart.deliveryFee;
export const selectDeliveryFeeINR = (state: { cart: CartState }) => state.cart.deliveryFee;
export const selectCartCurrency = (state: { cart: CartState }) => state.cart.currency;
export const selectCartLocale = (state: { cart: CartState }) => state.cart.locale;
export const selectSelectedStoreId = (state: { cart: CartState }) => state.cart.selectedStoreId;
export const selectSelectedStoreName = (state: { cart: CartState }) => state.cart.selectedStoreName;
export const selectStoreCountryCode = (state: { cart: CartState }) => state.cart.storeCountryCode;
export const selectStoreMarketSynced = (state: { cart: CartState }) => state.cart.storeMarketSynced;

export default cartSlice.reducer;