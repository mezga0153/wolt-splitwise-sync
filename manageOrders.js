const orderTracker = require('./orderTracker');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const PROCESSED_ORDERS_FILE = path.join(__dirname, 'processed_orders.json');

const command = process.argv[2];

if (command === 'list') {
    const stats = orderTracker.getStats();
    logger.log(`\n📊 Processed Orders (${stats.total} total)\n`);
    
    if (stats.total === 0) {
        logger.log('No orders processed yet.');
    } else {
        const entries = Object.entries(stats.orders);
        entries.sort((a, b) => {
            const dateA = new Date(a[1].processedAt);
            const dateB = new Date(b[1].processedAt);
            return dateB - dateA; // Most recent first
        });
        
        for (const [orderId, data] of entries) {
            const date = new Date(data.processedAt).toLocaleString();
            logger.log(`  ${orderId}`);
            logger.log(`    ├─ Processed: ${date}`);
            logger.log(`    └─ Order: ${data.orderName || 'N/A'}\n`);
        }
    }
} else if (command === 'reset') {
    if (fs.existsSync(PROCESSED_ORDERS_FILE)) {
        fs.unlinkSync(PROCESSED_ORDERS_FILE);
        logger.log('✓ Processed orders reset. All orders will be processed again on next run.');
    } else {
        logger.log('No processed orders file found.');
    }
} else if (command === 'remove') {
    const orderId = process.argv[3];
    if (!orderId) {
        logger.log('Usage: node manageOrders.js remove <order_id>');
        process.exit(1);
    }
    
    const processedOrders = JSON.parse(fs.readFileSync(PROCESSED_ORDERS_FILE, 'utf8'));
    if (processedOrders[orderId]) {
        delete processedOrders[orderId];
        fs.writeFileSync(PROCESSED_ORDERS_FILE, JSON.stringify(processedOrders, null, 2));
        logger.log(`✓ Removed order ${orderId} from processed list.`);
    } else {
        logger.log(`Order ${orderId} not found in processed list.`);
    }
} else {
    logger.log('Manage Processed Orders\n');
    logger.log('Usage:');
    logger.log('  node manageOrders.js list           - List all processed orders');
    logger.log('  node manageOrders.js reset          - Reset all processed orders');
    logger.log('  node manageOrders.js remove <id>    - Remove specific order from processed list');
}
