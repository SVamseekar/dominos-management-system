import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/testUtils';
import OrderPanel from './OrderPanel';

const mockItems = [
  {
    menuItemId: 'item-1',
    name: 'Margherita Pizza',
    price: 12.99,
    quantity: 2,
    specialInstructions: '',
    image: '/images/pizza.jpg',
  },
  {
    menuItemId: 'item-2',
    name: 'Garlic Bread',
    price: 4.99,
    quantity: 1,
    specialInstructions: 'Extra crispy',
    image: '/images/bread.jpg',
  },
];

describe('OrderPanel', () => {
  const defaultProps = {
    items: mockItems,
    onUpdateQuantity: vi.fn(),
    onRemoveItem: vi.fn(),
    onUpdateInstructions: vi.fn(),
    onNewOrder: vi.fn(),
    orderType: 'PICKUP' as const,
    onOrderTypeChange: vi.fn(),
    selectedTable: null,
    onTableSelect: vi.fn(),
  };

  beforeEach(() => {
    defaultProps.onUpdateQuantity.mockClear();
    defaultProps.onRemoveItem.mockClear();
    defaultProps.onUpdateInstructions.mockClear();
    defaultProps.onNewOrder.mockClear();
    defaultProps.onOrderTypeChange.mockClear();
    defaultProps.onTableSelect.mockClear();
  });

  describe('rendering', () => {
    it('renders without crashing', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      expect(screen.getByTestId('order-panel')).toBeInTheDocument();
      expect(screen.getByText('Ticket')).toBeInTheDocument();
    });

    it('displays order items', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      expect(screen.getByText('Margherita Pizza')).toBeInTheDocument();
      expect(screen.getByText('Garlic Bread')).toBeInTheDocument();
    });

    it('displays item quantities', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      expect(screen.getByText('2')).toBeInTheDocument(); // Pizza quantity
      expect(screen.getByText('1')).toBeInTheDocument(); // Bread quantity
    });

    it('displays item prices', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      // Individual price per each
      expect(screen.getAllByText(/12\.99/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/4\.99/).length).toBeGreaterThan(0);
    });
  });

  describe('empty state', () => {
    it('shows empty message when no items in order', () => {
      renderWithProviders(<OrderPanel {...defaultProps} items={[]} />, {
        useMemoryRouter: true,
      });

      expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
      expect(screen.getByText(/Ticket is empty/i)).toBeInTheDocument();
    });

    it('does not show clear button when order is empty', () => {
      renderWithProviders(<OrderPanel {...defaultProps} items={[]} />, {
        useMemoryRouter: true,
      });

      expect(
        screen.queryByRole('button', { name: /Clear/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('order type selection', () => {
    it('renders Pickup and Delivery buttons', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      expect(screen.getByText('Pickup')).toBeInTheDocument();
      expect(screen.getByText('Delivery')).toBeInTheDocument();
    });

    it('calls onOrderTypeChange when Delivery is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      await user.click(screen.getByText('Delivery'));
      expect(defaultProps.onOrderTypeChange).toHaveBeenCalledWith('DELIVERY');
    });

    it('calls onOrderTypeChange when Pickup is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <OrderPanel {...defaultProps} orderType="DELIVERY" />,
        { useMemoryRouter: true }
      );

      await user.click(screen.getByText('Pickup'));
      expect(defaultProps.onOrderTypeChange).toHaveBeenCalledWith('PICKUP');
    });
  });

  describe('quantity management', () => {
    it('calls onUpdateQuantity with incremented value when + is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      // Get all + buttons
      const plusButtons = screen.getAllByText('+');
      await user.click(plusButtons[0]);

      expect(defaultProps.onUpdateQuantity).toHaveBeenCalledWith('item-1', 3);
    });

    it('calls onUpdateQuantity with decremented value when minus is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      // The minus button text is a special minus character
      const minusButtons = screen.getAllByText(/\u2212/);
      await user.click(minusButtons[0]);

      expect(defaultProps.onUpdateQuantity).toHaveBeenCalledWith('item-1', 1);
    });

    it('allows decreasing quantity even when quantity is 1 (removes line)', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      // Steppers stay enabled; quantity 0 path removes the line via parent
      const minusButtons = screen.getAllByLabelText('Decrease quantity');
      expect(minusButtons[1]).not.toBeDisabled();
    });
  });

  describe('remove items', () => {
    it('calls onRemoveItem when delete button is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      const removeButtons = screen
        .getAllByRole('button')
        .filter((button) => button.querySelector('[data-testid="DeleteOutlineIcon"]'));
      await user.click(removeButtons[0]);

      expect(defaultProps.onRemoveItem).toHaveBeenCalledWith('item-1');
    });
  });

  describe('special instructions', () => {
    it('renders special instructions inputs', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      const notes = screen.getAllByPlaceholderText('Note (optional)');
      expect(notes).toHaveLength(2);
    });

    it('displays existing special instructions', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      const notes = screen.getAllByPlaceholderText('Note (optional)');
      expect(notes[1]).toHaveValue('Extra crispy');
    });

    it('calls onUpdateInstructions when text is entered', async () => {
      const user = userEvent.setup();

      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      const notes = screen.getAllByPlaceholderText('Note (optional)');
      await user.type(notes[0], 'No onions');

      expect(defaultProps.onUpdateInstructions).toHaveBeenCalled();
    });
  });

  describe('order summary', () => {
    it('displays subtotal', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      expect(screen.getByTestId('cart-totals')).toBeInTheDocument();
      // i18n label may be Subtotal without colon
      expect(screen.getByText(/Subtotal/i)).toBeInTheDocument();
    });

    it('displays tax amount', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      // DE uses VAT label; match either GST or VAT
      expect(screen.getByText(/VAT|Tax|GST/i)).toBeInTheDocument();
    });

    it('displays total', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      // Exact label (avoid matching Subtotal)
      expect(screen.getByText('Total')).toBeInTheDocument();
    });

    it('shows delivery fee when order type is DELIVERY and cart fee is set', () => {
      renderWithProviders(
        <OrderPanel {...defaultProps} orderType="DELIVERY" />,
        {
          useMemoryRouter: true,
          preloadedState: {
            cart: {
              items: [],
              selectedStoreId: 'store-1',
              selectedStoreName: 'Store',
              totalItems: 0,
              deliveryFee: 2.9,
              storeCountryCode: 'DE',
            },
          },
        }
      );

      expect(screen.getByText(/Delivery fee/i)).toBeInTheDocument();
    });

    it('does not show delivery fee for PICKUP orders', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      expect(screen.queryByText(/Delivery fee/i)).not.toBeInTheDocument();
    });

    it('displays item count badge', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      // Header badge shows total qty (2+1=3)
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  describe('clear order', () => {
    it('shows clear button when items exist', () => {
      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      expect(
        screen.getByRole('button', { name: /Clear/i })
      ).toBeInTheDocument();
    });

    it('calls onNewOrder when clear button is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<OrderPanel {...defaultProps} />, {
        useMemoryRouter: true,
      });

      await user.click(screen.getByRole('button', { name: /Clear/i }));
      expect(defaultProps.onNewOrder).toHaveBeenCalledTimes(1);
    });
  });
});
