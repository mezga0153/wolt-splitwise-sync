
const wolt = require('./wolt');
const splitwise = require('./splitwise');
const aliases = require('./aliases.json');
const orderTracker = require('./orderTracker');
const emailNotifier = require('./emailNotifier');
const logger = require('./logger');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const main = async () => {
    logger.log('=== Wolt to Splitwise Sync ===\n');
    
    // Fetch order history from Wolt API
    let order_ids;
    try {
        order_ids = await wolt.getOrderHistory(50);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Failed to fetch order history:', errorMsg);
        
        // Send email notification for authentication failures
        if (errorMsg.includes('Could not capture bearer token')) {
            await emailNotifier.sendErrorEmail(
                'Wolt authentication failed - bearer token expired',
                {
                    error: errorMsg,
                    solution: 'Please run: npm run wolt:login',
                    timestamp: new Date().toISOString()
                }
            );
        }
        
        process.exit(1);
    }
    
    // Filter out already processed orders
    const processedIds = orderTracker.getProcessedOrderIds();
    const newOrderIds = order_ids.filter(id => !orderTracker.isOrderProcessed(id));
    
    logger.log(`\n📊 Order Summary:`);
    logger.log(`   Total orders in history: ${order_ids.length}`);
    logger.log(`   Already processed: ${processedIds.length}`);
    logger.log(`   New orders to process: ${newOrderIds.length}\n`);
    
    if (newOrderIds.length === 0) {
        logger.log('✓ No new orders to process. All caught up!');
        return;
    }

    const splitOrder = async (order_id) => {
        const order = await wolt.getOrder(order_id);

        const splitwiseMembers = await splitwise.getGroupMembers();
        // console.log('Splitwise members: ', splitwiseMembers);

        const getSplitwiseID = (woltName) => {
            let foundName = null;
            for (const splitwiseName in aliases) {
                if (aliases[splitwiseName].includes(woltName)) {
                    foundName = splitwiseName;
                    break;
                }
            }

            const lookupName = foundName || woltName;
            if (!splitwiseMembers[lookupName]) {
                logger.error(`\n❌ ERROR: Could not find Splitwise user for Wolt name: "${woltName}"`);
                logger.error(`   Tried looking for: "${lookupName}"`);
                logger.error(`   Available Splitwise members: ${Object.keys(splitwiseMembers).join(', ')}`);
                logger.error(`\n   💡 Please add a mapping in aliases.json:`);
                logger.error(`   "${lookupName}": ["${woltName}"]\n`);
                throw new Error(`Missing user mapping for: ${woltName}`);
            }
            
            return splitwiseMembers[lookupName];
        };

        const orders = order.order_details[0].group.other_members;

        // Check if this is a group order (skip if not)
        if (!order.order_details[0].group || !order.order_details[0].group.other_members) {
            logger.log(`⏭️  Skipping order ${order_id} - not a group order`);
            return { skipped: true, reason: 'not a group order' };
        }

        const orderTime = new Date(order.order_details[0].payment_time['$date']).toLocaleString();
        const orderName = order.order_details[0].venue_name + ' ' + orderTime;
        let splits = [];

        let sum = 0;
        for (const member of orders) {
            splits.push({
                user_id: getSplitwiseID(member.first_name + ' ' + member.last_name),
                paid_share: 0,
                owed_share: member.total_share / 100,
            });
            sum += member.total_share / 100;
        }
        sum += order.order_details[0].group.my_member.total_share / 100;
        splits.push({
            user_id: getSplitwiseID(order.order_details[0].group.my_member.first_name + ' ' + order.order_details[0].group.my_member.last_name),
            paid_share: sum,
            owed_share: order.order_details[0].group.my_member.total_share / 100,
        });

        logger.log(`💰 Processing: ${orderName} (€${sum.toFixed(2)})`);
        
        await splitwise.addExpense(orderName, sum, splits);
        
        // Mark order as processed
        orderTracker.markOrderAsProcessed(order_id, orderName);
        logger.log(`✓ Added to Splitwise and marked as processed\n`);
        
        return { success: true, orderName, sum };
    }

    // Process new orders
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const processedDetails = [];
    
    for (const order_id of newOrderIds) {
        try {
            const result = await splitOrder(order_id);
            if (result.skipped) {
                skipCount++;
                // Still mark as processed so we don't try again
                orderTracker.markOrderAsProcessed(order_id, result.reason);
            } else {
                successCount++;
                processedDetails.push({
                    orderName: result.orderName,
                    sum: result.sum,
                });
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`❌ Error processing order ${order_id}:`, errorMsg);
            errorCount++;
            
            // Send error notification with more context for auth failures
            const isAuthError = errorMsg.includes('Could not capture bearer token');
            const emailSubject = isAuthError 
                ? `Failed to process order ${order_id}: Authentication expired`
                : `Failed to process order ${order_id}: ${errorMsg}`;
                
            const emailDetails = {
                order_id,
                error: errorMsg,
                ...(isAuthError && { solution: 'Please run: npm run wolt:login' })
            };
            
            await emailNotifier.sendErrorEmail(emailSubject, emailDetails);
        }
        await wait(1000); // Wait 1 second between requests to avoid rate limiting
    }
    
    logger.log('\n=== Summary ===');
    logger.log(`✓ Successfully processed: ${successCount}`);
    logger.log(`⏭️  Skipped (not group orders): ${skipCount}`);
    logger.log(`❌ Errors: ${errorCount}`);
    
    // Send success email if any orders were processed
    if (successCount > 0 || errorCount > 0) {
        await emailNotifier.sendSuccessEmail({
            totalOrders: order_ids.length,
            alreadyProcessed: processedIds.length,
            newOrders: newOrderIds.length,
            successCount,
            skipCount,
            errorCount,
            processedDetails,
        });
    }
};


main();
