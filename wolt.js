require('dotenv').config();
const axios = require('axios');
const woltAuth = require('./woltAuth');
const logger = require('./logger');

let cachedBearerToken = null;

/**
 * Get the bearer token, either from cache or by fetching from browser session
 */
const getBearerToken = async () => {
    // Use token from .env if available (for backward compatibility)
    if (process.env.WOLT_AUTH_BEARER_TOKEN) {
        logger.log('Using bearer token from .env file');
        return process.env.WOLT_AUTH_BEARER_TOKEN;
    }
    
    // Otherwise, get from browser session
    if (!cachedBearerToken) {
        logger.log('Fetching bearer token from saved browser session...');
        cachedBearerToken = await woltAuth.getWoltBearer();
    }
    
    return cachedBearerToken;
};

module.exports = {
    getOrder: async (order_id) => {
        try {
            const bearerToken = await getBearerToken();
            
            logger.log('Making request to Wolt API for order:', order_id);
            const response = await axios.get('https://restaurant-api.wolt.com/v2/order_details/by_ids', {
                params: {
                    purchases: order_id,
                },
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'en-US,en;q=0.9,sl;q=0.8,en-GB;q=0.7',
                    'app-language': 'en',
                    'authorization': bearerToken,
                }
            });

            if (response.data.error) {
                throw new Error(response.data.error);
            }

            if (!response.data.order_details || response.data.order_details.length === 0) {
                throw new Error('No order details found');
            }

            return response.data;
        } catch (error) {
            logger.error('Error making the request:', error.response ? error.response.data : error.message);
            process.exit(1);
        }
    },
    
    getOrderHistory: async (limit = 50) => {
        try {
            const bearerToken = await getBearerToken();
            
            logger.log(`Fetching order history (limit: ${limit})...`);
            const response = await axios.get('https://consumer-api.wolt.com/order-tracking-api/v1/order_history/', {
                params: {
                    limit: limit,
                },
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'en-US,en;q=0.9,sl;q=0.8,en-GB;q=0.7',
                    'app-language': 'en',
                    'authorization': bearerToken,
                }
            });

            if (response.data.error) {
                throw new Error(response.data.error);
            }

            // Extract order IDs from the response
            // The API returns "orders" not "results"
            const orders = response.data.orders || [];
            logger.log(`✓ Found ${orders.length} orders in history`);
            
            // Return all order IDs (we'll filter for group orders later when we fetch details)
            // The order ID field is "purchase_id"
            const orderIds = orders.map(order => order.purchase_id).filter(Boolean);
            logger.log(`✓ ${orderIds.length} orders available for processing`);
            
            return orderIds;
        } catch (error) {
            logger.error('Error fetching order history:', error.response ? error.response.data : error.message);
            throw error;
        }
    }
}