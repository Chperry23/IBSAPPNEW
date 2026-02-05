# Fix Charms UNIQUE Constraint Issue

## The Problem

You're seeing errors like:
```
Error: SQLITE_CONSTRAINT: UNIQUE constraint failed: sys_charms.customer_id, sys_charms.name
```

This happens because:
1. **Duplicate charm names exist across different CIOCs** (e.g., "CHRM-01" appears in CIOC-1, CIOC-2, etc.)
2. **Old database has a UNIQUE constraint** that prevents duplicate names
3. **You have 1,152 charms but only 96 are importing** (the first 96 before hitting duplicates)

## Quick Fix - Use the UI Button (Easiest!)

1. Go to **System Registry** page for your customer
2. Click the **"🔧 Fix Charms Table"** button at the top
3. Confirm the operation
4. **Re-import your system registry XML**
5. You should now see all 1,152 charms properly grouped by CIOC!

## Alternative - Run Migration Script

If you prefer command line:

```bash
cd "C:\IBS APP"
node backend/scripts/migrate-charms-table.js
```

Then restart your server and re-import the XML.

## What This Does

The fix:
- ✅ **Drops** the old `sys_charms` table with the problematic constraint
- ✅ **Recreates** the table without the UNIQUE constraint on name
- ✅ **Allows** duplicate charm names as long as they're in different CIOCs
- ✅ **Adds** `charms_io_card_name` column to track which CIOC each charm belongs to

## After Fixing

When you re-import, you'll see:
```
🔵 [SYSTEM REGISTRY] Cleared existing Charms for fresh import
🔵 [SYSTEM REGISTRY] Found 96 nested Charms in CIOC-1
🔵 [SYSTEM REGISTRY] Found 96 nested Charms in CIOC-2
🔵 [SYSTEM REGISTRY] Found 96 nested Charms in CIOC-3
... (all 12 CIOCs)
✅ Stats: { "charms": 1152 }
```

And in the **Charms tab**, you'll see all charms grouped by CIOC:

```
📟 CIOC-1
96 Charms
[table with all charms]

📟 CIOC-2
96 Charms
[table with all charms]

... (all 12 CIOCs)
```

## Why This Happened

The original table design assumed charm names would be globally unique per customer. However, in DeltaV systems, **charm names are only unique within a CIOC**, not across the entire system. Multiple CIOCs can have charms with the same name (like CHRM-01, CHRM-02, etc.).

The fix removes the global uniqueness constraint and instead tracks which CIOC each charm belongs to.

## Steps Summary

1. Click **"🔧 Fix Charms Table"** button
2. Or run: `node backend/scripts/migrate-charms-table.js`
3. **Re-import your XML file**
4. All 1,152 charms will now import correctly!

No data loss - just re-import and you're good! 🎉
