# System Registry XML Import Feature

## Overview
This feature allows importing DeltaV system registry data from XML files into the local SQLite database. The data is stored separately from the regular nodes table and can be synced to MongoDB for long-term storage on the main server.

## Database Tables Created

### 1. sys_workstations
Stores workstation information from the system registry.

**Fields:**
- Name, Model, Type, Redundant, SoftwareRevision
- DVHotFixes (stored as TEXT, can be parsed later)
- OSName, MSOfficeInstalled, TerminalServer, DomainController
- IDDC, DellServiceTagNumber, ComputerModel, BIOSVersion, Memory

### 2. sys_smart_switches
Stores smart switch information.

**Fields:**
- Name, Model, SoftwareRevision, HardwareRevision, SerialNumber

### 3. sys_io_devices
Stores I/O device information.

**Fields:**
- BusType, DeviceType, Node, Card, DeviceName (DST), Channel

### 4. sys_controllers
Stores controller information with redundancy details.

**Fields:**
- Name, Model, SoftwareRevision, HardwareRevision, SerialNumber
- ControllerFreeMemory (in bytes, can be converted)
- Redundant, PartnerModel, PartnerSoftwareRevision
- PartnerHardwareRevision, PartnerSerialNumber

### 5. sys_charms_io_cards
Stores Charms I/O card information with redundancy.

**Fields:**
- Name, Model, SoftwareRevision, HardwareRevision, SerialNumber
- Redundant, PartnerModel, PartnerSoftwareRevision
- PartnerHardwareRevision, PartnerSerialNumber

### 6. sys_charms
Stores Charm information.

**Fields:**
- Name, Model, SoftwareRevision, HardwareRevision, SerialNumber

### 7. sys_ams_systems
Stores AMS system information (one per customer).

**Fields:**
- SoftwareRevision

## How to Use

### 1. Access the Import Feature
1. Navigate to a customer's detail page
2. Click the "📋 Import System Reg" button in the Quick Actions section

### 2. Import XML Data
You have two options:

**Option A: Upload XML File**
1. Click "Choose File" and select your XML export file
2. Click "📋 Import System Registry"

**Option B: Paste XML Data**
1. Copy your XML data
2. Paste it into the text area
3. Click "📋 Import System Registry"

### 3. View Import Results
After import, the system will display:
- Number of workstations imported
- Number of controllers imported
- Number of smart switches imported
- Number of I/O devices imported
- Number of Charms I/O cards imported
- Number of Charms imported
- Number of AMS systems imported

### 4. View Summary
The Statistics card on the customer profile will show:
- Total workstations
- Total controllers
- Total smart switches

## XML Format Expected

The XML should have a root element (Export, System, or similar) containing child elements for each table:

```xml
<?xml version="1.0"?>
<Export>
  <Workstation>
    <Name>WS-001</Name>
    <Model>Dell</Model>
    <Type>Professional</Type>
    <Redundant>No</Redundant>
    <SoftwareRevision>14.3.1</SoftwareRevision>
    <DVHotFixes>HF123, HF124</DVHotFixes>
    <OSName>Windows 10</OSName>
    <MSOfficeInstalled>Yes</MSOfficeInstalled>
    <TerminalServer>No</TerminalServer>
    <DomainController>No</DomainController>
    <IDDC>No</IDDC>
    <DellServiceTagNumber>ABC123</DellServiceTagNumber>
    <ComputerModel>Precision 5820</ComputerModel>
    <BIOSVersion>2.15.0</BIOSVersion>
    <Memory>32 GB</Memory>
  </Workstation>
  
  <Controller>
    <Name>CTRL-001</Name>
    <Model>VE3007</Model>
    <SoftwareRevision>15.1.1</SoftwareRevision>
    <HardwareRevision>2</HardwareRevision>
    <SerialNumber>K245060181</SerialNumber>
    <ControllerFreeMemory>524288000</ControllerFreeMemory>
    <Redundant>Yes</Redundant>
    <PartnerModel>VE3007</PartnerModel>
    <PartnerSoftwareRevision>15.1.1</PartnerSoftwareRevision>
    <PartnerHardwareRevision>2</PartnerHardwareRevision>
    <PartnerSerialNumber>K245060182</PartnerSerialNumber>
  </Controller>
  
  <!-- Similar for SmartSwitch, IODevice, CharmsIOCard, Charm, AMSSystem -->
</Export>
```

## API Endpoints

### POST `/api/customers/:customerId/system-registry/import`
Import system registry from XML data.

**Request Body:**
```json
{
  "xmlData": "<?xml version=\"1.0\"?>..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "System registry imported successfully",
  "stats": {
    "workstations": 5,
    "smartSwitches": 2,
    "ioDevices": 150,
    "controllers": 10,
    "charmsIOCards": 3,
    "charms": 8,
    "amsSystems": 1
  }
}
```

### GET `/api/customers/:customerId/system-registry/summary`
Get summary of system registry data for a customer.

**Response:**
```json
{
  "workstations": 5,
  "smartSwitches": 2,
  "ioDevices": 150,
  "controllers": 10,
  "charmsIOCards": 3,
  "charms": 8,
  "amsSystems": 1
}
```

### GET `/api/customers/:customerId/system-registry/workstations`
Get all workstations for a customer.

### GET `/api/customers/:customerId/system-registry/controllers`
Get all controllers for a customer.

### GET `/api/customers/:customerId/system-registry/switches`
Get all smart switches for a customer.

### DELETE `/api/customers/:customerId/system-registry`
Delete all system registry data for a customer.

## Data Behavior

- **Workstations, Controllers, Smart Switches, Charms I/O Cards, Charms:** Use `INSERT OR REPLACE` - if a record with the same name exists, it will be updated.
- **I/O Devices:** All existing I/O devices for the customer are deleted before importing new ones (since there can be many and names may not be unique).
- **AMS Systems:** Only one per customer, uses `INSERT OR REPLACE`.

## Future Enhancements

1. **MongoDB Sync:** Implement sync functionality to push this data to the main MongoDB server
2. **Data Viewer:** Create dedicated pages to view and manage the imported system registry data
3. **Search & Filter:** Add search and filtering capabilities for the system registry data
4. **Export:** Allow exporting the data back to XML or CSV format
5. **DVHotFixes Parser:** Parse the DVHotFixes list field into a structured format
6. **Data Validation:** Add validation rules for imported data
7. **Duplicate Detection:** Better handling of duplicate entries and merge conflicts

## Notes

- All system registry tables are prefixed with `sys_` to distinguish them from the regular nodes table
- Data is stored in the local SQLite database at `data/cabinet_pm_tablet.db`
- The `customer_id` foreign key links all system registry data to the appropriate customer
- Timestamps (`created_at`, `updated_at`) are automatically managed by the database
