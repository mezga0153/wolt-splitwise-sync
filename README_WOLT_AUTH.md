# Wolt to Splitwise Auto-Sync

This project automatically syncs your Wolt group orders to Splitwise. It uses Playwright with your **real Chrome browser** to manage Wolt authentication, and tracks which orders have been processed to avoid duplicates.

## Features

- 🔄 **Automatic sync**: Fetches your latest Wolt orders and adds new ones to Splitwise
- 📊 **Smart tracking**: Remembers which orders have been processed to avoid duplicates
- 🌐 **Real Chrome**: Uses your actual Chrome browser to avoid authentication issues
- 👥 **Group order splitting**: Automatically splits group orders among participants
- 📧 **Email notifications**: Optional email alerts on success or errors

## Initial Setup

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Perform one-time login**:
   ```bash
   npm run wolt:login
   ```
   
   This will:
   - Open your real Chrome browser (not Chromium, to avoid security warnings)
   - Navigate to wolt.com
   - Wait for you to log in manually (OTP/email/etc.)
   - Press Enter in the terminal once you're logged in
   - Save your session to `wolt-chrome-profile/` directory

3. **Configure user aliases**:
   ```bash
   cp aliases.json.example aliases.json
   ```
   
   Then edit `aliases.json` to map Wolt usernames to Splitwise names:
   ```json
   {
       "John Doe": ["j undefined", "John Smith"],
       "Jane Developer": ["jane undefined"]
   }
   ```

4. **Test the authentication** (optional):
   ```bash
   npm run wolt:test
   ```
   
   This will verify that the bearer token can be extracted from your saved session.

## Usage

### Syncing Orders

Simply run:

```bash
npm start
```

The app will automatically:

1. Fetch your latest 50 Wolt orders from the API
2. Check which orders have already been processed
3. Process only new group orders
4. Add them to Splitwise
5. Track processed orders to avoid duplicates on future runs

### Managing Processed Orders

**List all processed orders:**

```bash
npm run orders:list
```

**Reset processed orders** (will process all orders again):

```bash
npm run orders:reset
```

### When your session expires

If you get authentication errors, simply run the login command again:

```bash
npm run wolt:login
```

## How it works

1. **First login**: Playwright opens your **real Chrome browser** (not Chromium) where you log in once
   - Uses `channel: 'chrome'` to avoid "This browser or app may not be secure" warnings
   - Looks and behaves exactly like your normal Chrome
2. **Session persistence**: Your authenticated session (cookies, localStorage, etc.) is saved to `wolt-chrome-profile/` directory
3. **Token extraction**: When needed, Playwright loads your saved Chrome profile in headless mode and intercepts network requests to capture the bearer token
4. **Automatic reuse**: The token is cached in memory for the duration of your app's execution

## Email Notifications (Optional)

The app can send email notifications on success or errors. To enable:

1. Add SMTP credentials to your `.env` file:
   ```
   SMTP_SERVER=smtp.your-provider.com
   SMTP_PORT=465
   SMTP_USERNAME=your_smtp_username
   SMTP_PASSWORD=your_smtp_password
   MAIL_FROM=noreply@example.com
   MAIL_TO=your-email@example.com
   ```

2. The app will automatically send:
   - **Success emails** after processing orders (with summary)
   - **Error emails** when something goes wrong (with details)

3. Leave `SMTP_USERNAME` and `SMTP_PASSWORD` empty to disable email notifications

   Compatible with: Gmail, Outlook, SendGrid, Mailgun, or any SMTP provider

## Files

- `woltAuth.js` - Handles browser automation and token extraction
- `emailNotifier.js` - Sends email notifications on success/error
- `wolt-chrome-profile/` - Chrome profile directory storing your authenticated session (gitignored)
- `.env` - Configuration file (Splitwise API, SMTP settings, etc.)

## Security Note

The `wolt-chrome-profile/` directory contains your authenticated session data. Make sure it's:
- Added to `.gitignore` (don't commit it!)
- Kept secure on your local machine
- Treated like a password

## Troubleshooting

**"No saved session found"**

- Run `npm run wolt:login` to create a session

**"Could not capture bearer token"**

- Your session may have expired
- Run `npm run wolt:login` again

**"Chrome not found"**

- Make sure Google Chrome is installed on your system
- Playwright will use your system Chrome (not its own Chromium)
