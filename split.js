
const wolt = require('./wolt');
const aliases = require('./aliases.json');
const orderTracker = require('./orderTracker');
const emailNotifier = require('./emailNotifier');
const logger = require('./logger');
const { checkInternetConnection } = require('./woltAuth');

// Select expense backend: 'splitwise' (default) or 'splitcodex'
const splitTarget = (process.env.SPLIT_TARGET || 'splitwise').toLowerCase();
const backend = splitTarget === 'splitcodex'
    ? require('./splitcodex')
    : require('./splitwise');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const main = async () => {
    logger.log(`=== Wolt to ${splitTarget === 'splitcodex' ? 'SplitCodex' : 'Splitwise'} Sync ===\n`);

    // Bail out early if there's no internet — avoids Chrome hangs and noise emails
    const online = await checkInternetConnection();
    if (!online) {
        logger.log('No internet connection detected, skipping sync.');
        return;
    }
    
    // Fetch order history from Wolt API
    let order_ids;
    try {
        order_ids = await wolt.getOrderHistory(50);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Failed to fetch order history:', errorMsg);
        
        // Treat no-internet and navigation timeouts as transient — no email, clean exit
        const isOfflineError =
            errorMsg.includes('NO_INTERNET') ||
            errorMsg.includes('Timeout') ||
            errorMsg.includes('ERR_NAME_NOT_RESOLVED') ||
            errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMsg.includes('ERR_CONNECTION_REFUSED');

        if (isOfflineError) {
            logger.log('Offline or network error — skipping sync without notification.');
            return;
        }
        
        // Send email notification for authentication failures
        // Check for various auth-related error messages
        const isAuthError = 
            errorMsg.includes('Failed to obtain bearer token') ||
            errorMsg.includes('Session has expired') ||
            errorMsg.includes('no bearer tokens found') ||
            errorMsg.includes('bearer token') ||
            errorMsg.includes('authentication') ||
            errorMsg.includes('401') ||
            errorMsg.includes('Unauthorized');
            
        if (isAuthError) {
            await emailNotifier.sendAuthErrorEmail(
                'Wolt authentication failed - session expired',
                errorMsg
            );
        } else {
            await emailNotifier.sendErrorEmail(
                'Wolt sync failed',
                {
                    error: errorMsg,
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

        const members = await backend.getGroupMembers();

        const getMemberID = (woltName) => {
            let foundName = null;
            for (const aliasName in aliases) {
                if (aliases[aliasName].includes(woltName)) {
                    foundName = aliasName;
                    break;
                }
            }

            const lookupName = foundName || woltName;
            if (!members[lookupName]) {
                logger.error(`\n❌ ERROR: Could not find user for Wolt name: "${woltName}"`);
                logger.error(`   Tried looking for: "${lookupName}"`);
                logger.error(`   Available members: ${Object.keys(members).join(', ')}`);
                logger.error(`\n   💡 Please add a mapping in aliases.json:`);
                logger.error(`   "${lookupName}": ["${woltName}"]\n`);
                throw new Error(`Missing user mapping for: ${woltName}`);
            }
            
            return members[lookupName];
        };

        // Check if this is a group order (skip if not)
        if (!order.order_details[0].group || !order.order_details[0].group.other_members) {
            logger.log(`⏭️  Skipping order ${order_id} - not a group order`);
            return { skipped: true, reason: 'not a group order' };
        }

        const orders = order.order_details[0].group.other_members;

        const orderTime = new Date(order.order_details[0].payment_time['$date']).toLocaleString();
        const orderName = order.order_details[0].venue_name + ' ' + orderTime;
        let splits = [];
        let splitDetails = []; // For email reporting

        let sum = 0;

        // Accumulate owed amounts per member (a person may appear multiple times
        // if they ordered multiple items)
        const owedByMember = {};
        for (const member of orders) {
            const woltName = member.first_name + ' ' + member.last_name;
            const memberID = getMemberID(woltName);
            const owedAmount = member.total_share / 100;
            owedByMember[memberID] = (owedByMember[memberID] || 0) + owedAmount;
        }

        for (const [memberID, owedAmount] of Object.entries(owedByMember)) {
            splits.push({
                user_id: memberID,
                paid_share: 0,
                owed_share: owedAmount,
            });
            
            // Add to split details for email
            const memberName = Object.keys(members).find(name => 
                members[name] === memberID
            );
            splitDetails.push({
                name: memberName,
                amount: owedAmount,
                isPayer: false
            });
            
            sum += owedAmount;
        }
        
        // Add the payer (my_member) - may also appear multiple times for multiple items
        const myMembers = Array.isArray(order.order_details[0].group.my_member)
            ? order.order_details[0].group.my_member
            : [order.order_details[0].group.my_member];
        
        const myWoltName = myMembers[0].first_name + ' ' + myMembers[0].last_name;
        const myMemberID = getMemberID(myWoltName);
        const myOwedAmount = myMembers.reduce((acc, m) => acc + m.total_share / 100, 0);
        
        sum += myOwedAmount;
        splits.push({
            user_id: myMemberID,
            paid_share: sum,
            owed_share: myOwedAmount,
        });
        
        // Add payer to split details
        const myMemberName = Object.keys(members).find(name => 
            members[name] === myMemberID
        );
        splitDetails.push({
            name: myMemberName,
            amount: myOwedAmount,
            isPayer: true
        });

        logger.log(`💰 Processing: ${orderName} (€${sum.toFixed(2)})`);
        
        await backend.addExpense(orderName, sum, splits);
        
        // Mark order as processed
        orderTracker.markOrderAsProcessed(order_id, orderName);
        logger.log(`✓ Added and marked as processed\n`);
        
        return { success: true, orderName, sum, splitDetails };
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
                    splitDetails: result.splitDetails,
                });
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`❌ Error processing order ${order_id}:`, errorMsg);
            errorCount++;
            
            // Send error notification with more context for auth failures
            const isAuthError = 
                errorMsg.includes('Failed to obtain bearer token') ||
                errorMsg.includes('Session has expired') ||
                errorMsg.includes('no bearer tokens found') ||
                errorMsg.includes('bearer token') ||
                errorMsg.includes('401');
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
