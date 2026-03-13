# SKILL CARD: Reading a Campaign Tracker

**Load this when:** Any question involves campaign data, influencer performance, spend, or tracker records.

---

## GOLDEN RULES — Read These First

1. **Never invent data.** If a field is blank, say so. Do not guess or extrapolate a value.
2. **Blank ≠ zero.** A blank deal value is not $0. A blank status is not "cancelled". Treat blank as unknown.
3. **Always count what you actually have.** If 97 rows exist but only 12 have a status filled in, say "12 of 97 records have a status populated."
4. **Partial data is still useful.** Answer what you can from available data, and clearly flag what's missing.
5. **Name matching is fuzzy.** "Drew Muxlow", "D. Muxlow", and "@drewmuxlow" may be the same person — flag this when counting.

---

## Step 1 — Read the Structure First

Before answering any question, mentally scan:
- What tabs exist, and what does each contain?
- What are the column headers in each tab?
- How many rows have data vs. how many are blank/placeholder rows?

Do not skip this step. Do not assume column names.

---

## Step 2 — Map Columns to Concepts

Match each column to a known concept. If a name is unfamiliar, infer from context and flag your interpretation.

| Concept | Common column name variations |
|---|---|
| Creator name | `Creator`, `Influencer`, `Handle`, `Talent`, `Name`, `Partner` |
| Platform | `Platform`, `Channel`, `Network`, `Social`, `Media` |
| Follower count | `Followers`, `Audience Size`, `Following`, `Subs`, `Reach` |
| Engagement rate | `ER`, `Eng. Rate`, `Engagement %`, `Engagement Rate` |
| Views / Reach | `Views`, `Reach`, `Impressions`, `Exposure` |
| Post date | `Date`, `Post Date`, `Published`, `Go Live Date`, `Live Date` |
| Deliverable | `Deliverable`, `Content Type`, `Format`, `Post Type`, `Asset Type` |
| Campaign status | `Status`, `Stage`, `Progress`, `State`, `Campaign Status` |
| Creator rate / deal value | `Rate`, `Fee`, `Cost`, `Price`, `Compensation`, `Deal Value`, `$ Value` |
| Offer / Negotiation | `Offer`, `Negotiated Rate`, `Counter`, `Deal`, `Proposed` |
| Contract / Agreement | `Contract`, `Agreement`, `Signed`, `Approved`, `SOW` |
| Budget | `Budget`, `Total Budget`, `Allocated`, `Spend`, `Investment` |
| Spent | `Spent`, `Actual Spend`, `Used`, `Paid`, `Invoiced` |
| Remaining | `Remaining`, `Balance`, `Left`, `Available` |
| Booking type | `New`, `Renewal`, `Rebook`, `Returning`, `Type` |
| Notes | `Notes`, `Comments`, `Internal Notes`, `Flag`, `Memo` |

---

## Step 3 — Identify Tab Roles

| Tab concept | What it typically contains |
|---|---|
| Campaign Tracker | Creator names, deliverables, post dates, status, deal values |
| SOW / Statement of Work | Offers, negotiation history, agreed rates, creator demographics |
| SOW Review | Influencer roster, deliverables per creator, rate history |
| Contracts | Signed agreements, terms, exclusivity, usage rights |
| Dashboard | Brand budget totals, spend breakdown, budget splits by platform |
| Roster / Master List | Canonical list of creator names, handles, platforms |

---

## Step 4 — Handle Blank and Sparse Data Correctly

This is the most common source of inaccuracy. Follow these rules strictly:

**When a field is blank:**
- Do NOT assume a default value
- Report: "X of Y records have [field] populated"
- Example: "Only 12 of 97 records have a status filled in — I can only report on those 12"

**When creator name is missing from some rows:**
- Do not skip the row silently
- Report: "Several rows are missing creator names and can't be attributed"
- Example: "I can see a $21,400 deal on Meta/TikTok/Google but the creator name field is blank in that row"

**When calculating totals or rates:**
- Only include rows where the relevant field is actually populated
- State clearly how many rows were included vs. excluded
- Example: "Total spend: $142,000 across 34 rows with deal values. 63 rows had no deal value filled in."

**When calculating repeat bookings:**
- You need BOTH years of data to compare. If only one year is synced, say so.
- Do not estimate repeat rate from a single year's data
- Example: "I can see Collette Stohler appears twice in 2026, but I can't confirm multi-year rebooking without 2024/2025 tracker data"

---

## Step 5 — Confidence Calibration

Always end with a confidence note that reflects actual data quality:

| Situation | Confidence | What to say |
|---|---|---|
| Field fully populated, recently synced | 85–100% | Report directly |
| Field partially populated (>50% rows) | 60–84% | Report with count of included rows |
| Field sparsely populated (<50% rows) | 40–59% | Flag clearly, report what you have |
| Field entirely blank | 0% | Say it's unavailable, suggest next step |
| Only one year of data for multi-year question | 30–50% | Explain the gap, ask if prior trackers can be synced |

---

## Step 6 — Flag Ambiguity, Always

Never skip a column you can't identify. Always tell the user:
- What you found
- Your best interpretation
- That you'd like confirmation before relying on it

**Example:** "I found a column called 'Val.' — I'm interpreting this as deal value, but want to flag this in case it means something else in your tracker."
