# System Registry XML Format Guide

## ✅ UPDATE: DeltaV Native Format Now Supported!

The system now **automatically detects and supports** the native DeltaV System Registration export format!

If you see:
```
🔵 [SYSTEM REGISTRY] Detected DeltaV System Registration format
🔵 [SYSTEM REGISTRY] Found AutoData section
🔵 [SYSTEM REGISTRY] Found DeltaVSystem with keys: [ 'Workstation', 'Controller', ... ]
```

**You're good!** Just make sure the XML doesn't have character entity errors (see below).

## The Problem You Might Be Seeing

If your XML import shows:
```
Root keys: [ 'item' ]
Using root element with keys: [ 'item' ]
Stats: all 0s
```

This means your XML has **generic `<item>` elements** instead of the **named elements** the system expects.

## What Your XML Probably Looks Like

```xml
<root>
  <item>
    <Name>WS-001</Name>
    <Model>Dell</Model>
    <!-- workstation fields -->
  </item>
  <item>
    <Name>CTRL-001</Name>
    <Model>VE3007</Model>
    <!-- controller fields -->
  </item>
</root>
```

## What The System Expects

The system now supports **TWO formats**:

### Format 1: Simple Export (sample file format)
```xml
<Export>
  <Workstation>
    <Name>WS-001</Name>
    <Model>Dell</Model>
    <!-- workstation fields -->
  </Workstation>
  
  <Controller>
    <Name>CTRL-001</Name>
    <Model>VE3007</Model>
    <!-- controller fields -->
  </Controller>
</Export>
```

### Format 2: DeltaV System Registration (native export format) ✅ RECOMMENDED
```xml
<registration>
  <UserInfo>...</UserInfo>
  <AutoData>
    <DeltaVSystem>
      <Workstation>...</Workstation>
      <Controller>...</Controller>
      <SmartSwitch>...</SmartSwitch>
      <CharmsIOCard>
        <Charm>...</Charm>
      </CharmsIOCard>
    </DeltaVSystem>
    
    <IOBusDevices>
      <IODevice>...</IODevice>
    </IOBusDevices>
    
    <AMSSystem>
      <SoftwareRevision>...</SoftwareRevision>
    </AMSSystem>
  </AutoData>
</registration>
```

## Required Element Names (Case-Sensitive!)

The XML **must use these exact element names**:

| Element Name | What It's For |
|-------------|---------------|
| `<Workstation>` | Workstation records |
| `<Controller>` | Controller records |
| `<SmartSwitch>` | Smart Switch records |
| `<IODevice>` | I/O Device records |
| `<CharmsIOCard>` | Charms I/O Card records |
| `<Charm>` | Charm records |
| `<AMSSystem>` | AMS System record |

**Note:** These are case-sensitive! `<workstation>` or `<WORKSTATION>` won't work.

## How to Export from DeltaV

### ✅ The Right Way (Native System Registration Export)

1. Open **DeltaV Explorer**
2. Go to **Diagnostics** → **System Registry**
3. Click **Export** or **Save As XML**
4. Save the file (it will be named something like `SYS_REGISTRATION.xml`)
5. This file is **ready to import** - the system will automatically detect the format!

The native export structure looks like:
- `<registration>` (root)
  - `<AutoData>`
    - `<DeltaVSystem>` (Workstations, Controllers, Switches, CharmsIOCards)
    - `<IOBusDevices>` (IODevices)
    - `<AMSSystem>` (AMS version info)

### Alternative: System Configuration Studio Export
1. Open DeltaV System Configuration Studio
2. Go to **Tools** → **Reports** → **System Registry**
3. Select the equipment types you want to export
4. Choose **XML format** (not CSV)
5. Make sure "Include element names" or similar option is checked
6. Export to file

### Option 2: Manual XML Transformation

If you already have a CSV or generic XML export, you'll need to transform it. Here's a Python script to help:

```python
import xml.etree.ElementTree as ET

# Read your generic XML
tree = ET.parse('your-export.xml')
root = tree.getroot()

# Create new root
new_root = ET.Element('Export')

# Transform each item based on its fields
for item in root.findall('item'):
    # Determine type based on fields present
    if item.find('OSName') is not None:
        # It's a workstation
        ws = ET.SubElement(new_root, 'Workstation')
        for child in item:
            ws.append(child)
    elif item.find('ControllerFreeMemory') is not None:
        # It's a controller
        ctrl = ET.SubElement(new_root, 'Controller')
        for child in item:
            ctrl.append(child)
    # Add more conditions for other types...

# Write transformed XML
new_tree = ET.ElementTree(new_root)
new_tree.write('system-registry-formatted.xml', encoding='utf-8', xml_declaration=True)
```

