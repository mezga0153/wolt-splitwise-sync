require('dotenv').config();
const nodemailer = require('nodemailer');
const logger = require('./logger');

// Load SMTP configuration from .env
const SMTP_SERVER = process.env.SMTP_SERVER || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');
const SMTP_SSL = process.env.SMTP_SSL !== 'false'; // Default true
const SMTP_AUTH = process.env.SMTP_AUTH !== 'false'; // Default true
const SMTP_USERNAME = process.env.SMTP_USERNAME || '';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || '';
const MAIL_FROM = process.env.MAIL_FROM || '';
const MAIL_TO = process.env.MAIL_TO ? process.env.MAIL_TO.split(',') : [];

// Create transporter
const createTransporter = () => {
    const config = {
        host: SMTP_SERVER,
        port: SMTP_PORT,
        secure: SMTP_SSL,
    };

    if (SMTP_AUTH) {
        config.auth = {
            user: SMTP_USERNAME,
            pass: SMTP_PASSWORD,
        };
    }

    return nodemailer.createTransport(config);
};

/**
 * Send success email with summary
 */
const sendSuccessEmail = async (summary) => {
    // Skip if email not configured
    if (!SMTP_USERNAME || !SMTP_PASSWORD) {
        logger.log('   ℹ️  Email not configured, skipping notification');
        return;
    }

    try {
        const transporter = createTransporter();
        
        const subject = `✅ Wolt-Splitwise Sync: ${summary.successCount} orders processed`;
        
        const text = `
Wolt to Splitwise Sync - Success Report

📊 Summary:
- Total orders in history: ${summary.totalOrders}
- Already processed: ${summary.alreadyProcessed}
- New orders found: ${summary.newOrders}

✅ Successfully processed: ${summary.successCount}
⏭️  Skipped (not group orders): ${summary.skipCount}
❌ Errors: ${summary.errorCount}

${summary.processedDetails && summary.processedDetails.length > 0 ? `
Processed Orders:
${summary.processedDetails.map(d => {
    const splitInfo = d.splitDetails ? d.splitDetails.map(split => {
        const status = split.isPayer ? '💰 Paid' : '💸 Owes';
        return `  ${status}: ${split.name} €${split.amount.toFixed(2)}`;
    }).join('\n') : '';
    
    return `- ${d.orderName} (€${d.sum.toFixed(2)})\n${splitInfo}`;
}).join('\n\n')}
` : ''}

Time: ${new Date().toLocaleString()}
`;

        await transporter.sendMail({
            from: MAIL_FROM,
            to: MAIL_TO,
            subject: subject,
            text: text,
        });

        logger.log('   ✓ Success email sent');
    } catch (error) {
        logger.error('   ⚠️  Failed to send success email:', error.message);
    }
};

/**
 * Send error email
 */
const sendErrorEmail = async (errorMessage, orderDetails = null) => {
    // Skip if email not configured
    if (!SMTP_USERNAME || !SMTP_PASSWORD) {
        return;
    }

    try {
        const transporter = createTransporter();
        
        const subject = `❌ Wolt-Splitwise Sync: Error`;
        
        const text = `
Wolt to Splitwise Sync - Error Report

❌ An error occurred during sync:

${errorMessage}

${orderDetails ? `
Order Details:
${JSON.stringify(orderDetails, null, 2)}
` : ''}

Time: ${new Date().toLocaleString()}

Please check the logs and resolve the issue.
`;

        await transporter.sendMail({
            from: MAIL_FROM,
            to: MAIL_TO,
            subject: subject,
            text: text,
        });

        logger.log('   ✓ Error notification email sent');
    } catch (error) {
        logger.error('   ⚠️  Failed to send error email:', error.message);
    }
};

/**
 * Send authentication error email with clear instructions
 */
const sendAuthErrorEmail = async (subject, errorDetails) => {
    // Skip if email not configured
    if (!SMTP_USERNAME || !SMTP_PASSWORD) {
        logger.log('   ℹ️  Email not configured, skipping auth error notification');
        return;
    }

    try {
        const transporter = createTransporter();
        
        const emailSubject = `🔐 Wolt-Splitwise: ${subject}`;
        
        const text = `
⚠️ WOLT AUTHENTICATION EXPIRED ⚠️

Your Wolt session has expired and needs to be refreshed manually.

Error Details:
${errorDetails}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO FIX:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. SSH into your server (if running remotely)
2. Navigate to the project directory
3. Run: npm run wolt:login
4. Log in to Wolt in the browser window that opens
5. Press Enter in the terminal once logged in
6. The sync will resume automatically on the next scheduled run

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Time: ${new Date().toLocaleString()}

This issue typically occurs when:
- The saved browser session cookies have been invalidated by Wolt
- More than ~7 days have passed without activity
- Wolt has updated their authentication system
`;

        await transporter.sendMail({
            from: MAIL_FROM,
            to: MAIL_TO,
            subject: emailSubject,
            text: text,
        });

        logger.log('   ✓ Authentication error email sent');
    } catch (error) {
        logger.error('   ⚠️  Failed to send auth error email:', error.message);
    }
};

module.exports = {
    sendSuccessEmail,
    sendErrorEmail,
    sendAuthErrorEmail,
};
