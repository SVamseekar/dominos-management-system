// Enhanced MongoDB initialization with 11 AM - 11 PM operating hours
db = db.getSiblingDB('dominos');

// Create collections
db.createCollection('users');
db.createCollection('stores');
db.createCollection('shifts');
db.createCollection('orders');
db.createCollection('inventory');
db.createCollection('reviews');
db.createCollection('working_sessions');

// Create indexes
db.users.createIndex({ "personalInfo.email": 1 }, { unique: true });
db.users.createIndex({ "personalInfo.phone": 1 }, { unique: true });
db.users.createIndex({ "type": 1 });
db.users.createIndex({ "employeeDetails.storeId": 1 });

db.stores.createIndex({ "code": 1 }, { unique: true });
db.stores.createIndex({ "status": 1 });
db.stores.createIndex({ "regionId": 1 });

db.working_sessions.createIndex({ "employeeId": 1, "date": -1 });
db.working_sessions.createIndex({ "storeId": 1, "isActive": 1 });

print('Database and indexes created successfully');

// Insert sample stores with 11 AM - 11 PM hours
db.stores.insertMany([
    {
        name: "Domino's Banjara Hills",
        code: "DOM001",
        address: {
            street: "Road No. 12, Banjara Hills",
            city: "Hyderabad",
            state: "Telangana",
            pincode: "500034",
            latitude: 17.4126,
            longitude: 78.4482
        },
        phoneNumber: "9876543210",
        regionId: "SOUTH",
        status: "ACTIVE",
        operatingHours: {
            weeklySchedule: {
                "MONDAY": { startTime: "11:00:00", endTime: "23:00:00", isOpen: true },
                "TUESDAY": { startTime: "11:00:00", endTime: "23:00:00", isOpen: true },
                "WEDNESDAY": { startTime: "11:00:00", endTime: "23:00:00", isOpen: true },
                "THURSDAY": { startTime: "11:00:00", endTime: "23:00:00", isOpen: true },
                "FRIDAY": { startTime: "11:00:00", endTime: "23:00:00", isOpen: true },
                "SATURDAY": { startTime: "11:00:00", endTime: "23:00:00", isOpen: true },
                "SUNDAY": { startTime: "11:00:00", endTime: "23:00:00", isOpen: true }
            },
            specialHours: [
                {
                    date: ISODate("2024-12-25T00:00:00Z"),
                    reason: "Christmas Day - Annual Holiday",
                    isClosed: true,
                    isRecurring: true,
                    priority: 10,
                    description: "Closed for Christmas Day celebration. We'll be back tomorrow!"
                }
            ]
        },
        configuration: {
            deliveryRadiusKm: 5.0,
            maxConcurrentOrders: 50,
            estimatedPrepTimeMinutes: 25,
            acceptsOnlineOrders: true,
            acceptsCashPayments: true,
            maxDeliveryTimeMinutes: 30,
            minimumOrderValueINR: 99.0
        },
        openingDate: new Date(),
        createdAt: new Date()
    }
]);

var currentYear = new Date().getFullYear();
var isLeapYear = (currentYear % 4 === 0 && (currentYear % 100 !== 0 || currentYear % 400 === 0));
var totalDays = isLeapYear ? 366 : 365;
var operatingDays = totalDays - 1; // Minus Christmas Day

print('=== OPERATING SCHEDULE SUMMARY ===');
print('Daily Hours: 11:00 AM - 11:00 PM (12 hours)');
print('Operating Days ' + currentYear + ': ' + operatingDays + ' days');
print('Total Days: ' + totalDays + ' days (' + (isLeapYear ? 'Leap Year' : 'Regular Year') + ')');
print('Closure: Christmas Day (December 25) only');
print('Annual Operating Hours: ' + (operatingDays * 12) + ' hours');
print('===================================');