## Complete Example (from sample file)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Export>
  <!-- Workstations -->
  <Workstation>
    <Name>WS-APPSERVER01</Name>
    <Model>Dell Precision</Model>
    <Type>Application Server</Type>
    <Redundant>No</Redundant>
    <SoftwareRevision>14.3.1</SoftwareRevision>
    <DVHotFixes>HF-2023-001, HF-2023-005, HF-2024-002</DVHotFixes>
    <OSName>Windows Server 2019</OSName>
    <MSOfficeInstalled>Yes</MSOfficeInstalled>
    <TerminalServer>No</TerminalServer>
    <DomainController>No</DomainController>
    <IDDC>No</IDDC>
    <DellServiceTagNumber>5CD2345</DellServiceTagNumber>
    <ComputerModel>Precision 5820 Tower</ComputerModel>
    <BIOSVersion>2.15.0</BIOSVersion>
    <Memory>64 GB</Memory>
  </Workstation>
  
  <!-- Controllers -->
  <Controller>
    <Name>MD-CTRL-001</Name>
    <Model>VE3007</Model>
    <SoftwareRevision>15.1.1 LNP1</SoftwareRevision>
    <HardwareRevision>2</HardwareRevision>
    <SerialNumber>K245060181</SerialNumber>
    <ControllerFreeMemory>524288000</ControllerFreeMemory>
    <Redundant>Yes</Redundant>
    <PartnerModel>VE3007</PartnerModel>
    <PartnerSoftwareRevision>15.1.1 LNP1</PartnerSoftwareRevision>
    <PartnerHardwareRevision>2</PartnerHardwareRevision>
    <PartnerSerialNumber>K245060182</PartnerSerialNumber>
  </Controller>
  
  <!-- Smart Switches -->
  <SmartSwitch>
    <Name>SWITCH-CAB-001</Name>
    <Model>SE4008</Model>
    <SoftwareRevision>2.5.0</SoftwareRevision>
    <HardwareRevision>1</HardwareRevision>
    <SerialNumber>SW8800123</SerialNumber>
  </SmartSwitch>
  
  <!-- I/O Devices -->
  <IODevice>
    <BusType>Ethernet</BusType>
    <DeviceType>AI</DeviceType>
    <Node>MD-CTRL-001</Node>
    <Card>1</Card>
    <DeviceName>TT-101</DeviceName>
    <Channel>1</Channel>
  </IODevice>
  
  <!-- Add more records as needed -->
</Export>
```

## Field Names for Each Type

### Workstation Fields
- `Name` (required)
- `Model`, `Type`, `Redundant`
- `SoftwareRevision`, `DVHotFixes`
- `OSName`, `MSOfficeInstalled`
- `TerminalServer`, `DomainController`, `IDDC`
- `DellServiceTagNumber`, `ComputerModel`
- `BIOSVersion`, `Memory`

### Controller Fields
- `Name` (required)
- `Model`, `SoftwareRevision`, `HardwareRevision`, `SerialNumber`
- `ControllerFreeMemory` (in bytes)
- `Redundant`
- `PartnerModel`, `PartnerSoftwareRevision`, `PartnerHardwareRevision`, `PartnerSerialNumber`

### SmartSwitch Fields
- `Name` (required)
- `Model`, `SoftwareRevision`, `HardwareRevision`, `SerialNumber`

### IODevice Fields
- `BusType`, `DeviceType`
- `Node`, `Card`, `DeviceName`, `Channel`

### CharmsIOCard Fields
- `Name` (required)
- `Model`, `SoftwareRevision`, `HardwareRevision`, `SerialNumber`
- `Redundant`
- `PartnerModel`, `PartnerSoftwareRevision`, `PartnerHardwareRevision`, `PartnerSerialNumber`

### Charm Fields
- `Name` (required)
- `Model`, `SoftwareRevision`, `HardwareRevision`, `SerialNumber`

### AMSSystem Fields
- `SoftwareRevision`

## Quick Test

Use the provided `sample-system-registry.xml` file to test that the import is working:

1. Go to customer profile
2. Click "📋 Import System Reg"
3. Upload `sample-system-registry.xml`
4. Should see: "Successfully imported: 3 workstations, 3 controllers, 3 smart switches..."

If the sample works but your file doesn't, it's a **format issue** with your XML.

## Troubleshooting Your XML

### Check 1: Root Element
Your XML should have a root element (any name is fine):
```xml
<Export>
  <!-- content here -->
</Export>
```
or
```xml
<System>
  <!-- content here -->
</System>
```

### Check 2: Direct Children Must Be Named Elements
```xml
<!-- ✅ CORRECT -->
<Export>
  <Workstation>...</Workstation>
  <Controller>...</Controller>
</Export>

<!-- ❌ WRONG -->
<Export>
  <item>...</item>
  <item>...</item>
</Export>
```

### Check 3: Element Names Are Case-Sensitive
```xml
<!-- ✅ CORRECT -->
<Workstation>

<!-- ❌ WRONG -->
<workstation>
<WORKSTATION>
<WorkStation>
```

## Console Output to Check

After importing, check the server console for:

```bash
# Good - data found
🔵 [SYSTEM REGISTRY] Available table names: [ 'Workstation', 'Controller', 'SmartSwitch' ]
🔵 [SYSTEM REGISTRY] Processing 3 workstations

# Bad - no data found
⚠️ [SYSTEM REGISTRY] Available table names: []
⚠️ [SYSTEM REGISTRY] No data was imported!
⚠️ [SYSTEM REGISTRY] Expected: Workstation, Controller, SmartSwitch, IODevice, CharmsIOCard, Charm, AMSSystem
⚠️ [SYSTEM REGISTRY] Found keys: [ 'item' ]
```

## Need Help?

If you're still having trouble:

1. **Share your XML structure** - just the first few lines showing element names
2. **Check the sample file** at `sample-system-registry.xml`
3. **Use the debugging output** in the server console to see what was found
4. **Try the sample file first** to verify the system is working

## Converting DeltaV Export Formats

If you have a DeltaV export that uses different format, you may need to:

1. Open in Excel or text editor
2. Use find/replace to change `<item>` to appropriate names
3. Or use XSLT transformation
4. Or write a simple script to reformat

Example find/replace pattern in a text editor:
- Find: `<item>` (at start of workstation records)
- Replace with: `<Workstation>`
- Find: `</item>` (at end of workstation records)
- Replace with: `</Workstation>`
- Repeat for each record type

The key is that each record type needs its own distinct XML element name!
