# 🔍 Debugging System

## Overview

Comprehensive logging system added to both frontend and backend for easy debugging and issue tracking.

---

## Backend Logging

### Logger Module
**Location**: `backend/utils/logger.js`

**Usage**:
```javascript
const Logger = require('../utils/logger');
const logger = new Logger('ModuleName');

// Log types
logger.info('Information message', { data });
logger.success('Success message', { data });
logger.warn('Warning message', { data });
logger.error('Error message', error);
logger.debug('Debug message', { data });
logger.request(req); // Log HTTP requests
```

### Features
- ✅ Color-coded console output
- ✅ Timestamps on all logs
- ✅ Module identification
- ✅ Structured data logging
- ✅ Request logging with user info

### Example Output
```
✅ [14:23:45] [Cabinets] Cabinet created successfully
```

---

## Frontend Logging

### Logger Module
**Location**: `frontend/public/assets/js/pm-logger.js`

**Load Order**: Must load after `pm-namespace.js`

**Usage**:
```javascript
// Create logger for your module
const logger = PM.createLogger('ModuleName');

// Log types
logger.info('Information message', data);
logger.success('Success message', data);
logger.warn('Warning message', data);
logger.error('Error message', error);
logger.debug('Debug message', data);
logger.api('POST', '/api/endpoint', data); // Log API calls
```

### Features
- ✅ Color-coded console output
- ✅ Timestamps on all logs
- ✅ Module identification
- ✅ Structured data logging
- ✅ API call tracking

---

## Updated Modules

### Backend
- ✅ `backend/routes/cabinets.js` - Cabinet CRUD operations
  - Comprehensive validation
  - Step-by-step operation logging
  - Detailed error messages

### Frontend
- ✅ `frontend/public/assets/js/pm-cabinets.js` - Cabinet management
  - Form submission tracking
  - API call logging
  - Success/error handling

---

## How to Use

### Development Mode

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Open browser console** (F12)

3. **Perform actions** and watch the logs:

   **Frontend Console**:
   ```
   ℹ️ [14:23:40] [Cabinets] Add cabinet form submitted
   🔍 [14:23:40] [Cabinets] Cabinet data to submit { cabinet_location: "Test Cabinet", ... }
   🌐 [14:23:40] [Cabinets] API POST /api/cabinets
   🔍 [14:23:41] [Cabinets] Response status 200
   ✅ [14:23:41] [Cabinets] Cabinet added successfully
   ```

   **Backend Terminal**:
   ```
   ℹ️  [14:23:40] [Cabinets] POST /api/cabinets
   ℹ️  [14:23:40] [Cabinets] Creating new cabinet
   🔍 [14:23:40] [Cabinets] Generated cabinet ID
   🔍 [14:23:40] [Cabinets] Checking session status
   🔍 [14:23:40] [Cabinets] Session found
   🔍 [14:23:40] [Cabinets] Inserting cabinet into database
   ✅ [14:23:41] [Cabinets] Cabinet created successfully
   ```

---

## Debugging Common Issues

### Issue: Cabinet not being created

**What to check**:

1. **Frontend Console**:
   - Is the form submitting? Look for "Add cabinet form submitted"
   - Is the session ID present? Check "Current session ID"
   - Is the API call being made? Look for "API POST /api/cabinets"
   - What's the response status? Check "Response status"

2. **Backend Terminal**:
   - Is the request reaching the server? Look for "POST /api/cabinets"
   - Is validation passing? Check for error logs
   - Is the session found? Look for "Session found"
   - Is the database insert succeeding? Look for "Cabinet created successfully"

3. **Network Tab** (Browser DevTools):
   - Check the request payload
   - Check the response body
   - Check for any 401/403/500 errors

### Issue: Redirecting to dashboard

**Possible causes**:
- ✅ Session expired (401 error)
- ✅ Session not found (404 error)
- ✅ JavaScript error on page (check console)
- ✅ Network error (check Network tab)

**Look for**:
- "Authentication required" in response
- "Session not found" in logs
- Uncaught exceptions in console
- Failed network requests

### Issue: Data not displaying

**What to check**:
1. **Is data being loaded?**
   - Look for "Loading session" logs
   - Check "Session data loaded" message
   - Verify data object in console

2. **Is rendering happening?**
   - Look for "loadCabinets called"
   - Check for JavaScript errors
   - Verify DOM elements exist

---

## Adding Logging to New Features

### Backend Example

```javascript
const Logger = require('../utils/logger');
const logger = new Logger('YourModule');

router.post('/your-endpoint', requireAuth, async (req, res) => {
  logger.request(req);
  logger.info('Starting operation');
  
  try {
    logger.debug('Processing data', req.body);
    
    // Your code here
    
    logger.success('Operation completed');
    res.json({ success: true });
  } catch (error) {
    logger.error('Operation failed', error);
    res.status(500).json({ error: 'Failed' });
  }
});
```

### Frontend Example

```javascript
const logger = PM.createLogger('YourModule');

PM.YourModule.yourFunction = async function() {
  logger.info('Function called');
  
  try {
    logger.api('GET', '/api/your-endpoint');
    const response = await fetch('/api/your-endpoint');
    
    logger.debug('Response received', response.status);
    
    const data = await response.json();
    logger.success('Data loaded', data);
    
  } catch (error) {
    logger.error('Failed to load data', error);
  }
};
```

---

## Best Practices

1. **Use appropriate log levels**:
   - `info`: General information about flow
   - `success`: Successful operations
   - `warn`: Potential issues, non-blocking
   - `error`: Errors and exceptions
   - `debug`: Detailed debugging info

2. **Include context**:
   ```javascript
   logger.info('Creating cabinet', { 
     session_id, 
     cabinet_location,
     user: req.session.username 
   });
   ```

3. **Log at key points**:
   - Function entry/exit
   - Before/after API calls
   - Before/after database operations
   - Validation checkpoints
   - Error catch blocks

4. **Don't log sensitive data**:
   - ❌ Passwords
   - ❌ Session tokens
   - ❌ Credit card numbers
   - ❌ Personal identifiable information (PII)

---

## Performance

- Logging has minimal performance impact
- Color formatting only happens in development
- Structured data uses native console methods
- No external dependencies

---

**Last Updated**: November 21, 2025

