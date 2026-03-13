# Slack Bot Setup Guide - BLOOM AI Agent

## 🔧 Issues Fixed

I've identified and fixed the following critical issues with your Slack bot:

### ✅ **Fixed: Missing OAuth Scopes**
Your settings page was only showing 4 scopes, but **9 are required**. I've updated the UI to show all required scopes:

- ✅ `app_mentions:read` - **CRITICAL** - Without this, bot can't receive @mentions
- ✅ `channels:history` - Read channel messages
- ✅ `channels:read` - View channels bot is in
- ✅ `chat:write` - Send messages
- ✅ `groups:history` - Read private channel messages
- ✅ `im:history` - **CRITICAL** - Receive direct messages
- ✅ `im:read` - Read DM channels
- ✅ `mpim:history` - Read group DM messages
- ✅ `users:read` - Get user info

### ✅ **Added: Event Subscriptions Instructions**
Your settings page now includes clear instructions for setting up Event Subscriptions (required for the bot to receive events).

### ✅ **Added: Health Check Button**
You can now test your Slack connection directly from the Settings page!

---

## 🚀 Step-by-Step Setup

### 1. Configure Slack App Scopes

Go to https://api.slack.com/apps and select your Bloom bot app:

1. **Navigate to:** `OAuth & Permissions` → `Scopes` → `Bot Token Scopes`
2. **Add ALL these scopes** (if not already added):
   ```
   app_mentions:read
   channels:history
   channels:read
   chat:write
   groups:history
   im:history
   im:read
   mpim:history
   users:read
   ```

3. **After adding scopes, you MUST reinstall the app** to your workspace:
   - Scroll to top of OAuth & Permissions page
   - Click "Reinstall to Workspace"
   - Authorize the new permissions

### 2. Copy Your Bot Token

1. Still on the `OAuth & Permissions` page
2. Find the **Bot User OAuth Token** (starts with `xoxb-`)
3. Copy it (you'll paste it in the Bloom dashboard)

### 3. Configure Event Subscriptions

1. **Go to:** `Event Subscriptions` in your Slack app settings
2. **Enable Events** (toggle on)
3. **Set Request URL:**
   ```
   https://your-production-domain.com/api/slack/events
   ```

   **For local testing with ngrok:**
   ```
   https://your-ngrok-url.ngrok.io/api/slack/events
   ```

   ⚠️ **Important:** Slack will send a verification challenge to this URL. Make sure:
   - Your app is running
   - The URL is publicly accessible
   - You've saved your bot token in Bloom settings FIRST

4. **Subscribe to bot events:**
   - Click "Subscribe to bot events"
   - Add these two events:
     - `app_mention` - When someone @mentions your bot
     - `message.im` - When someone DMs your bot

5. **Save Changes**

6. **Reinstall your app** (Slack will prompt you)

### 4. Get Your Signing Secret

1. **Go to:** `Basic Information` → `App Credentials`
2. Copy the **Signing Secret**

### 5. Configure Bloom Dashboard

1. **Open Bloom dashboard:** http://localhost:3000/dashboard/settings
2. **Paste your tokens:**
   - Bot User OAuth Token (from step 2)
   - Signing Secret (from step 4)
3. **Click "Save Settings"**
4. **Click "Test Slack Connection"** to verify it works

---

## ✅ Verification Checklist

Use this checklist to ensure everything is configured correctly:

- [ ] All 9 OAuth scopes added
- [ ] App reinstalled to workspace after adding scopes
- [ ] Bot token saved in Bloom settings
- [ ] Signing secret saved in Bloom settings
- [ ] Health check shows "✓ Connection Successful"
- [ ] Event Subscriptions enabled
- [ ] Request URL configured and verified
- [ ] `app_mention` event subscribed
- [ ] `message.im` event subscribed
- [ ] App reinstalled after event subscription changes
- [ ] Bot invited to at least one channel (type `/invite @Bloom` in a channel)

---

## 🧪 Testing Your Bot

### Test 1: Health Check
1. Go to Settings page
2. Click "Test Slack Connection"
3. Should show: ✓ Connection Successful with bot name and team info

### Test 2: Channel Mention
1. Invite bot to a channel: `/invite @Bloom`
2. Mention the bot: `@Bloom what is this?`
3. Bot should respond within a few seconds

### Test 3: Direct Message
1. Open DM with your bot
2. Send a message
3. Bot should respond

---

## 🐛 Troubleshooting

### Issue: Bot doesn't respond to @mentions

**Cause:** Missing `app_mentions:read` scope or `app_mention` event not subscribed

**Fix:**
1. Verify scope is added in OAuth & Permissions
2. Verify event is subscribed in Event Subscriptions
3. Reinstall app to workspace
4. Re-invite bot to the channel: `/invite @Bloom`

### Issue: Bot doesn't respond to DMs

**Cause:** Missing `im:history` scope or `message.im` event not subscribed

**Fix:**
1. Verify `im:history` and `im:read` scopes are added
2. Verify `message.im` event is subscribed
3. Reinstall app to workspace

### Issue: "Slack bot token not configured"

**Cause:** Token not saved in database

**Fix:**
1. Go to Settings page
2. Paste your `xoxb-...` token
3. Click "Save Settings"
4. Click "Test Slack Connection"

### Issue: "No brands found" error

**Cause:** No brand created in Bloom

**Fix:**
1. Go to Dashboard → Brands
2. Create at least one brand
3. The first brand is automatically set as default

### Issue: Request URL verification fails

**Possible causes:**
- App not running
- URL not publicly accessible
- Bot token not saved yet (the endpoint needs the token to respond)

**Fix:**
1. Make sure app is running
2. If testing locally, use ngrok: `ngrok http 3000`
3. Save bot token BEFORE setting Request URL
4. Try setting Request URL again

---

## 📊 Architecture Overview

```
Slack App
  ↓
  [Event: app_mention or message.im]
  ↓
POST /api/slack/events
  ↓
  [Verifies request, gets brand]
  ↓
runSlackAgent() → Claude Sonnet 4
  ↓
  [AI processes with tools: campaigns, influencers, metrics]
  ↓
Response posted back to Slack
```

**Tools available to bot:**
- `search_influencers` - Find creators
- `get_campaigns` - Query campaigns
- `get_contracts` - View contracts
- `calculate_metrics` - Compute performance
- `search_knowledge_documents` - Query uploaded docs

---

## 🔒 Security Notes

- Tokens are stored in PostgreSQL database (not in .env)
- Signing secret is used to verify requests from Slack
- Settings page masks tokens when displaying (shows only last 4 chars)
- Only update tokens when full token is entered (not masked value)

---

## 🎯 Next Steps

1. ✅ Complete the checklist above
2. ✅ Test the bot in a Slack channel
3. ✅ Create a brand in Bloom (if you haven't)
4. ✅ Optionally: Connect specific Slack channels to specific brands
5. ✅ Upload knowledge documents for the bot to reference

---

## Need Help?

If you're still having issues after following this guide:

1. Check the health check output in Settings
2. Check browser console for errors
3. Check server logs: `npm run dev` output
4. Verify all checklist items are complete

Good luck! 🚀
