import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/testUtils';
import { mockMenuItems } from '@/test/fixtures/mockMenu';
import type { MenuItem } from '@/store/api/menuApi';
import MenuPanel from './MenuPanel';

// ---------------------------------------------------------------------------
// Mock RTK Query hooks
// ---------------------------------------------------------------------------

let mockMenuData: MenuItem[] = [];
let mockIsLoading = false;
let mockError: unknown = null;
const mockRefetch = vi.fn();

vi.mock('../../../store/api/menuApi', async () => {
  const actual = await vi.importActual<typeof import('../../../store/api/menuApi')>('../../../store/api/menuApi');
  return {
    ...actual,
    useGetAvailableMenuQuery: () => ({
      data: mockMenuData,
      isLoading: mockIsLoading,
      error: mockError,
      refetch: mockRefetch,
    }),
  };
});

const defaultCartState = {
  cart: {
    items: [],
    selectedStoreId: 'store-1',
    selectedStoreName: 'Downtown Branch',
    totalItems: 0,
    currency: 'EUR',
    locale: 'de-DE',
    storeCountryCode: 'DE',
  },
};

describe('MenuPanel', () => {
  const mockOnAddItem = vi.fn();

  beforeEach(() => {
    mockOnAddItem.mockClear();
    mockRefetch.mockClear();
    mockMenuData = mockMenuItems;
    mockIsLoading = false;
    mockError = null;
  });

  describe('rendering', () => {
    it('renders without crashing', () => {
      renderWithProviders(<MenuPanel onAddItem={mockOnAddItem} />, {
        useMemoryRouter: true,
        preloadedState: defaultCartState,
      });

      expect(screen.getByText('Menu')).toBeInTheDocument();
    });

    it('displays the search input', () => {
      renderWithProviders(<MenuPanel onAddItem={mockOnAddItem} />, {
        useMemoryRouter: true,
        preloadedState: defaultCartState,
      });

      expect(screen.getByPlaceholderText('Search menu…')).toBeInTheDocument();
    });

    it('renders cuisine tabs from loaded menu only', () => {
      renderWithProviders(<MenuPanel onAddItem={mockOnAddItem} />, {
        useMemoryRouter: true,
        preloadedState: defaultCartState,
      });

      expect(screen.getByText('Italian')).toBeInTheDocument();
      expect(screen.getByText('American')).toBeInTheDocument();
      expect(screen.getByText('South Indian')).toBeInTheDocument();
    });

    it('renders dietary filter buttons', () => {
      renderWithProviders(<MenuPanel onAddItem={mockOnAddItem} />, {
        useMemoryRouter: true,
        preloadedState: defaultCartState,
      });

      expect(screen.getByRole('button', { name: 'All diet' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Vegetarian' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Vegan' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Non-veg' })).toBeInTheDocument();
    });

    it('shows item count badge', () => {
      renderWithProviders(<MenuPanel onAddItem={mockOnAddItem} />, {
        useMemoryRouter: true,
        preloadedState: defaultCartState,
      });

      expect(screen.getByText(/items$/)).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows loading spinner when menu is loading', () => {
      mockIsLoading = true;
      mockMenuData = [];

      const { container } = renderWithProviders(
        <MenuPanel onAddItem={mockOnAddItem} />,
        {
          useMemoryRouter: true,
          preloadedState: defaultCartState,
        }
      );

      const spinner = container.querySelector('[style*="animation"]');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message when menu fails to load', () => {
      mockError = { status: 500 };
      mockMenuData = [];

      renderWithProviders(<MenuPanel onAddItem={mockOnAddItem} />, {
        useMemoryRouter: true,
        preloadedState: defaultCartState,
      });

      expect(screen.getByTestId('menu-error')).toBeInTheDocument();
      expect(screen.getByText(/Couldn’t load menu/i)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty message when no items match filters', () => {
      mockMenuData = [];

      renderWithProviders(<MenuPanel onAddItem={mockOnAddItem} />, {
        useMemoryRouter: true,
        preloadedState: defaultCartState,
      });

      expect(screen.getByTestId('menu-empty')).toBeInTheDocument();
      expect(screen.getByText(/No items match/i)).toBeInTheDocument();
    });
  });

  describe('cuisine filtering', () => {
    it('defaults to first available cuisine by store menu priority (Italian when present)', () => {
      renderWithProviders(<MenuPanel onAddItem={mockOnAddItem} />, {
        useMemoryRouter: true,
        preloadedState: defaultCartState,
      });

      expect(screen.getAllByText('Margherita Pizza').length).toBeGreaterThan(0);
    });

    it('filters items when a different cuisine is selected', async () => {
      const user = userEvent.setup();

      renderWithProviders(<MenuPanel onAddItem={mockOnAddItem} />, {
        useMemoryRouter: true,
        preloadedState: defaultCartState,
      });

      await user.click(screen.getByText('South Indian'));

      expect(screen.getAllByText('Masala Dosa').length).toBeGreaterThan(0);
      expect(screen.queryByText('Margherita Pizza')).not.toBeInTheDocument();
    });
  });

  describe('search functionality', () => {
    it('filters items by search term', async () => {
      const user = userEvent.setup();

      renderWithProviders(<MenuPanel onAddItem={mockOnAddItem} />, {
        useMemoryRouter: true,
        preloadedState: defaultCartState,
      });

      const searchInput = screen.getByPlaceholderText('Search menu…');
      await user.type(searchInput, 'Margherita');

      expect(screen.getAllByText('Margherita Pizza').length).toBeGreaterThan(0);
    });

    it('shows no results message for non-matching search', async () => {
      const user = userEvent.setup();

      renderWithProviders(<MenuPanel onAddItem={mockOnAddItem} />, {
        useMemoryRouter: true,
        preloadedState: defaultCartState,
      });

      const searchInput = screen.getByPlaceholderText('Search menu…');
      await user.type(searchInput, 'xyznonexistent');

      expect(screen.getByText(/No matches/i)).toBeInTheDocument();
    });
  });

  describe('adding items', () => {
    it('calls onAddItem when add button on menu tile is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<MenuPanel onAddItem={mockOnAddItem} />, {
        useMemoryRouter: true,
        preloadedState: defaultCartState,
      });

      const tile = screen.getByTestId('menu-item-item-1');
      const addBtn = tile.querySelector('button[aria-label^="Add "]');
      expect(addBtn).toBeTruthy();
      await user.click(addBtn!);

      expect(mockOnAddItem).toHaveBeenCalledTimes(1);
    });
  });
});
