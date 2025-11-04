# 🤖 Automated Scheduling

## Option 1: PM2 (Recommended) 🚀

PM2 is a process manager for Node.js - super simple and handles everything for you!

### Setup Steps:

1. **Install PM2 globally:**
   ```bash
   npm install -g pm2
   ```

2. **Configure PM2 to start on boot (run once):**
   ```bash
   pm2 startup
   ```
   Follow the instructions PM2 gives you - it will provide a command to run with `sudo`.

3. **Start the scheduler:**
   ```bash
   pm2 start ecosystem.config.json
   ```

4. **Save PM2 process list:**
   ```bash
   pm2 save
   ```
   This ensures your sync process restarts automatically after reboots.

5. **Done!** 🎉 It will now run every hour at the top of the hour (12:00, 13:00, etc.)

### Managing with PM2:

**View status:**
```bash
pm2 list
```

**View logs (live):**
```bash
pm2 logs wolt-splitwise-sync
```

**Stop it:**
```bash
pm2 stop wolt-splitwise-sync
```

**Start it again:**
```bash
pm2 start wolt-splitwise-sync
```

**Restart it:**
```bash
pm2 restart wolt-splitwise-sync
```

**Run it now (without waiting):**
```bash
npm start
# or
node split.js
```

**Remove from PM2:**
```bash
pm2 delete wolt-splitwise-sync
```

**Update cron schedule:**
Edit `ecosystem.config.json` and change the `cron_restart` line, then:
```bash
pm2 restart wolt-splitwise-sync --update-env
```

### Cron Schedule Examples:

```json
"cron_restart": "0 * * * *"    // Every hour at :00
"cron_restart": "30 * * * *"   // Every hour at :30
"cron_restart": "0 */2 * * *"  // Every 2 hours
"cron_restart": "0 12 * * *"   // Every day at 12:00
"cron_restart": "0 12 * * 1-5" // Weekdays at 12:00
```

---

## Option 2: cron (Classic) 🕰️

If you prefer the old-school way:

1. **Edit your crontab:**
   ```bash
   crontab -e
   ```

2. **Add this line (replace `/path/to/project` with your actual path):**
   ```
   0 * * * * cd /path/to/project && /usr/local/bin/node split.js >> /path/to/project/logs/cron.log 2>&1
   ```
   This runs at the top of every hour (12:00, 13:00, 14:00, etc.)

3. **For every hour at :30 past the hour:**
   ```
   30 * * * * cd /path/to/project && /usr/local/bin/node split.js >> /path/to/project/logs/cron.log 2>&1
   ```

**Note:** macOS requires you to give Terminal (or iTerm) "Full Disk Access" in System Preferences → Security & Privacy for cron to work properly.

---

## Option 3: Shortcuts App (GUI) 🖱️

For the non-terminal folks:

1. Open **Shortcuts** app
2. Create new Shortcut
3. Add action: **Run Shell Script**
4. Paste (replace `/path/to/project` with your actual path):
   ```bash
   cd /path/to/project && /usr/local/bin/node split.js
   ```
5. Save as "Wolt Sync"
6. Go to Shortcuts Settings → Automation
7. Add new automation → Time of Day
8. Set to repeat every 1 hour
9. Choose your "Wolt Sync" shortcut

---

## Troubleshooting 🔧

**PM2 not starting on reboot**
- Run `pm2 startup` and follow the instructions
- Then run `pm2 save` to save the current process list

**"node: command not found" with cron**
- Use the full path to node: `which node` to find it
- Update your crontab with the full path

**"Operation not permitted" with cron**
- Give Terminal/iTerm "Full Disk Access" in System Preferences → Security & Privacy

**Nothing happens**
- Check PM2 logs: `pm2 logs wolt-splitwise-sync`
- Make sure Chrome profile exists: `npm run wolt:login`

**Authentication expires**
- The app will automatically email you when the Wolt session expires
- Just run `npm run wolt:login` to re-authenticate
- Email notifications include helpful solutions for common errors

---

**Recommended:** Use PM2 (Option 1) - it's the simplest and most reliable! 🎯
