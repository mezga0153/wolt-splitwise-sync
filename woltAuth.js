const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const logger = require('./logger');

const USER_DATA_DIR = path.resolve(__dirname, 'wolt-chrome-profile');
const LOCK_FILE = path.resolve(__dirname, '.wolt-browser-lock');
const TOKEN_CACHE_FILE = path.resolve(__dirname, '.wolt-token-cache.json');
// Only launch Chrome if the cached token is older than this
const TOKEN_CACHE_TTL_MS = 45 * 60 * 1000; // 45 minutes
// Lock timeout: if a lock is older than this, consider it stale
const LOCK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

const CHROME_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--no-default-browser-check',
    '--no-first-run',
    '--disable-features=IsolateOrigins,site-per-process',
    // Prevent SIGABRT crashes on macOS after sleep/wake.
    // Headless Chrome tries to initialize GPU via WindowServer which is
    // briefly unavailable after wake, causing an abort signal.
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-gpu-sandbox',
];

/**
 * Kill any zombie Chrome processes that have our profile directory locked.
 * This prevents "Failed to create ProcessSingleton" errors.
 */
const killZombieChromeProcesses = () => {
    try {
        // Kill any Chrome processes using our profile directory (by command-line match)
        // This catches SIGABRT-crashed processes that didn't clean up properly
        try {
            const profilePathEscaped = USER_DATA_DIR.replace(/'/g, "'\\''");
            // pgrep on macOS to find Chrome processes referencing our profile
            const result = execSync(
                `pgrep -f 'Google Chrome.*${path.basename(USER_DATA_DIR)}' 2>/dev/null || true`,
                { encoding: 'utf8', timeout: 3000 }
            ).trim();
            if (result) {
                const pids = result.split('\n').filter(p => p.trim());
                for (const pid of pids) {
                    try {
                        logger.warn(`Killing zombie Chrome process ${pid}`);
                        process.kill(parseInt(pid), 'SIGKILL');
                    } catch (_) {}
                }
                // Give OS a moment to release file handles
                const wait = Date.now() + 500;
                while (Date.now() < wait) { /* busy wait */ }
            }
        } catch (_) {}

        // Also clean up Chrome's singleton lock files regardless
        const singletonLock = path.join(USER_DATA_DIR, 'SingletonLock');
        if (fs.existsSync(singletonLock)) {
            logger.warn('Removing stale Chrome SingletonLock...');
            try { fs.unlinkSync(singletonLock); } catch (_) {}
            try { fs.unlinkSync(path.join(USER_DATA_DIR, 'SingletonSocket')); } catch (_) {}
            try { fs.unlinkSync(path.join(USER_DATA_DIR, 'SingletonCookie')); } catch (_) {}
        }
    } catch (error) {
        logger.error('Error cleaning zombie Chrome:', error.message);
    }
};

/**
 * Acquire a file-based lock to prevent concurrent Chrome profile access.
 */
const acquireLock = (caller = 'unknown') => {
    const maxWait = 60000; // 1 minute
    const pollInterval = 2000;
    const start = Date.now();

    while (fs.existsSync(LOCK_FILE)) {
        try {
            const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
            const lockAge = Date.now() - lockData.timestamp;

            if (lockAge > LOCK_TIMEOUT_MS) {
                logger.warn(`Breaking stale lock (age: ${Math.round(lockAge / 1000)}s, holder: ${lockData.caller}, pid: ${lockData.pid})`);
                fs.unlinkSync(LOCK_FILE);
                break;
            }

            if (Date.now() - start > maxWait) {
                // Force-break the lock rather than failing
                logger.warn(`Force-breaking lock after ${maxWait / 1000}s wait (held by ${lockData.caller} pid ${lockData.pid})`);
                try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
                break;
            }

            logger.log(`Waiting for browser lock (held by ${lockData.caller})...`);
        } catch (err) {
            try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
            break;
        }

        const waitUntil = Date.now() + pollInterval;
        while (Date.now() < waitUntil) { /* busy wait */ }
    }

    fs.writeFileSync(LOCK_FILE, JSON.stringify({
        pid: process.pid,
        caller,
        timestamp: Date.now()
    }), 'utf8');
};

const releaseLock = () => {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
            if (lockData.pid === process.pid) {
                fs.unlinkSync(LOCK_FILE);
            }
        }
    } catch (_) {
        try { fs.unlinkSync(LOCK_FILE); } catch (_2) {}
    }
};

/**
 * Read cached bearer token from disk.
 * Returns the token if it's still fresh, null otherwise.
 */
