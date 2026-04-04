require('dotenv').config();
const axios = require('axios');
const woltAuth = require('./woltAuth');
const logger = require('./logger');

/**
 * Get the bearer token. Uses disk-cached token when fresh, otherwise launches
 * Chrome to extract a new one from the saved browser session.
 */
const getBearerToken = async () => {
    // Use token from .env if available (for backward compatibility / overrides)
    if (process.env.WOLT_AUTH_BEARER_TOKEN) {
        logger.log('Using bearer token from .env file');
        return process.env.WOLT_AUTH_BEARER_TOKEN;
    }

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            logger.log(`Getting bearer token (attempt ${attempt})...`);
            const token = await woltAuth.getWoltBearer();
            if (token) {
                logger.log('Successfully obtained bearer token');
                return token;
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(`Attempt ${attempt} failed:`, msg);

            if (attempt < maxAttempts) {
                // Invalidate cache and retry with fresh Chrome launch
                woltAuth.invalidateCachedToken();
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                throw err;
            }
        }
    }

    throw new Error('Failed to obtain bearer token');
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