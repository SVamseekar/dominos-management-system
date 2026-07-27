package com.MaSoVa.commerce.order.service;

import com.MaSoVa.commerce.menu.repository.MenuItemRepository;
import com.MaSoVa.commerce.order.entity.DeliveryAddress;
import com.MaSoVa.commerce.order.entity.Order;
import com.MaSoVa.commerce.order.entity.OrderItem;
import com.MaSoVa.commerce.order.repository.OrderRepository;
import com.MaSoVa.shared.entity.MenuItem;
import com.MaSoVa.shared.enums.Cuisine;
import com.MaSoVa.shared.enums.MenuCategory;
import com.MaSoVa.shared.enums.OrderSource;
import com.MaSoVa.shared.enums.SpiceLevel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Dev/demo seed for commerce: menu bulk, multi-status orders (customerId=userId), equipment.
 * Active only when spring profiles include {@code dev} or {@code demo}.
 */
@Service
public class CommerceSeedService {

    private static final Logger log = LoggerFactory.getLogger(CommerceSeedService.class);

    private final MenuItemRepository menuItemRepository;
    private final OrderRepository orderRepository;
    private final KitchenEquipmentSeedService equipmentSeedService;
    private final Environment environment;

    public CommerceSeedService(MenuItemRepository menuItemRepository,
                               OrderRepository orderRepository,
                               KitchenEquipmentSeedService equipmentSeedService,
                               Environment environment) {
        this.menuItemRepository = menuItemRepository;
        this.orderRepository = orderRepository;
        this.equipmentSeedService = equipmentSeedService;
        this.environment = environment;
    }

    public boolean isSeedAllowed() {
        return environment.acceptsProfiles(Profiles.of("dev", "demo"));
    }

