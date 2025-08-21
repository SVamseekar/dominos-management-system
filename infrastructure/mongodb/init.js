// Create database and collections with proper indexing
db = db.getSiblingDB('dominos');

// Create collections
db.createCollection('users');
db.createCollection('orders');
db.createCollection('inventory');
db.createCollection('reviews');
db.createCollection('working_sessions');

// Users collection indexes
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "phone": 1 }, { unique: true });
db.users.createIndex({ "type": 1 });
db.users.createIndex({ "employeeDetails.storeId": 1 });
db.users.createIndex({ "createdAt": -1 });

// Orders collection indexes
db.orders.createIndex({ "orderNumber": 1 }, { unique: true });
db.orders.createIndex({ "customerId": 1 });
db.orders.createIndex({ "storeId": 1 });
db.orders.createIndex({ "statusHistory.status": 1 });
db.orders.createIndex({ "timings.orderReceived": -1 });

// Inventory collection indexes
db.inventory.createIndex({ "storeId": 1, "item.sku": 1 }, { unique: true });
db.inventory.createIndex({ "item.category": 1 });
db.inventory.createIndex({ "stock.current": 1 });

print('Database and indexes created successfully');