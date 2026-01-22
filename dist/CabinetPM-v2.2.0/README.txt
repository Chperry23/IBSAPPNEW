===============================================
   Cabinet PM Tablet Application v2.2.0
   ECI Industrial Solutions
===============================================

WHAT'S NEW IN v2.2.0
-------------------
✅ Unclassified Node Management
   - View and reassign unclassified/unknown equipment types
   - Easy dropdown to categorize nodes in customer profile

✅ Node List Tracker Removed
   - Simplified PM session workflow
   - Removed redundant node tracking tab

✅ Cabinet Naming Improvements
   - "Cabinet Location" renamed to "Cabinet Name" for clarity
   - Cabinet Name = identifier (e.g., CTRL-01, Cabinet A)
   - Cabinet Location = physical location assignment (Building, Room)

✅ Enhanced Location Assignment
   - Fixed location dropdown in Add Cabinet modal
   - Added location assignment in cabinet detail view
   - Seamless location management workflow

✅ Database Improvements
   - Automatic migration from cabinet_location to cabinet_name
   - Backward compatibility maintained

INSTALLATION
-----------
1. Extract all files to a folder on your Windows PC
2. Double-click "cabinet-pm-tablet.exe" to start
3. The application will create a local database on first run
4. Default login: admin / cabinet123

SYSTEM REQUIREMENTS
------------------
- Windows 10 or later (64-bit)
- 4GB RAM minimum (8GB recommended)
- 500MB free disk space
- Internet connection for MongoDB sync (optional)

FOLDER STRUCTURE
---------------
cabinet-pm-tablet.exe    - Main application
frontend/                - User interface files
data/                    - Database storage
  cabinet_pm_tablet.db   - SQLite database

RUNNING THE APPLICATION
----------------------
Simply double-click cabinet-pm-tablet.exe

The application will:
- Start a local web server on port 3000
- Automatically open your default browser
- Display the login page

If the browser doesn't open automatically, navigate to:
http://localhost:3000

MONGODB SYNC (Optional)
----------------------
For distributed sync across multiple tablets:
1. Set up MongoDB Atlas (free tier available)
2. Configure connection in the Sync page
3. Enable sync to share data across devices

SUPPORT
-------
For issues or questions:
- Email: support@yourcompany.com
- Documentation: See MD folder for detailed guides

LICENSE
-------
© 2026 ECI Industrial Solutions
All Rights Reserved
UNLICENSED - Internal Use Only

===============================================

