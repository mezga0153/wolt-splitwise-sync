require('dotenv').config();
const Splitwise = require('splitwise');
const logger = require('./logger');

const splitwise = Splitwise({
    consumerKey: process.env.SPLITWISE_CLIENT_ID,
    consumerSecret: process.env.SPLITWISE_CLIENT_SECRET,
});

// Define the group ID (replace with your group's ID)
const groupId = process.env.SPLITWISE_GROUP_ID;

// Function to fetch members of a particular group
const getGroupMembers = async () => {
    try {
        const group = await splitwise.getGroup({ id: groupId });

        /*
        console.log('Group Members:');
        group.members.forEach(member => {
            console.log(`Name: ${member.first_name} ${member.last_name}, Email: ${member.email}, ID: ${member.id}`);
        });
        */

        return group.members.reduce((acc, member) => ({
            ...acc,
            [`${member.first_name} ${member.last_name}`]: member.id,
        }), {});
    } catch (error) {
        logger.error('Error fetching group members:', error.message);
    }
};

// Function to add an expense with unequal split
const addExpense = async (description, totalAmount, splits) => {
    try {
        const expense = await splitwise.createExpense({
            description: description,
            group_id: groupId,
            cost: totalAmount,
            currency_code: 'EUR',
            users: splits.map(({ user_id, paid_share, owed_share }) => ({
                user_id: user_id,
                paid_share: paid_share,
                owed_share: owed_share,
            })),
        });

        // Show split summary
        const payer = splits.find(s => s.paid_share > 0);
        const owedBy = splits.filter(s => s.owed_share > 0 && s.paid_share === 0);
        
        logger.log(`   ✓ Splitwise expense created: ${expense.description} (€${expense.cost})`);
        logger.log(`     Split among ${splits.length} people - ${owedBy.length} owe the payer €${(totalAmount / splits.length).toFixed(2)} each`);
    } catch (error) {
        logger.error('Error creating expense:', error.message);
    }
};

// Example of adding an expense
(async () => {
    return;
    const members = await getGroupMembers(); // Fetch group members

    return;

    // Example: Adding an expense of $100, where the split is unequal
    const description = 'Dinner at a restaurant';
    const totalAmount = 100;

    // Define splits (replace with actual user IDs and shares)
    const splits = [
        { user_id: members[0].id, paid_share: 100, owed_share: 50 }, // First person pays $100, owes $50
        { user_id: members[1].id, paid_share: 0, owed_share: 50 },   // Second person pays $0, owes $50
    ];

    await addExpense(description, totalAmount, splits);
})();

module.exports = {
    getGroupMembers,
    addExpense,
}