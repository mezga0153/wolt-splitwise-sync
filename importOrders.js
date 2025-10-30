const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const ORDERS_DONE_FILE = path.join(__dirname, 'orders_done.json');
const PROCESSED_ORDERS_FILE = path.join(__dirname, 'processed_orders.json');

const importOrders = () => {
    // Read the orders_done.json file
    if (!fs.existsSync(ORDERS_DONE_FILE)) {
        logger.error('❌ orders_done.json not found');
        process.exit(1);
    }

    const ordersDone = JSON.parse(fs.readFileSync(ORDERS_DONE_FILE, 'utf8'));
    logger.log(`📥 Found ${ordersDone.length} orders in orders_done.json`);

    // Load existing processed orders (if any)
    let processedOrders = {};
    if (fs.existsSync(PROCESSED_ORDERS_FILE)) {
        processedOrders = JSON.parse(fs.readFileSync(PROCESSED_ORDERS_FILE, 'utf8'));
        logger.log(`📋 Existing processed orders: ${Object.keys(processedOrders).length}`);
    }

    // Import orders from orders_done.json
    let imported = 0;
    let skipped = 0;

    for (const order of ordersDone) {
        const orderId = order.purchase_id;
        
        if (processedOrders[orderId]) {
            skipped++;
            continue;
        }

        // Add to processed orders
        processedOrders[orderId] = {
            processedAt: new Date(order.payment_time_ts).toISOString(),
            orderName: `${order.venue_name} ${order.received_at}`,
            importedFrom: 'orders_done.json',
            totalAmount: order.total_amount,
            isGroupOrder: !!order.group_name,
        };
        imported++;
    }

    // Save updated processed orders
    fs.writeFileSync(PROCESSED_ORDERS_FILE, JSON.stringify(processedOrders, null, 2));

    logger.log('\n✅ Import complete!');
    logger.log(`   📊 Total orders imported: ${imported}`);
    logger.log(`   ⏭️  Already existed: ${skipped}`);
    logger.log(`   📝 Total in database: ${Object.keys(processedOrders).length}\n`);
};

// Run the import
importOrders();