const getCachedToken = () => {
    try {
        if (!fs.existsSync(TOKEN_CACHE_FILE)) return null;
        const cache = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
        const age = Date.now() - cache.timestamp;
        if (age < TOKEN_CACHE_TTL_MS && cache.token) {
            logger.log(`Using cached bearer token (age: ${Math.round(age / 60000)}m)`);
            return cache.token;
        }
        logger.log(`Cached token expired (age: ${Math.round(age / 60000)}m, ttl: ${TOKEN_CACHE_TTL_MS / 60000}m)`);
        return null;
    } catch (_) {
        return null;
    }
};

/**
 * Save bearer token to disk cache.
 */
const cacheToken = (token) => {
    try {
        fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({
            token,
            timestamp: Date.now(),
            cachedAt: new Date().toISOString()
        }), 'utf8');
    } catch (error) {
        logger.error('Error caching token:', error.message);
    }
};

/**
 * Invalidate the cached token (e.g. after a 401 response).
 */
const invalidateCachedToken = () => {
    try {
        if (fs.existsSync(TOKEN_CACHE_FILE)) {
            fs.unlinkSync(TOKEN_CACHE_FILE);
            logger.log('Invalidated cached token');
        }
    } catch (_) {}
};

/**
 * Opens a browser for manual login and saves the session state.
 */
const loginAndSaveState = async () => {
    logger.log('Opening Chrome browser for manual login...');
    
    // Clean up any zombies first
    killZombieChromeProcesses();
    // Invalidate old token cache
    invalidateCachedToken();
    
    acquireLock('login');
    try {
        const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
            channel: 'chrome',
            headless: false,
            args: CHROME_ARGS,
            acceptDownloads: true,
            bypassCSP: false,
            storageState: undefined,
        });
        
        const page = context.pages()[0] || await context.newPage();
        
        await page.goto('https://wolt.com/');
        
        logger.log('\n=== MANUAL LOGIN REQUIRED ===');
        logger.log('Please log in to Wolt in the browser window.');
        logger.log('After logging in successfully, press Enter in this terminal...\n');
        
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });
        
        logger.log(`✓ Session saved to Chrome profile at ${USER_DATA_DIR}`);
        
        await context.close();
    } finally {
        releaseLock();
    }
};

/**
 * Launch Chrome, visit Wolt pages, and extract the bearer token from API requests.
 * This is the ONLY function that opens Chrome (besides login).
 * Returns the bearer token string or throws if session is expired.
 */
const extractBearerFromBrowser = async () => {
    if (!fs.existsSync(USER_DATA_DIR)) {
        throw new Error('No saved session found. Please run: node woltAuth.js login');
    }
    
    logger.log('Launching Chrome to extract bearer token...');
    
    // Clean up zombies before launching
    killZombieChromeProcesses();
    
    acquireLock('extractBearer');
    let context;
    try {
        context = await chromium.launchPersistentContext(USER_DATA_DIR, {
            channel: 'chrome',
            headless: true,
            args: CHROME_ARGS,
            acceptDownloads: true,
            bypassCSP: false,
            storageState: undefined,
        });
        
        const page = context.pages()[0] || await context.newPage();
        
        let bearer = null;
        let tokenCaptured = false;
        let apiRequestCount = 0;
        
        // Intercept ALL requests to find Bearer tokens
        page.on('request', request => {
            const url = request.url();
            const headers = request.headers();
            
            if (headers.authorization?.startsWith('Bearer ')) {
                if (!tokenCaptured) {
                    bearer = headers.authorization;
                    tokenCaptured = true;
                    logger.log('✓ Bearer token captured from API request');
                }
            }
            
            if (url.includes('wolt.com') && !url.includes('.js') && !url.includes('.css') && 
                !url.includes('.png') && !url.includes('.svg') && !url.includes('.woff')) {
                apiRequestCount++;
            }
        });
        
        // Log auth-related responses for debugging
        page.on('response', async response => {
            const url = response.url();
            const status = response.status();
            if (status === 401 || status === 403) {
                logger.warn(`⚠️ ${status} response from: ${url.substring(0, 120)}`);
            }
        });
        
        // Visit home page first - SPA initializes and may auto-refresh tokens
        logger.log('Visiting home page...');
        await page.goto('https://wolt.com/', { 
            waitUntil: 'domcontentloaded',
            timeout: 25000 
        });
        await page.waitForTimeout(2000);
        
        // Go to orders page - triggers authenticated API calls
        if (!tokenCaptured) {
            logger.log('Visiting orders page...');
            await page.goto('https://wolt.com/en/account/orders', { 
                waitUntil: 'networkidle',
                timeout: 25000 
            });
            await page.waitForTimeout(2000);
        }
        
        // Try profile page
        if (!tokenCaptured) {
            logger.log('Trying profile page...');
            await page.goto('https://wolt.com/en/account/profile', {
                waitUntil: 'networkidle',
                timeout: 25000
            });
            await page.waitForTimeout(2000);
        }
        
        // Try account page
        if (!tokenCaptured) {
            logger.log('Trying account page...');
            await page.goto('https://wolt.com/en/account', {
                waitUntil: 'networkidle',
                timeout: 25000
            });
            await page.waitForTimeout(2000);
        }
        
        // Check if we got redirected to login
        const currentUrl = page.url();
        const isOnLoginPage = currentUrl.includes('login') || currentUrl.includes('signin');
        
        // Log all cookies for debugging (useful to understand when session will die)
        const cookies = await context.cookies();
        const woltCookies = cookies.filter(c => c.domain.includes('wolt'));
        const cookiesWithExpiry = woltCookies
            .filter(c => c.expires > 0)
            .sort((a, b) => a.expires - b.expires);
        
        if (cookiesWithExpiry.length > 0) {
            const nearestExpiry = new Date(cookiesWithExpiry[0].expires * 1000);
            const daysLeft = Math.round((cookiesWithExpiry[0].expires * 1000 - Date.now()) / (24 * 60 * 60 * 1000));
            logger.log(`Nearest Wolt cookie expiry: ${nearestExpiry.toISOString()} (${daysLeft} days)`);
        }
        
        logger.log(`Browser session: ${apiRequestCount} requests, token captured: ${tokenCaptured}, login redirect: ${isOnLoginPage}`);
        
        await context.close();
        releaseLock();
        
        if (!bearer) {
            if (isOnLoginPage) {
                throw new Error('Session expired - Wolt redirected to login page. Please run: npm run wolt:login');
            }
            throw new Error(
                `Session expired - no bearer tokens found in ${apiRequestCount} requests. ` +
                'Please log in again: npm run wolt:login'
            );
        }
        
        return bearer;
        
    } catch (error) {
        if (context) {
            try { await context.close(); } catch (_) {}
        }
        releaseLock();
        throw error;
    }
};

