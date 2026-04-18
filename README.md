# 🍕 Wolt Auto-Splitter 🤑

### 🎵 *A Song of Hunger and Deliverance* 🎵

```
🎼 When hunger strikes at half past noon,
   And your stomach sings a grumbling tune,
   You open Wolt, the food gods smile,
   But splitting bills? That takes a while... 😩

   UNTIL NOW! 🎉
   
   This robot does the math for you,
   No more "who owes what?" review,
   From Wolt to SplitCodex, quick as light,
   Your lunch debts sorted, all polite! 🚀
```

---

## 🤔 What Even Is This?

Ever ordered food with your coworkers on Wolt, and then spent the next 47 minutes trying to figure out who owes whom? Ever thought "there MUST be a better way"? 

**WELL BUCKLE UP, BUTTERCUP** 🎢

This magical script automatically:

1. 🕵️ Logs into your Wolt account
2. 📋 Fetches all your group orders
3. 🧮 Does the math that your brain refuses to do
4. 💸 Creates expenses in SplitCodex (or Splitwise) automagically
5. 📧 Emails you a summary (because you're fancy like that)
6. 🎉 Makes you look like a tech wizard to your friends

## ✨ Features That Will Make You Go "Wow"

- 🤖 **Set It And Forget It**: Run it once, it remembers what it processed
- 🧠 **Smart AF**: Only processes new orders, skips solo meals (we don't judge)
- 🔒 **Secure-ish**: Uses your real Chrome profile, no sketchy browser bots
- 📊 **Keeps Receipts**: Tracks everything in a JSON file (very professional)
- 🚨 **Error Reporting**: Emails you when something goes wrong (rarely happens, we swear)
- 🎯 **Name Mapping**: Handles your friends' weird Wolt usernames with grace
- 🔀 **Pluggable Backends**: SplitCodex (default) or Splitwise — your call

## 🚀 Setup (It's Easier Than Making Instant Ramen)

### Step 1: Get Your Stuff Together
```bash
npm install
```

### Step 2: Login to Wolt (Just Once, We Promise)
```bash
npm run wolt:login
```
A Chrome window opens → Log in → Press Enter → Done! 🎊

### Step 3: Configure Your Backend

**SplitCodex (default)** — add to `.env`:
```env
SPLITCODEX_URL=https://your-splitcodex-instance.com
SPLITCODEX_API_KEY=your_api_key
SPLITCODEX_GROUP_ID=your_group_id
```

**Splitwise (alternative)** — add to `.env`:
```env
SPLIT_TARGET=splitwise
SPLITWISE_API_KEY=your_key
SPLITWISE_GROUP_ID=your_group_id
```

The `SPLIT_TARGET` env var controls which backend is used (`splitcodex` is the default).

### Step 4: Configure Your Aliases
Copy the example and customize it:
```bash
cp aliases.json.example aliases.json
```

Then edit `aliases.json` to map Wolt names to member names in your expense group:
```json
{
    "John Doe": ["j undefined", "John Smith", "johnny"],
    "Jane Developer": ["jane undefined", "J Dev"]
}
```
*Pro tip: Wolt users love using "undefined" as their last name. It's a feature, not a bug* 🤷

### Step 5: (Optional) Email Setup
Want fancy email notifications? Add to `.env`:
```env
SMTP_SERVER=smtp.gmail.com
SMTP_USERNAME=your.email@gmail.com
SMTP_PASSWORD=your_app_password
MAIL_TO=your.email@gmail.com
```

📧 **Email notifications include:**
- ✅ Success reports with order summaries
- ❌ Error alerts (including authentication failures)
- 🔧 Helpful solution suggestions

## 🎮 How To Use

Run this bad boy:
```bash
npm start
```

Then watch the magic happen:
```
=== Wolt to SplitCodex Sync ===

✓ Found 50 orders in history
✓ 47 already processed
✓ 3 new orders to process

💰 Processing: Easy Beer 30/10/2025 (€21.80)
   ✓ SplitCodex expense created
   Split among 2 people - 1 owes €10.90

✓ Successfully processed: 3
⏭️  Skipped: 0
❌ Errors: 0
```

*Chef's kiss* 👨‍🍳💋

## 📚 Handy Commands

| Command | What It Does | When To Use It |
|---------|--------------|----------------|
| `npm start` | Syncs new orders | Every day after lunch |
| `npm run orders:list` | Shows processed orders | When you're curious |
| `npm run orders:reset` | Clears history | When you want chaos |
| `npm run wolt:login` | Re-login to Wolt | When session expires |
| `npm run wolt:test` | Test bearer token | When feeling paranoid |

## 🐛 When Things Go Wrong

### "Could not find user for Wolt name"
**Translation:** Someone's name doesn't match 🤦

**Fix:** Add them to `aliases.json`. The error message literally tells you what to add. Just copy-paste it. You got this! 💪

### "No saved session found"
**Translation:** Your Wolt login expired (or you never logged in)

**Fix:** `npm run wolt:login` and log in again. Takes 30 seconds.

### "This browser or app may not be secure"
**Translation:** This should never happen because we use your REAL Chrome, not some sketchy bot browser

**Fix:** If you see this, something went wrong. Open an issue and include a screenshot of your error. Or just try logging in again.

## 🔄 Run It Automatically

Don't want to remember to run this? Set it up to run every hour:

**The Easy Way (PM2):**
```bash
npm install -g pm2
pm2 start ecosystem.config.json
pm2 startup
pm2 save
```

**Other Options:** See [SCHEDULING.md](SCHEDULING.md) for launchd, cron, or Shortcuts app setup.

## 🎯 Pro Tips

1. **Automate It**: Use PM2 to run every hour automatically (see above)
2. **Check Emails**: The summary emails are actually useful (shocking, we know)
3. **Keep Aliases Updated**: When new people join your lunch crew, add them to `aliases.json`
4. **Don't Commit `.env`**: It's already in `.gitignore` but just... don't
5. **Monitor Logs**: `pm2 logs` shows you what's happening in real-time

## 🤓 How It Works (For The Nerds)

1. **Authentication**: Uses Playwright to launch your real Chrome, saves the session
2. **Order Fetching**: Hits Wolt's API with your bearer token
3. **Smart Filtering**: Only grabs group orders you haven't processed
4. **Name Matching**: Maps Wolt names to expense group members via aliases
5. **Expense Creation**: Calls SplitCodex (or Splitwise) API to create expenses
6. **Tracking**: Saves processed order IDs to avoid duplicates
7. **Notifications**: Emails you a summary (if configured)

## 🏗️ Project Structure

```
.
├── split.js              # Main orchestrator 🎭
├── wolt.js               # Wolt API wrapper 🍔
├── woltAuth.js           # Chrome automation magic 🤖
├── splitcodex.js         # SplitCodex API backend 💰 (default)
├── splitwise.js          # Splitwise API backend 💸 (alternative)
├── orderTracker.js       # Keeps track of what's done ✅
├── emailNotifier.js      # Your personal assistant 📧
├── aliases.json          # Name translator 📛
├── processed_orders.json # The receipts 🧾
└── wolt-chrome-profile/  # Chrome's secret hideout 🕵️
```

## 🙏 Credits

Made with 💙 (and hunger) by someone tired of manually splitting lunch bills.

Powered by:
- 🎭 Playwright (for being a good browser bot)
- 📦 Nodemailer (for the fancy emails)
- 🍕 Wolt (for feeding us)
- 💸 SplitCodex (for keeping friendships intact)

## 📜 License

MIT or whatever. Just don't blame me if your friends discover how much you actually eat.

---

## 🎉 Final Words

If this saved you 5 minutes of "wait, who ordered the extra fries?" then it's done its job.

Now go order some food and let the robots handle the boring stuff! 🤖🍔💰

*P.S. - If you found a bug, open an issue. If you fixed a bug, you're a hero. PRs welcome!* 🦸

---

**Made with ❤️, 🍕, and way too much ☕**
