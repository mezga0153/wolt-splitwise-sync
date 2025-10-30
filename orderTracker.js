const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const PROCESSED_ORDERS_FILE = path.join(__dirname, 'processed_orders.json');

/**
 * Load the list of processed order IDs
 */
const loadProcessedOrders = () => {
    try {
        if (fs.existsSync(PROCESSED_ORDERS_FILE)) {
            const data = fs.readFileSync(PROCESSED_ORDERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading processed orders:', error);
    }
    return {};
};

/**
 * Save the list of processed order IDs
 */
const saveProcessedOrders = (processedOrders) => {
    try {
        fs.writeFileSync(PROCESSED_ORDERS_FILE, JSON.stringify(processedOrders, null, 2));
    } catch (error) {
        logger.error('Error saving processed orders:', error);
    }
};

/**
 * Check if an order has been processed
 */
const isOrderProcessed = (orderId) => {
    const processedOrders = loadProcessedOrders();
    return processedOrders.hasOwnProperty(orderId);
};

/**
 * Mark an order as processed
 */
const markOrderAsProcessed = (orderId, orderName = null) => {
    const processedOrders = loadProcessedOrders();
    processedOrders[orderId] = {
        processedAt: new Date().toISOString(),
        orderName: orderName,
    };
    saveProcessedOrders(processedOrders);
};

/**
 * Get all processed order IDs
 */
const getProcessedOrderIds = () => {
    const processedOrders = loadProcessedOrders();
    return Object.keys(processedOrders);
};

/**
 * Get statistics about processed orders
 */
const getStats = () => {
    const processedOrders = loadProcessedOrders();
    const orderIds = Object.keys(processedOrders);
    return {
        total: orderIds.length,
        orders: processedOrders,
    };
};

module.exports = {
    isOrderProcessed,
    markOrderAsProcessed,
    getProcessedOrderIds,
    getStats,
};
