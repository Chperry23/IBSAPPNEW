# System Registry → Nodes Sync Guide

## 🎯 Overview

The System Registry import now **replaces CSV node imports**. Instead of manually importing node data via CSV, you can:

1. Import XML System Registry data (from DeltaV export)
2. Click "**Sync to Nodes**" to automatically populate/update your Nodes table
3. Use enhanced I/O error diagnostics with device names and types

---

## 📊 How It Works

### Step 1: Import System Registry

1. Go to **Customer Profile** → Click **"📋 Import System Reg"**
2. Upload or paste your DeltaV System Registration XML
3. Data is stored in these tables:
   - `sys_workstations`
   - `sys_controllers`
   - `sys_smart_switches`
   - `sys_charms_io_cards`
   - `sys_charms`
   - `sys_io_devices`
   - `sys_ams_systems`

### Step 2: Sync to Nodes

1. Go to **Customer Profile** → Click **"👁️ View System Reg"**
2. Click **"🔄 Sync to Nodes"** button (top right)
3. System will:
   - ✅ Create new nodes for all equipment
   - ✅ Update existing nodes with latest data
   - ✅ Create redundant partner nodes automatically
   - ✅ Link all data to customer

### Step 3: Use in PM Sessions

All synced nodes are now available in PM sessions:
- **Node Maintenance** tab shows all nodes
- **Diagnostics** tab can link errors to specific I/O devices
- Accurate serial numbers, firmware versions, models
- Redundancy information automatically tracked

---

## 🔗 Field Mapping

### System Registry → Nodes

| System Registry Field | Nodes Table Field | Notes |
|----------------------|-------------------|-------|
| `name` | `node_name` | Primary identifier |
| `model` | `model` + `node_type` | Used for both fields |
| `software_revision` | `firmware` | DeltaV/FW version |
| `hardware_revision` | `version` | Hardware version |
| `serial_number` | `serial` | Serial number |
| `redundant` | `redundant` | Yes/No |
| `os_name` | `os_name` | Workstations only |
| `bios_version` | `bios_version` | Workstations only |
| `controller_free_memory` | `description` | Controllers only |

### Node Types Created

The sync creates nodes for all these types:

1. **Workstations** (from `sys_workstations`)
   - Type: "Workstation"
   - Includes OS, BIOS, memory info

2. **Controllers** (from `sys_controllers`)
   - Type: "Controller" or specific model
   - Includes free memory
   - **Auto-creates partner node** if redundant

3. **Smart Switches** (from `sys_smart_switches`)
   - Type: "Smart Switch" or specific model
   - Network equipment

4. **Charms I/O Cards** (from `sys_charms_io_cards`)
   - Type: "Charms I/O Card" or specific model
   - **Auto-creates partner node** if redundant

5. **Charms** (from `sys_charms`)
   - Type: "Charm Module" or specific model
   - Linked to parent CIOC

---

## 🎮 Enhanced I/O Error Diagnostics

### What's Better Now?

The System Registry provides **I/O device mapping** that makes error tracking more powerful:

#### Before (CSV Import):
```
Controller: CIOC-1
Card: 34
Channel: 13
Error: BAD
Description: "Component failure"
```

#### After (System Reg):
```
Controller: CIOC-1
Card: 34
Channel: 13
Device Name: TT-101 (Temperature Transmitter)
Bus Type: Foundation Fieldbus
Device Type: Analog Input
Error: BAD
Description: "TT-101 signal failure - check wiring"
```

### How to Use Enhanced Diagnostics

**API Endpoint Available:**
```
GET /api/customers/:customerId/system-registry/io-devices/:controllerName/:cardNumber/:channelNumber
```

Returns:
```json
{
  "success": true,
  "device": {
    "device_name": "TT-101",
    "bus_type": "Foundation Fieldbus",
    "device_type": "Analog Input",
    "full_path": "CIOC-1/34/13",
    "description": "Analog Input on Foundation Fieldbus - TT-101"
  }
}
```

### Future Enhancement Ideas

1. **Auto-populate device names** when adding I/O errors
2. **Show device type icons** in error list
3. **Filter errors by bus type** (FF, HART, etc.)
4. **Link to P&ID drawings** based on device name
5. **Historical error tracking** per device

---

## 🚀 Workflow Example

### Complete PM Session with System Reg

1. **Before the PM:**
   ```
   → Import System Registry XML (one-time per customer)
   → Click "Sync to Nodes" (updates nodes table)
   → Create new PM session
   ```

