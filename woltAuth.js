const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const USER_DATA_DIR = path.resolve(__dirname, 'wolt-chrome-profile');

/**
 * Opens a browser for manual login and saves the session state.
 * You only need to run this once, or when your session expires.
 * Uses your real Chrome browser to avoid authentication issues.
 */
const loginAndSaveState = async () => {
    logger.log('Opening Chrome browser for manual login...');
    
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        channel: 'chrome',  // Use real Chrome instead of Chromium
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',  // Makes it look like a normal browser
            '--no-default-browser-check',
            '--no-first-run',
        ],
    });
    
    const page = context.pages()[0] || await context.newPage();
    
    await page.goto('https://wolt.com/');
    
    logger.log('\n=== MANUAL LOGIN REQUIRED ===');
    logger.log('Please log in to Wolt in the browser window.');
    logger.log('After logging in successfully, press Enter in this terminal...\n');
    
    // Wait for user to press Enter
    await new Promise(resolve => {
        process.stdin.once('data', () => resolve());
    });
    
    logger.log(`✓ Session saved to Chrome profile at ${USER_DATA_DIR}`);
    
    await context.close();
};

/**
 * Retrieves the bearer token from an authenticated session.
 * Uses the saved Chrome profile to avoid re-login.
 */
const getWoltBearer = async () => {
    // Check if profile directory exists
    if (!fs.existsSync(USER_DATA_DIR)) {
        throw new Error(
            'No saved session found. Please run: node woltAuth.js login'
        );
    }
    
    logger.log('Loading saved Chrome profile and extracting bearer token...');
    
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        channel: 'chrome',
        headless: true,  // Run in background
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-default-browser-check',
            '--no-first-run',
        ],
    });
    
    const page = context.pages()[0] || await context.newPage();
    
    let bearer = null;
    
    // Intercept requests to capture the Authorization header
    page.on('request', request => {
        const headers = request.headers();
        if (headers.authorization?.startsWith('Bearer ')) {
            bearer = headers.authorization;
            logger.log('✓ Bearer token captured');
        }
    });
    
    // Navigate to a page that makes authenticated API calls
    try {
        await page.goto('https://wolt.com/en/account/orders', { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        // Give it a moment to capture requests
        await page.waitForTimeout(2000);
        
    } catch (error) {
        logger.error('Error loading page:', error instanceof Error ? error.message : String(error));
    }
    
    await context.close();
    
    if (!bearer) {
        throw new Error(
            'Could not capture bearer token. Your session may have expired. ' +
            'Please run: node woltAuth.js login'
        );
    }
    
    return bearer;
};

/**
 * Check if we have a valid saved session
 */
const hasValidSession = () => {
    return fs.existsSync(USER_DATA_DIR);
};

// CLI interface for manual login
if (require.main === module) {
    const command = process.argv[2];
    
    if (command === 'login') {
        loginAndSaveState()
            .then(() => {
                logger.log('\n✓ Login complete! You can now use the app.');
                process.exit(0);
            })
            .catch(error => {
                logger.error('Login failed:', error);
                process.exit(1);
            });
    } else if (command === 'test') {
        getWoltBearer()
            .then(token => {
                logger.log('\n✓ Bearer token retrieved successfully:');
                logger.log(token);
                process.exit(0);
            })
            .catch(error => {
                logger.error('Failed to get bearer token:', error);
                process.exit(1);
            });
    } else {
        logger.log('Usage:');
        logger.log('  node woltAuth.js login  - Open browser for manual login');
        logger.log('  node woltAuth.js test   - Test bearer token extraction');
        process.exit(1);
    }
}

module.exports = {
    loginAndSaveState,
    getWoltBearer,
    hasValidSession
};
