require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');

const baseURL = process.env.SPLITCODEX_URL || 'https://split.coincodex.com';
const apiKey = process.env.SPLITCODEX_API_KEY;
const groupId = process.env.SPLITCODEX_GROUP_ID;

const client = axios.create({
    baseURL: `${baseURL}/api`,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
    },
});

/**
 * Fetch group members. Returns { "Full Name": userId } matching splitwise.js interface.
 */
const getGroupMembers = async () => {
    try {
        const response = await client.get(`/groups/${groupId}`);
        const { group } = response.data;

        return group.members.reduce((acc, member) => ({
            ...acc,
            [member.name]: member.userId,
        }), {});
    } catch (error) {
        logger.error('Error fetching SplitCodex group members:', error.response?.data || error.message);
        throw error;
    }
};

/**
 * Create an expense in SplitCodex.
 * Matches splitwise.js interface: addExpense(description, totalAmount, splits)
 * where splits = [{ user_id, paid_share, owed_share }] with amounts in EUR (decimal).
 */
const addExpense = async (description, totalAmount, splits) => {
    try {
        const payers = splits
            .filter(s => s.paid_share > 0)
            .map(s => ({
                userId: s.user_id,
                amountMinor: String(Math.round(s.paid_share * 100)),
            }));

        // Build unequal split definition: shares must be numeric strings
        const shares = {};
        for (const s of splits) {
            if (s.owed_share > 0) {
                shares[s.user_id] = String(Math.round(s.owed_share * 100));
            }
        }

        // Use sum of rounded shares as the authoritative total to avoid
        // floating point rounding mismatches (e.g. 4 × 19.36 ≠ 77.42 exactly).
        // Also align payer amount to the same total.
        const totalMinor = Object.values(shares).reduce((a, b) => a + parseInt(b), 0);
        const alignedPayers = payers.map(p => ({ ...p, amountMinor: String(totalMinor) }));

        const expenseData = {
            description,
            amountMinor: totalMinor,
            date: new Date().toISOString().slice(0, 10),
            splitDef: { type: 'unequal', shares },
            payers: alignedPayers,
        };

        const response = await client.post(`/groups/${groupId}/expenses`, expenseData, {
            headers: {
                'Idempotency-Key': crypto.randomUUID(),
            },
        });

        const payer = splits.find(s => s.paid_share > 0);
        const owedBy = splits.filter(s => s.owed_share > 0 && s.paid_share === 0);

        logger.log(`   ✓ SplitCodex expense created: ${description} (€${totalAmount.toFixed(2)})`);
        logger.log(`     Split among ${splits.length} people - ${owedBy.length} owe the payer`);
    } catch (error) {
        logger.error('Error creating SplitCodex expense:', error.response?.data || error.message);
        throw error;
    }
};

module.exports = {
    getGroupMembers,
    addExpense,
};