    /**
     * Seed menu + multi-status orders + kitchen equipment.
     *
     * @param storeId    store code (DOM001)
     * @param customerId JWT userId (sub) — ownership invariant for customer order APIs
     * @param driverId   optional driver userId for OFD/DELIVERED seed orders
     */
    public Map<String, Object> seedDemo(String storeId, String customerId, String driverId) {
        if (!isSeedAllowed()) {
            throw new IllegalStateException("Commerce seed is only available under dev/demo profiles");
        }
        if (storeId == null || storeId.isBlank()) {
            throw new IllegalArgumentException("storeId is required");
        }
        String cid = (customerId == null || customerId.isBlank()) ? "seed-customer-user" : customerId;

        Map<String, Object> menu = seedMenu(storeId);
        Map<String, Object> orders = seedOrders(storeId, cid, driverId);
        Map<String, Object> equipment = equipmentSeedService.seedDemo(storeId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("storeId", storeId);
        result.put("customerId", cid);
        result.put("menu", menu);
        result.put("orders", orders);
        result.put("equipment", equipment);
        result.put("message", "Commerce seed complete (idempotent; order.customerId = userId)");
        log.info("Commerce seed-demo storeId={} menu={} orders={}",
                storeId, menu.get("totalForStore"), orders.get("totalSeedOrders"));
        return result;
    }

    /** Back-compat overload. */
    public Map<String, Object> seedDemo(String storeId, String customerId) {
        return seedDemo(storeId, customerId, null);
    }

    public Map<String, Object> seedMenuOnly(String storeId) {
        if (!isSeedAllowed()) {
            throw new IllegalStateException("Commerce seed is only available under dev/demo profiles");
        }
        return seedMenu(storeId);
    }

    public Map<String, Object> seedOrdersOnly(String storeId, String customerId) {
        if (!isSeedAllowed()) {
            throw new IllegalStateException("Commerce seed is only available under dev/demo profiles");
        }
        String cid = (customerId == null || customerId.isBlank()) ? "seed-customer-user" : customerId;
        return seedOrders(storeId, cid, null);
    }

    private Map<String, Object> seedMenu(String storeId) {
        List<MenuSpec> specs = fullMenuCatalog();

        List<MenuItem> existing = menuItemRepository.findByStoreId(storeId);
        List<String> createdIds = new ArrayList<>();
        List<String> updatedIds = new ArrayList<>();
        int skipped = 0;
        int order = 1;
        for (MenuSpec spec : specs) {
            Optional<MenuItem> match = existing.stream()
                    .filter(m -> spec.name().equalsIgnoreCase(m.getName()))
                    .findFirst();
            if (match.isPresent()) {
                MenuItem item = match.get();
                boolean dirty = false;
                if (spec.imageUrl() != null && !spec.imageUrl().equals(item.getImageUrl())) {
                    item.setImageUrl(spec.imageUrl());
                    dirty = true;
                }
                if (spec.description() != null && !spec.description().equals(item.getDescription())) {
                    item.setDescription(spec.description());
                    dirty = true;
                }
                if (item.getIsRecommended() == null
                        || !Boolean.valueOf(spec.recommended()).equals(item.getIsRecommended())) {
                    item.setIsRecommended(spec.recommended());
                    dirty = true;
                }
                item.setDisplayOrder(order++);
                if (dirty) {
                    item.setUpdatedAt(LocalDateTime.now());
                    MenuItem saved = menuItemRepository.save(item);
                    updatedIds.add(saved.getId());
                } else {
                    skipped++;
                }
                continue;
            }
            MenuItem item = new MenuItem(spec.name(), spec.cuisine(), spec.category(), spec.priceCents());
            item.setStoreId(storeId);
            item.setDescription(spec.description());
            item.setImageUrl(spec.imageUrl());
            item.setIsAvailable(true);
            item.setIsRecommended(spec.recommended());
            item.setPreparationTime(18);
            item.setServingSize("1 portion");
            item.setSpiceLevel(SpiceLevel.MILD);
            item.setDisplayOrder(order++);
            item.setAllergensDeclared(true);
            item.setCreatedAt(LocalDateTime.now());
            item.setUpdatedAt(LocalDateTime.now());
            MenuItem saved = menuItemRepository.save(item);
            createdIds.add(saved.getId());
        }

        int total = menuItemRepository.findByStoreId(storeId).size();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("createdIds", createdIds);
        out.put("createdCount", createdIds.size());
        out.put("updatedIds", updatedIds);
        out.put("updatedCount", updatedIds.size());
        out.put("skipped", skipped);
        out.put("catalogSize", specs.size());
        out.put("totalForStore", total);
        return out;
    }

    /** Full multi-cuisine demo menu (102 items, incl. European expansion) with elegant dish photos. */
    private static List<MenuSpec> fullMenuCatalog() {
        return List.of(
                new MenuSpec("Masala Dosa", "Crispy fermented crepe with spiced potato filling",
                        Cuisine.SOUTH_INDIAN, MenuCategory.DOSA, 890L, true,
                        "/images/menu/masala-dosa.jpg"),
                new MenuSpec("Plain Dosa", "Golden crisp plain dosa with coconut chutney",
                        Cuisine.SOUTH_INDIAN, MenuCategory.DOSA, 690L, false,
                        "/images/menu/plain-dosa.jpg"),
                new MenuSpec("Mysore Masala Dosa", "Red chutney layered dosa with potato masala",
                        Cuisine.SOUTH_INDIAN, MenuCategory.DOSA, 990L, true,
                        "/images/menu/mysore-masala-dosa.jpg"),
                new MenuSpec("Rava Dosa", "Lacy semolina dosa with onions and chillies",
                        Cuisine.SOUTH_INDIAN, MenuCategory.DOSA, 950L, false,
                        "/images/menu/rava-dosa.jpg"),
                new MenuSpec("Idly Sambar", "Steamed rice cakes with lentil sambar",
                        Cuisine.SOUTH_INDIAN, MenuCategory.IDLY_VADA, 590L, true,
                        "/images/menu/idly-sambar.jpg"),
                new MenuSpec("Medu Vada", "Crispy lentil doughnut with chutney",
                        Cuisine.SOUTH_INDIAN, MenuCategory.IDLY_VADA, 550L, false,
                        "/images/menu/medu-vada.jpg"),
                new MenuSpec("Idly Vada Combo", "Two idlies and one vada with sambar",
                        Cuisine.SOUTH_INDIAN, MenuCategory.IDLY_VADA, 790L, false,
                        "/images/menu/idly-vada-combo.jpg"),
                new MenuSpec("South Indian Thali", "Complete meal with rice, sambar, rasam, and sides",
                        Cuisine.SOUTH_INDIAN, MenuCategory.SOUTH_INDIAN_MEALS, 1490L, true,
                        "/images/menu/south-indian-thali.jpg"),
                new MenuSpec("Lemon Rice Meal", "Tangy lemon rice with papad and pickle",
                        Cuisine.SOUTH_INDIAN, MenuCategory.SOUTH_INDIAN_MEALS, 890L, false,
                        "/images/menu/lemon-rice-meal.jpg"),
                new MenuSpec("Curd Rice", "Cooling yogurt rice with tempering",
                        Cuisine.SOUTH_INDIAN, MenuCategory.SOUTH_INDIAN_MEALS, 690L, false,
                        "/images/menu/curd-rice.jpg"),
                new MenuSpec("Paneer Butter Masala", "Cottage cheese in rich tomato-butter gravy",
                        Cuisine.NORTH_INDIAN, MenuCategory.CURRY_GRAVY, 1290L, true,
                        "/images/menu/paneer-butter-masala.jpg"),
                new MenuSpec("Butter Chicken", "Tandoori chicken in creamy tomato makhani sauce",
                        Cuisine.NORTH_INDIAN, MenuCategory.CURRY_GRAVY, 1490L, true,
                        "/images/menu/butter-chicken.jpg"),
                new MenuSpec("Palak Paneer", "Spinach gravy with soft paneer cubes",
                        Cuisine.NORTH_INDIAN, MenuCategory.CURRY_GRAVY, 1190L, false,
                        "/images/menu/palak-paneer.jpg"),
                new MenuSpec("Chicken Tikka Masala", "Grilled chicken tikka in spiced tomato cream",
                        Cuisine.NORTH_INDIAN, MenuCategory.CURRY_GRAVY, 1450L, true,
                        "/images/menu/chicken-tikka-masala.jpg"),
                new MenuSpec("Dal Tadka", "Yellow lentils finished with ghee tempering",
                        Cuisine.NORTH_INDIAN, MenuCategory.DAL_DISHES, 790L, false,
                        "/images/menu/dal-tadka.jpg"),
                new MenuSpec("Dal Makhani", "Slow-cooked black lentils with cream and butter",
                        Cuisine.NORTH_INDIAN, MenuCategory.DAL_DISHES, 990L, true,
                        "/images/menu/dal-makhani.jpg"),
                new MenuSpec("Chana Masala", "Chickpeas in tangy onion-tomato masala",
                        Cuisine.NORTH_INDIAN, MenuCategory.DAL_DISHES, 850L, false,
                        "/images/menu/chana-masala.jpg"),
                new MenuSpec("North Indian Thali", "Curry, dal, rice, roti, raita and dessert",
                        Cuisine.NORTH_INDIAN, MenuCategory.NORTH_INDIAN_MEALS, 1690L, true,
                        "/images/menu/north-indian-thali.jpg"),
                new MenuSpec("Veg Biryani Plate", "Fragrant vegetable biryani with raita",
                        Cuisine.NORTH_INDIAN, MenuCategory.NORTH_INDIAN_MEALS, 1290L, false,
                        "/images/menu/veg-biryani-plate.jpg"),
                new MenuSpec("Chicken Biryani Plate", "Hyderabadi-style chicken biryani with salan",
                        Cuisine.NORTH_INDIAN, MenuCategory.NORTH_INDIAN_MEALS, 1590L, true,
                        "/images/menu/chicken-biryani-plate.jpg"),
                new MenuSpec("Veg Fried Rice", "Wok-tossed rice with mixed vegetables",
                        Cuisine.INDO_CHINESE, MenuCategory.FRIED_RICE, 890L, false,
                        "/images/menu/veg-fried-rice.jpg"),
                new MenuSpec("Chicken Fried Rice", "Classic Indo-Chinese chicken fried rice",
                        Cuisine.INDO_CHINESE, MenuCategory.FRIED_RICE, 1090L, true,
                        "/images/menu/chicken-fried-rice.jpg"),
                new MenuSpec("Egg Fried Rice", "Fluffy rice with scrambled egg and spring onion",
                        Cuisine.INDO_CHINESE, MenuCategory.FRIED_RICE, 950L, false,
                        "/images/menu/egg-fried-rice.jpg"),
                new MenuSpec("Veg Hakka Noodles", "Stir-fried noodles with crunchy vegetables",
                        Cuisine.INDO_CHINESE, MenuCategory.NOODLES, 890L, false,
                        "/images/menu/veg-hakka-noodles.jpg"),
                new MenuSpec("Chicken Hakka Noodles", "Indo-Chinese chicken hakka noodles",
                        Cuisine.INDO_CHINESE, MenuCategory.NOODLES, 1090L, true,
                        "/images/menu/chicken-hakka-noodles.jpg"),
                new MenuSpec("Schezwan Noodles", "Spicy schezwan sauce noodles",
                        Cuisine.INDO_CHINESE, MenuCategory.NOODLES, 990L, false,
                        "/images/menu/schezwan-noodles.jpg"),
                new MenuSpec("Gobi Manchurian", "Crispy cauliflower in tangy manchurian sauce",
                        Cuisine.INDO_CHINESE, MenuCategory.MANCHURIAN, 990L, true,
                        "/images/menu/gobi-manchurian.jpg"),
                new MenuSpec("Chicken Manchurian", "Juicy chicken balls in manchurian gravy",
                        Cuisine.INDO_CHINESE, MenuCategory.MANCHURIAN, 1190L, true,
                        "/images/menu/chicken-manchurian.jpg"),
                new MenuSpec("Veg Manchurian", "Vegetable dumplings in spicy gravy",
                        Cuisine.INDO_CHINESE, MenuCategory.MANCHURIAN, 950L, false,
                        "/images/menu/veg-manchurian.jpg"),
                new MenuSpec("Jeera Rice", "Basmati rice tempered with cumin",
                        Cuisine.NORTH_INDIAN, MenuCategory.RICE_VARIETIES, 490L, false,
                        "/images/menu/jeera-rice.jpg"),
                new MenuSpec("Steamed Basmati", "Fragrant long-grain steamed basmati",
                        Cuisine.NORTH_INDIAN, MenuCategory.RICE_VARIETIES, 390L, false,
                        "/images/menu/steamed-basmati.jpg"),
                new MenuSpec("Coconut Rice", "South Indian coconut-flavoured rice",
                        Cuisine.SOUTH_INDIAN, MenuCategory.RICE_VARIETIES, 590L, false,
                        "/images/menu/coconut-rice.jpg"),
                new MenuSpec("Butter Roti", "Soft whole-wheat roti brushed with butter",
                        Cuisine.NORTH_INDIAN, MenuCategory.CHAPATI_ROTI, 290L, false,
                        "/images/menu/butter-roti.jpg"),
                new MenuSpec("Tandoori Roti", "Clay-oven whole wheat roti",
                        Cuisine.NORTH_INDIAN, MenuCategory.CHAPATI_ROTI, 320L, false,
                        "/images/menu/tandoori-roti.jpg"),
                new MenuSpec("Missi Roti", "Spiced gram-flour flatbread",
                        Cuisine.NORTH_INDIAN, MenuCategory.CHAPATI_ROTI, 350L, false,
                        "/images/menu/missi-roti.jpg"),
                new MenuSpec("Butter Naan", "Soft tandoor naan with melted butter",
                        Cuisine.NORTH_INDIAN, MenuCategory.NAAN_KULCHA, 450L, true,
                        "/images/menu/butter-naan.jpg"),
                new MenuSpec("Garlic Naan", "Naan topped with garlic and coriander",
                        Cuisine.NORTH_INDIAN, MenuCategory.NAAN_KULCHA, 490L, true,
                        "/images/menu/garlic-naan.jpg"),
                new MenuSpec("Cheese Naan", "Stuffed naan with molten cheese",
                        Cuisine.NORTH_INDIAN, MenuCategory.NAAN_KULCHA, 590L, false,
                        "/images/menu/cheese-naan.jpg"),
                new MenuSpec("Margherita Pizza", "Classic tomato, mozzarella and basil",
                        Cuisine.ITALIAN, MenuCategory.PIZZA, 1290L, true,
                        "/images/menu/margherita-pizza.jpg"),
                new MenuSpec("Pepperoni Pizza", "Pepperoni and melted mozzarella",
                        Cuisine.ITALIAN, MenuCategory.PIZZA, 1490L, true,
                        "/images/menu/pepperoni-pizza.jpg"),
                new MenuSpec("Quattro Formaggi", "Four-cheese Italian pizza",
                        Cuisine.ITALIAN, MenuCategory.PIZZA, 1590L, true,
                        "/images/menu/quattro-formaggi.jpg"),
                new MenuSpec("Veggie Supreme Pizza", "Bell peppers, olives, onion and mushrooms",
                        Cuisine.ITALIAN, MenuCategory.PIZZA, 1450L, false,
                        "/images/menu/veggie-supreme-pizza.jpg"),
                new MenuSpec("BBQ Burger", "Beef burger with smoky BBQ sauce",
                        Cuisine.AMERICAN, MenuCategory.BURGER, 1190L, true,
                        "/images/menu/bbq-burger.jpg"),
                new MenuSpec("Classic Cheeseburger", "Juicy beef patty with cheddar",
                        Cuisine.AMERICAN, MenuCategory.BURGER, 1090L, true,
                        "/images/menu/classic-cheeseburger.jpg"),
                new MenuSpec("Crispy Chicken Burger", "Crispy fried chicken with mayo",
                        Cuisine.AMERICAN, MenuCategory.BURGER, 1150L, false,
                        "/images/menu/crispy-chicken-burger.jpg"),
                new MenuSpec("Veggie Burger", "Grilled vegetable patty with greens",
                        Cuisine.AMERICAN, MenuCategory.BURGER, 990L, false,
                        "/images/menu/veggie-burger.jpg"),
                new MenuSpec("Garlic Bread", "Toasted garlic bread with herbs",
                        Cuisine.ITALIAN, MenuCategory.SIDES, 490L, false,
                        "/images/menu/garlic-bread.jpg"),
                new MenuSpec("French Fries", "Crispy golden fries with sea salt",
                        Cuisine.AMERICAN, MenuCategory.SIDES, 390L, false,
                        "/images/menu/french-fries.jpg"),
                new MenuSpec("Caesar Salad", "Romaine, parmesan and croutons",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 790L, false,
                        "/images/menu/caesar-salad.jpg"),
                new MenuSpec("Onion Rings", "Crispy battered onion rings",
                        Cuisine.AMERICAN, MenuCategory.SIDES, 450L, false,
                        "/images/menu/onion-rings.jpg"),
                new MenuSpec("Espresso", "Double shot of rich espresso",
                        Cuisine.BEVERAGES, MenuCategory.HOT_DRINKS, 290L, false,
                        "/images/menu/espresso.jpg"),
                new MenuSpec("Cappuccino", "Espresso with steamed milk foam",
                        Cuisine.BEVERAGES, MenuCategory.HOT_DRINKS, 390L, true,
                        "/images/menu/cappuccino.jpg"),
                new MenuSpec("Hot Chocolate", "Velvety dark hot chocolate",
                        Cuisine.BEVERAGES, MenuCategory.HOT_DRINKS, 420L, false,
                        "/images/menu/hot-chocolate.jpg"),
                new MenuSpec("Cola", "Chilled soft drink 0.33L",
                        Cuisine.BEVERAGES, MenuCategory.COLD_DRINKS, 250L, false,
                        "/images/menu/cola.jpg"),
                new MenuSpec("Fresh Lemonade", "Freshly squeezed lemonade with mint",
                        Cuisine.BEVERAGES, MenuCategory.COLD_DRINKS, 350L, false,
                        "/images/menu/fresh-lemonade.jpg"),
                new MenuSpec("Mango Lassi", "Sweet mango yogurt smoothie",
                        Cuisine.BEVERAGES, MenuCategory.COLD_DRINKS, 450L, true,
                        "/images/menu/mango-lassi.jpg"),
                new MenuSpec("Cold Coffee", "Iced coffee blended with cream",
                        Cuisine.BEVERAGES, MenuCategory.COLD_DRINKS, 420L, false,
                        "/images/menu/cold-coffee.jpg"),
                new MenuSpec("Masala Chai", "Traditional Indian spiced tea",
                        Cuisine.BEVERAGES, MenuCategory.TEA_CHAI, 250L, true,
                        "/images/menu/masala-chai.jpg"),
                new MenuSpec("Ginger Tea", "Hot tea infused with fresh ginger",
                        Cuisine.BEVERAGES, MenuCategory.TEA_CHAI, 280L, false,
                        "/images/menu/ginger-tea.jpg"),
                new MenuSpec("Green Tea", "Light aromatic green tea",
                        Cuisine.BEVERAGES, MenuCategory.TEA_CHAI, 290L, false,
                        "/images/menu/green-tea.jpg"),
                new MenuSpec("Chocolate Brownie", "Warm fudgy chocolate brownie",
                        Cuisine.DESSERTS, MenuCategory.COOKIES_BROWNIES, 550L, true,
                        "/images/menu/chocolate-brownie.jpg"),
                new MenuSpec("Chocolate Chip Cookie", "Freshly baked chocolate chip cookie",
                        Cuisine.DESSERTS, MenuCategory.COOKIES_BROWNIES, 350L, false,
                        "/images/menu/chocolate-chip-cookie.jpg"),
                new MenuSpec("Walnut Brownie", "Dense brownie studded with walnuts",
                        Cuisine.DESSERTS, MenuCategory.COOKIES_BROWNIES, 590L, false,
                        "/images/menu/walnut-brownie.jpg"),
                new MenuSpec("Vanilla Ice Cream", "Classic Madagascar vanilla scoop",
                        Cuisine.DESSERTS, MenuCategory.ICE_CREAM, 390L, false,
                        "/images/menu/vanilla-ice-cream.jpg"),
                new MenuSpec("Chocolate Ice Cream", "Rich dark chocolate ice cream",
                        Cuisine.DESSERTS, MenuCategory.ICE_CREAM, 420L, false,
                        "/images/menu/chocolate-ice-cream.jpg"),
                new MenuSpec("Mango Ice Cream", "Creamy Alphonso mango ice cream",
                        Cuisine.DESSERTS, MenuCategory.ICE_CREAM, 450L, true,
                        "/images/menu/mango-ice-cream.jpg"),
                new MenuSpec("Tiramisu", "Coffee mascarpone Italian dessert",
                        Cuisine.ITALIAN, MenuCategory.DESSERT_SPECIALS, 650L, true,
                        "/images/menu/tiramisu.jpg"),
                new MenuSpec("Gulab Jamun", "Milk dumplings in rose sugar syrup",
                        Cuisine.DESSERTS, MenuCategory.DESSERT_SPECIALS, 450L, true,
                        "/images/menu/gulab-jamun.jpg"),
                new MenuSpec("Rasmalai", "Soft cheese patties in saffron milk",
                        Cuisine.DESSERTS, MenuCategory.DESSERT_SPECIALS, 550L, false,
                        "/images/menu/rasmalai.jpg"),
                new MenuSpec("New York Cheesecake", "Creamy baked cheesecake with berry glaze",
                        Cuisine.DESSERTS, MenuCategory.DESSERT_SPECIALS, 690L, true,
                        "/images/menu/cheesecake.jpg"),
                new MenuSpec("Creamy Mushroom Pasta", "Fettuccine in silky mushroom cream sauce",
                        Cuisine.ITALIAN, MenuCategory.SIDES, 1190L, true,
                        "/images/menu/creamy-mushroom-pasta.jpg"),
                new MenuSpec("Grilled Beef Steak", "Char-grilled steak with roasted tomatoes",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 1890L, true,
                        "/images/menu/grilled-beef-steak.jpg"),
                // European expansion
                new MenuSpec("Spaghetti Carbonara", "Classic Roman pasta with egg, pecorino and guanciale",
                        Cuisine.ITALIAN, MenuCategory.SIDES, 1390L, true,
                        "/images/menu/spaghetti-carbonara.jpg"),
                new MenuSpec("Lasagna Bolognese", "Layered pasta with rich beef ragu and bechamel",
                        Cuisine.ITALIAN, MenuCategory.SIDES, 1490L, true,
                        "/images/menu/lasagna-bolognese.jpg"),
                new MenuSpec("Mushroom Risotto", "Creamy Arborio risotto with wild mushrooms",
                        Cuisine.ITALIAN, MenuCategory.SIDES, 1350L, true,
                        "/images/menu/mushroom-risotto.jpg"),
                new MenuSpec("Chicken Parmesan", "Breaded chicken with tomato sauce and melted mozzarella",
                        Cuisine.ITALIAN, MenuCategory.SIDES, 1550L, true,
                        "/images/menu/chicken-parmesan.jpg"),
                new MenuSpec("Bruschetta", "Toasted bread with tomato, basil and olive oil",
                        Cuisine.ITALIAN, MenuCategory.SIDES, 690L, false,
                        "/images/menu/bruschetta.jpg"),
                new MenuSpec("Gnocchi Pesto", "Potato gnocchi tossed in basil pesto",
                        Cuisine.ITALIAN, MenuCategory.SIDES, 1290L, false,
                        "/images/menu/gnocchi-pesto.jpg"),
                new MenuSpec("Caprese Salad", "Fresh mozzarella, tomato and basil with balsamic",
                        Cuisine.ITALIAN, MenuCategory.SIDES, 890L, false,
                        "/images/menu/caprese-salad.jpg"),
                new MenuSpec("Panna Cotta", "Silky vanilla cream with berry coulis",
                        Cuisine.ITALIAN, MenuCategory.DESSERT_SPECIALS, 650L, true,
                        "/images/menu/panna-cotta.jpg"),
                new MenuSpec("Wiener Schnitzel", "Golden breaded veal cutlet with lemon",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 1790L, true,
                        "/images/menu/wiener-schnitzel.jpg"),
                new MenuSpec("Bratwurst Platter", "Grilled German sausages with mustard",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 1290L, true,
                        "/images/menu/bratwurst-platter.jpg"),
                new MenuSpec("Currywurst", "Berlin-style curry sausage with fries",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 990L, true,
                        "/images/menu/currywurst.jpg"),
                new MenuSpec("Soft Pretzel", "Warm Bavarian pretzel with coarse salt",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 450L, false,
                        "/images/menu/soft-pretzel.jpg"),
                new MenuSpec("German Potato Salad", "Warm potato salad with bacon and vinegar",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 690L, false,
                        "/images/menu/german-potato-salad.jpg"),
                new MenuSpec("Kaesespaetzle", "Soft egg noodles baked with melted cheese",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 1190L, false,
                        "/images/menu/spaetzle.jpg"),
                new MenuSpec("Apple Strudel", "Flaky pastry with spiced apples and raisins",
                        Cuisine.CONTINENTAL, MenuCategory.DESSERT_SPECIALS, 690L, true,
                        "/images/menu/apple-strudel.jpg"),
                new MenuSpec("Fish and Chips", "Beer-battered cod with thick-cut chips",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 1490L, true,
                        "/images/menu/fish-and-chips.jpg"),
                new MenuSpec("Shepherd's Pie", "Lamb mince topped with golden mashed potato",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 1390L, false,
                        "/images/menu/shepherds-pie.jpg"),
                new MenuSpec("French Onion Soup", "Caramelised onion broth with gruyere crouton",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 890L, true,
                        "/images/menu/french-onion-soup.jpg"),
                new MenuSpec("Quiche Lorraine", "Savoury tart with bacon, egg and cream",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 1090L, false,
                        "/images/menu/quiche-lorraine.jpg"),
                new MenuSpec("Ratatouille", "Provencal stewed vegetables with herbs",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 1190L, false,
                        "/images/menu/ratatouille.jpg"),
                new MenuSpec("Croque Monsieur", "Toasted ham and cheese sandwich with bechamel",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 990L, false,
                        "/images/menu/croque-monsieur.jpg"),
                new MenuSpec("Beef Bourguignon", "Slow-braised beef in red wine sauce",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 1890L, true,
                        "/images/menu/beef-bourguignon.jpg"),
                new MenuSpec("Creme Brulee", "Vanilla custard with caramelised sugar crust",
                        Cuisine.CONTINENTAL, MenuCategory.DESSERT_SPECIALS, 750L, true,
                        "/images/menu/creme-brulee.jpg"),
                new MenuSpec("Seafood Paella", "Spanish saffron rice with seafood",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 1790L, true,
                        "/images/menu/paella.jpg"),
                new MenuSpec("Spanish Tortilla", "Classic potato and egg omelette",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 890L, false,
                        "/images/menu/spanish-tortilla.jpg"),
                new MenuSpec("Patatas Bravas", "Crispy potatoes with spicy tomato sauce",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 690L, false,
                        "/images/menu/patatas-bravas.jpg"),
                new MenuSpec("Moussaka", "Layered aubergine, mince and bechamel",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 1490L, true,
                        "/images/menu/moussaka.jpg"),
                new MenuSpec("Greek Salad", "Tomato, cucumber, feta, olives and oregano",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 890L, false,
                        "/images/menu/greek-salad.jpg"),
                new MenuSpec("Chicken Souvlaki", "Grilled chicken skewers with tzatziki and pita",
                        Cuisine.CONTINENTAL, MenuCategory.SIDES, 1390L, true,
                        "/images/menu/souvlaki-plate.jpg"),
                new MenuSpec("Baklava", "Honey-soaked filo pastry with nuts",
                        Cuisine.DESSERTS, MenuCategory.DESSERT_SPECIALS, 650L, true,
                        "/images/menu/baklava.jpg")
        );
    }

    private Map<String, Object> seedOrders(String storeId, String customerUserId, String driverId) {
        // Fixed order numbers for idempotent upsert
        List<OrderSpec> specs = List.of(
                new OrderSpec("SEED-ORD-RECV-1", Order.OrderStatus.RECEIVED, Order.OrderType.DELIVERY, false),
                new OrderSpec("SEED-ORD-PREP-1", Order.OrderStatus.PREPARING, Order.OrderType.DELIVERY, false),
                new OrderSpec("SEED-ORD-OVEN-1", Order.OrderStatus.OVEN, Order.OrderType.TAKEAWAY, false),
                new OrderSpec("SEED-ORD-READY-1", Order.OrderStatus.READY, Order.OrderType.TAKEAWAY, false),
                new OrderSpec("SEED-ORD-DISP-1", Order.OrderStatus.DISPATCHED, Order.OrderType.DELIVERY, false),
                new OrderSpec("SEED-ORD-OFD-1", Order.OrderStatus.OUT_FOR_DELIVERY, Order.OrderType.DELIVERY, false),
                new OrderSpec("SEED-ORD-DLVR-1", Order.OrderStatus.DELIVERED, Order.OrderType.DELIVERY, true),
                new OrderSpec("SEED-ORD-DLVR-2", Order.OrderStatus.DELIVERED, Order.OrderType.DELIVERY, true),
                new OrderSpec("SEED-ORD-COMP-1", Order.OrderStatus.COMPLETED, Order.OrderType.TAKEAWAY, true),
                new OrderSpec("SEED-ORD-CANC-1", Order.OrderStatus.CANCELLED, Order.OrderType.DELIVERY, false)
        );

        List<MenuItem> menu = menuItemRepository.findByStoreId(storeId);
        String menuItemId = menu.isEmpty() ? "seed-menu-placeholder" : menu.get(0).getId();
        String menuName = menu.isEmpty() ? "Margherita Pizza" : menu.get(0).getName();
        double price = menu.isEmpty() ? 12.90 : menu.get(0).getBasePrice() / 100.0;

        List<String> orderIds = new ArrayList<>();
        Map<String, String> orderNumberToId = new LinkedHashMap<>();
        List<String> paidOrderIds = new ArrayList<>();
        List<String> deliveryTrackingOrderIds = new ArrayList<>();
        int created = 0;
        int updated = 0;

        LocalDateTime now = LocalDateTime.now();
        int hoursAgo = 10;
        for (OrderSpec spec : specs) {
            Optional<Order> existing = orderRepository.findByOrderNumber(spec.orderNumber());
            Order order = existing.orElseGet(Order::new);
            boolean isNew = existing.isEmpty();

            order.setOrderNumber(spec.orderNumber());
            order.setStoreId(storeId);
            // CRITICAL: customerId must equal JWT sub (userId), not customer document id
            order.setCustomerId(customerUserId);
            order.setCustomerName("Anna Mueller");
            order.setCustomerEmail("anna.mueller@gmail.com");
            order.setCustomerPhone("+491511000011");
            order.setStatus(spec.status());
            order.setOrderType(spec.type());
            order.setOrderSource(OrderSource.MASOVA);
            order.setPaymentStatus(spec.paid() ? Order.PaymentStatus.PAID : Order.PaymentStatus.PENDING);
            order.setPaymentMethod(spec.type() == Order.OrderType.TAKEAWAY
                    ? Order.PaymentMethod.CASH : Order.PaymentMethod.CARD);
            order.setPriority(Order.Priority.NORMAL);
            order.setCurrency("EUR");
            order.setVatCountryCode("DE");

            if (driverId != null && !driverId.isBlank()
                    && (spec.status() == Order.OrderStatus.OUT_FOR_DELIVERY
                    || spec.status() == Order.OrderStatus.DELIVERED
                    || spec.status() == Order.OrderStatus.DISPATCHED)) {
                order.setAssignedDriverId(driverId);
            }

            OrderItem item = OrderItem.builder()
                    .menuItemId(menuItemId)
                    .name(menuName)
                    .quantity(1)
                    .price(price)
                    .category("FOOD")
                    .build();
            order.setItems(List.of(item));

            BigDecimal sub = BigDecimal.valueOf(price);
            BigDecimal fee = spec.type() == Order.OrderType.DELIVERY
                    ? new BigDecimal("2.50") : BigDecimal.ZERO;
            BigDecimal tax = sub.multiply(new BigDecimal("0.07")).setScale(2, java.math.RoundingMode.HALF_UP);
            order.setSubtotal(sub);
            order.setDeliveryFee(fee);
            order.setTax(tax);
            order.setTotal(sub.add(fee).add(tax));
            order.setTotalNetAmount(sub);
            order.setTotalVatAmount(tax);
            order.setTotalGrossAmount(order.getTotal());

            if (spec.type() == Order.OrderType.DELIVERY) {
                order.setDeliveryAddress(DeliveryAddress.builder()
                        .street("Alexanderplatz 1")
                        .city("Berlin")
                        .state("Berlin")
                        .pincode("10178")
                        .latitude(52.5219)
                        .longitude(13.4132)
                        .build());
            }

            order.setSpecialInstructions("Seed order " + spec.orderNumber());
            order.setPreparationTime(25);
            order.setReceivedAt(now.minusHours(hoursAgo));
            if (order.getCreatedAt() == null) {
                order.setCreatedAt(now.minusHours(hoursAgo));
            }
            order.setUpdatedAt(now);

            applyStatusTimestamps(order, spec.status(), now, hoursAgo);

            if (spec.status() == Order.OrderStatus.CANCELLED) {
                order.setCancellationReason("Seed cancelled order");
                order.setCancelledAt(now.minusHours(hoursAgo - 1));
            }

            Order saved = orderRepository.save(order);
            orderIds.add(saved.getId());
            orderNumberToId.put(spec.orderNumber(), saved.getId());
            if (spec.paid()) {
                paidOrderIds.add(saved.getId());
            }
            // Logistics delivery_trackings.orderId must be commerce Mongo _id
            if (spec.orderNumber().equals("SEED-ORD-OFD-1")
                    || spec.orderNumber().equals("SEED-ORD-DLVR-1")
                    || spec.orderNumber().equals("SEED-ORD-DLVR-2")
                    || spec.orderNumber().equals("SEED-ORD-DISP-1")) {
                deliveryTrackingOrderIds.add(saved.getId());
            }
            if (isNew) {
                created++;
            } else {
                updated++;
            }
            hoursAgo = Math.max(1, hoursAgo - 1);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orderIds", orderIds);
        out.put("orderNumberToId", orderNumberToId);
        out.put("paidOrderIds", paidOrderIds);
        out.put("deliveryTrackingOrderIds", deliveryTrackingOrderIds);
        out.put("createdCount", created);
        out.put("updatedCount", updated);
        out.put("totalSeedOrders", orderIds.size());
        out.put("customerId", customerUserId);
        out.put("ownershipNote", "order.customerId equals JWT userId (sub), not Customer document id");
        return out;
    }

    private void applyStatusTimestamps(Order order, Order.OrderStatus status, LocalDateTime now, int baseHours) {
        LocalDateTime t = now.minusHours(baseHours);
        order.setReceivedAt(t);
        if (status.ordinal() >= Order.OrderStatus.PREPARING.ordinal()
                && status != Order.OrderStatus.CANCELLED) {
            order.setPreparingStartedAt(t.plusMinutes(5));
        }
        if (status.ordinal() >= Order.OrderStatus.OVEN.ordinal()
                && status != Order.OrderStatus.CANCELLED) {
            order.setOvenStartedAt(t.plusMinutes(12));
        }
        if (status.ordinal() >= Order.OrderStatus.BAKED.ordinal()
                && status != Order.OrderStatus.CANCELLED
                && status != Order.OrderStatus.PREPARING
                && status != Order.OrderStatus.RECEIVED) {
            order.setBakedAt(t.plusMinutes(22));
        }
        if (status.ordinal() >= Order.OrderStatus.READY.ordinal()
                && status != Order.OrderStatus.CANCELLED
                && status.ordinal() > Order.OrderStatus.OVEN.ordinal()) {
            order.setReadyAt(t.plusMinutes(28));
        }
        if (status == Order.OrderStatus.DISPATCHED
                || status == Order.OrderStatus.OUT_FOR_DELIVERY
                || status == Order.OrderStatus.DELIVERED) {
            order.setDispatchedAt(t.plusMinutes(32));
        }
        if (status == Order.OrderStatus.OUT_FOR_DELIVERY || status == Order.OrderStatus.DELIVERED) {
            order.setOutForDeliveryAt(t.plusMinutes(35));
        }
        if (status == Order.OrderStatus.DELIVERED) {
            order.setDeliveredAt(t.plusMinutes(50));
            order.setCompletedAt(t.plusMinutes(50));
        }
        if (status == Order.OrderStatus.COMPLETED) {
            order.setCompletedAt(t.plusMinutes(40));
            order.setReadyAt(t.plusMinutes(28));
        }
    }

    private record MenuSpec(
            String name,
            String description,
            Cuisine cuisine,
            MenuCategory category,
            long priceCents,
            boolean recommended,
            String imageUrl) {}

    private record OrderSpec(
            String orderNumber,
            Order.OrderStatus status,
            Order.OrderType type,
            boolean paid) {}
}