/**
 * Get the Wolt bearer token. Uses disk cache when possible to minimize Chrome launches.
 * This is the main entry point - call this to get a valid bearer token.
 */
const getWoltBearer = async () => {
    // 1. Try disk cache first
    const cached = getCachedToken();
    if (cached) return cached;
    
    // 2. Cache miss or expired - launch Chrome to get a fresh token
    const token = await extractBearerFromBrowser();
    
    // 3. Cache the new token
    cacheToken(token);
    
    return token;
};

/**
 * Check if we have a valid saved session (profile directory exists)
 */
const hasValidSession = () => {
    return fs.existsSync(USER_DATA_DIR);
};

/**
 * Refresh is now a no-op alias for getWoltBearer.
 * Kept for backward compatibility with PM2 config / CLI.
 */
const refreshSession = async () => {
    logger.log('Session refresh requested - extracting bearer to verify session health...');
    invalidateCachedToken(); // Force a fresh Chrome launch
    const token = await getWoltBearer();
    logger.log('✓ Session is alive - bearer token obtained');
    return token;
};

/**
 * needsRefresh is no longer used (caching handles freshness).
 * Kept for backward compatibility.
 */
const needsRefresh = () => false;


// CLI interface
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
        // Force fresh extraction (bypass cache) for testing
        invalidateCachedToken();
        getWoltBearer()
            .then(token => {
                logger.log('\n✓ Bearer token retrieved successfully');
                logger.log(`Token length: ${token.length}`);
                logger.log(`Token prefix: ${token.substring(0, 30)}...`);
                process.exit(0);
            })
            .catch(error => {
                logger.error('Failed to get bearer token:', error.message);
                process.exit(1);
            });
    } else if (command === 'refresh') {
        refreshSession()
            .then(() => {
                logger.log('\n✓ Session is healthy!');
                process.exit(0);
            })
            .catch(error => {
                logger.error('Session check failed:', error.message);
                process.exit(1);
            });
    } else if (command === 'cleanup') {
        logger.log('Cleaning up zombie processes and stale locks...');
        killZombieChromeProcesses();
        try { fs.unlinkSync(LOCK_FILE); logger.log('Removed lock file'); } catch (_) {}
        invalidateCachedToken();
        logger.log('✓ Cleanup complete');
        process.exit(0);
    } else {
        logger.log('Usage:');
        logger.log('  node woltAuth.js login   - Open browser for manual login');
        logger.log('  node woltAuth.js test    - Test bearer token extraction (fresh)');
        logger.log('  node woltAuth.js refresh - Verify session is still alive');
        logger.log('  node woltAuth.js cleanup - Kill zombie Chrome processes and clean locks');
        process.exit(1);
    }
}

module.exports = {
    loginAndSaveState,
    getWoltBearer,
    hasValidSession,
    refreshSession,
    needsRefresh,
    invalidateCachedToken,
};
