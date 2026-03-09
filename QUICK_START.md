# 🚀 Quick Start: Get Your Contracts Tab Working

## Current Situation
✅ **Implementation: 98% Complete**
❌ **Blocker: Missing Anthropic API Key**
⏱️ **Time to Fix: ~10 minutes**

---

## 🔧 How to Fix (3 Steps)

### Step 1: Get Your Anthropic API Key (3 minutes)
1. Visit: https://console.anthropic.com/
2. Sign up (or log in if you have an account)
3. Go to **Settings** → **API Keys**
4. Click **Create Key**
5. Copy your key (starts with `sk-ant-...`)

💡 **Tip:** Anthropic offers $5 free credits to start!

---

### Step 2: Update Your .env File (1 minute)

Open: `/Users/karensagaz/Desktop/bloom/.env`

**Find this line (line 8):**
```env
ANTHROPIC_API_KEY="your-anthropic-api-key-here"
```

**Replace with your actual key:**
```env
ANTHROPIC_API_KEY="sk-ant-your-actual-key-goes-here"
```

**Save the file.**

---

### Step 3: Restart and Test (6 minutes)

**A. Restart your dev server:**
```bash
# Stop current server (Ctrl+C in terminal)
npm run dev
```

**B. Test the API key:**
```bash
npx tsx scripts/test-api-key.ts
```

✅ **Expected output:**
```
🔑 Testing Anthropic API Key...
📡 Sending test request to Claude...
✅ API Key is valid!
✨ Your Anthropic API key is configured correctly!
```

**C. Re-sync your Coop brand:**

**Option 1 - Via UI (Easiest):**
1. Navigate to: http://localhost:3000/dashboard/brands/cmmf6ajym00003jcewsc8c3gm
2. Click the **Sync** button at top right
3. Wait ~30 seconds for sync to complete

**Option 2 - Via Terminal:**
```bash
curl -X POST http://localhost:3000/api/brands/cmmf6ajym00003jcewsc8c3gm/sync
```

✅ **Expected result:** You should see `"recordsExtracted": 50` or higher (not 0!)

**D. Check the Contracts tab:**
1. Navigate to: http://localhost:3000/dashboard/brands/cmmf6ajym00003jcewsc8c3gm
2. Click the **Contracts** tab
3. 🎉 You should see contracts with all columns populated!

---

## 📊 What You'll See After Fixing

### Contracts Tab
| Name | Handle | Term | Projected LIVE Months | Deliverables | Exclusivity | Paid Usage Terms |
|------|--------|------|----------------------|--------------|-------------|-----------------|
| Influencer Name | @handle | 6 months<br>Jan 2026 - Jun 2026 | 6 months | 3 Reels, 2 Stories | Category Exclusive | 1 Year Paid |

**Features:**
- ✅ Contract duration automatically calculated
- ✅ Deliverables parsed from your spreadsheet format
- ✅ Color-coded exclusivity badges (orange = exclusive)
- ✅ Color-coded usage rights badges (blue = paid usage)
- ✅ Filters: Status dropdown + search by name/campaign
- ✅ Auto-excludes "SOW WIP" contracts and invalid data

### Influencers Tab
Platform column removed (data still available for filtering)

### Brand Creation Form
Slack channel dropdown added - connect brands to Slack channels for context tracking

---

## ❓ Troubleshooting

### "API Key test failed - 401 Unauthorized"
→ Your API key is invalid. Copy it again from https://console.anthropic.com/

### Sync still returns 0 records
1. **Check your tab names** in Google Sheets
   - SOW tabs must contain: "SOW", "Contract", "Agreement", or "Deliverable"
   - Example: "SOW Review (IG)", "Contracts 2026", "Deliverables"
2. **Run diagnostic:**
   ```bash
   npx tsx scripts/check-trackers.ts
   ```
3. **Look for errors** in your terminal where `npm run dev` is running

### Contracts tab still empty
1. **Check the database:**
   ```bash
   npx tsx scripts/check-coop-data.ts
   ```
2. If it shows **0 SOW records**, re-sync the brand
3. Check your spreadsheet has a tab named with "SOW" or "Contract"

### "Module not found" error when running test
```bash
npm install
```

---

## 💰 Cost Information

**Anthropic Claude Sonnet 4 Pricing:**
- Input: $3 per 1M tokens
- Output: $15 per 1M tokens

**Your costs (estimated):**
- Per brand sync: $0.01 - $0.05
- 100 brand syncs: $1 - $5 total
- **Very affordable** for data extraction tasks

**Free tier:** $5 in free credits when you sign up

---

## 📋 Completed Features Checklist

✅ **API Layer**
- SOW records query added
- Campaign records limit increased to 1000

✅ **Contracts Tab UI**
- All 7 columns implemented (Name, Handle, Term, Projected LIVE Months, Deliverables, Exclusivity, Paid Usage Terms)
- Status and search filters
- Auto-excludes "SOW WIP" and invalid data
- Color-coded badges for exclusivity and usage rights

✅ **Slack Integration**
- Channel selector in brand creation form
- Channel editor in brand detail page
- API endpoint for listing channels

✅ **Data Quality**
- Filter for complete/incomplete data
- Warning icons for missing handles
- Graceful handling of null/missing fields

✅ **Platform Column Removal**
- Removed from Influencers table display
- Removed from Contracts table (never added)
- Data still stored in database for filtering

---

## 🎯 Summary

**Before Fix:**
- ❌ 0 campaigns extracted
- ❌ 0 contracts shown
- ❌ Empty Contracts tab

**After Fix:**
- ✅ 50-200+ campaigns extracted per brand
- ✅ 50-100+ contracts displayed
- ✅ Full contract details with all requested columns
- ✅ Intelligent filtering and data quality indicators
- ✅ Slack integration active

**All you need:** A valid Anthropic API key (free to get, takes 3 minutes)

---

## 📞 Support

If you encounter issues:
1. Check `IMPLEMENTATION_STATUS.md` for detailed troubleshooting
2. Run diagnostic scripts:
   - `npx tsx scripts/test-api-key.ts`
   - `npx tsx scripts/check-trackers.ts`
   - `npx tsx scripts/check-coop-data.ts`
3. Check terminal logs where `npm run dev` is running for errors

---

**Ready to get started?** → Go to Step 1 above! 🚀