2. **During the PM:**
   ```
   → Node Maintenance tab: All nodes pre-populated from System Reg
   → Add I/O errors: Device names available from sys_io_devices
   → Cabinet inspection: Controllers list matches System Reg
   ```

3. **After the PM:**
   ```
   → Export PDF: Shows accurate serial numbers, models, versions
   → I/O Error report: Includes device names and bus types
   → Data syncs to master: All node info preserved
   ```

---

## 📋 Sync Statistics

When you click "Sync to Nodes", you'll see a summary:

```
✅ Synced 250 nodes (120 created, 130 updated)

Breakdown:
- Workstations: 15
- Controllers: 25
- Smart Switches: 10
- Charms I/O Cards: 12
```

---

## ⚠️ Important Notes

1. **Sync is Idempotent**: You can run "Sync to Nodes" multiple times safely. It will:
   - Create new nodes if they don't exist
   - Update existing nodes with latest data
   - Never create duplicates (matches on `customer_id` + `node_name`)

2. **Redundant Partners**: If a controller/CIOC is redundant:
   - Primary node: `CIOC-1`
   - Partner node: `CIOC-1-partner` (auto-created)

3. **Charms Not Synced**: The 1000+ charm modules are NOT synced to nodes (too many).
   - Charms are still available in System Registry view
   - Only parent CIOCs are synced as nodes

4. **Updates Don't Delete**: Sync only creates/updates, never deletes nodes.
   - If you delete System Reg data, nodes remain
   - Manually delete nodes if needed

---

## 🔧 Technical Details

### Backend Routes

**Sync Endpoint:**
- `POST /api/customers/:customerId/system-registry/sync-to-nodes`
- Requires authentication
- Creates/updates nodes from all System Reg tables

**I/O Device Lookup:**
- `GET /api/customers/:customerId/system-registry/io-devices/:controllerName/:cardNumber/:channelNumber`
- Returns device info for specific I/O point
- Used for enhanced diagnostics

**Controller Devices:**
- `GET /api/customers/:customerId/system-registry/io-devices/controller/:controllerName`
- Returns all I/O devices for a controller
- Sorted by card and channel

### Database Schema

**No Changes to `nodes` Table:**
- All existing fields used as-is
- Perfect 1:1 mapping from System Reg data
- Sync columns (`synced=0`) trigger cloud upload

**System Reg Tables Remain:**
- `sys_*` tables keep full original data
- `nodes` table gets simplified subset
- Best of both: detailed archive + usable node list

---

## 🎓 Migration from CSV

### Old Way (CSV Import):
1. Export nodes from DeltaV to CSV
2. Clean up CSV formatting
3. Import CSV → nodes table
4. Repeat for every customer update

### New Way (System Reg):
1. Export System Registration from DeltaV (one XML file)
2. Import XML → System Registry tables
3. Click "Sync to Nodes"
4. Done! ✅

**Advantages:**
- ✅ More data (I/O devices, charms, AMS info)
- ✅ No CSV formatting issues
- ✅ One-click sync instead of manual import
- ✅ Redundant partners auto-created
- ✅ Serial numbers, firmware versions accurate
- ✅ Enhanced diagnostics with device names

---

## 📝 Next Steps

1. **Try it now**: Import a System Reg XML and click "Sync to Nodes"
2. **Verify nodes**: Check Customer → Nodes tab to see all equipment
3. **Create PM session**: Nodes will auto-populate in maintenance tab
4. **Add I/O errors**: (Future) See device names auto-populate
5. **Export PDF**: See improved equipment details in report

---

## 💡 Future Enhancements

Planned features using this new System Reg data:

1. **Smart I/O Error Entry:**
   - Select controller → See all cards → See all channels
   - Auto-show device name and type
   - Pre-fill error description based on device type

2. **Device Health Dashboard:**
   - Show all I/O devices with error history
   - Filter by bus type, device type, location
   - Identify problematic devices across sessions

3. **Automated Reports:**
   - "Show all FF devices with errors in last 6 months"
   - "List all controllers with low free memory"
   - "Find all devices due for calibration"

4. **Cabinet Auto-Assignment:**
   - Link controllers to cabinets automatically
   - Use System Reg location data
   - Pre-populate cabinet inspection forms

---

**Questions?** Check `SYSTEM-REGISTRY-IMPORT.md` for XML import details.
