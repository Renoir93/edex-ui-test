# eDEX-UI Security Fixes

This document outlines the security vulnerabilities found in eDEX-UI and provides comprehensive mitigation strategies.

## Critical Vulnerabilities

### 1. CVE-2023-30856: Cross-Site WebSocket Hijacking (RCE)

**Severity:** HIGH (CVSS 8.3)

**Description:**  
eDEX-UI's WebSocket server (used for terminal control) lacks proper origin validation. Any malicious website can connect to the WebSocket and execute arbitrary shell commands when eDEX-UI is running.

**Affected Code:**  
`src/classes/terminal.class.js` lines 423-432

**Current Vulnerable Code:**
```javascript
this.wss = new this.Websocket({
    port: this.port,
    clientTracking: true,
    verifyClient: info => {
        if (this.wss.clients.length >= 1) {
            return false;
        } else {
            return true;
        }
    }
});
```

**Problem:** The `verifyClient` function only checks the number of connected clients, but does NOT validate the origin of the connection.

---

## Security Fixes

### Fix #1: Add Origin Validation to WebSocket Server

**File:** `src/classes/terminal.class.js`

**Replace lines 423-432 with:**

```javascript
this.wss = new this.Websocket({
    port: this.port,
    clientTracking: true,
    verifyClient: info => {
        // Only allow connections from localhost/127.0.0.1
        const allowedOrigins = [
            'http://localhost',
            'http://127.0.0.1',
            'https://localhost',
            'https://127.0.0.1',
            `http://localhost:${this.port}`,
            `http://127.0.0.1:${this.port}`,
            `https://localhost:${this.port}`,
            `https://127.0.0.1:${this.port}`,
            'file://',
            'app://'
        ];
        
        // Check if we already have a client connected
        if (this.wss.clients.length >= 1) {
            return false;
        }
        
        // Validate origin header
        const origin = info.origin || info.req.headers.origin;
        
        if (!origin) {
            // If no origin is set (e.g., from Electron renderer), check if it's from localhost
            const host = info.req.headers.host;
            if (host && (host.startsWith('localhost') || host.startsWith('127.0.0.1'))) {
                return true;
            }
            // Reject connections without origin from non-localhost
            return false;
        }
        
        // Check if origin is in allowed list or starts with allowed prefixes
        const isAllowed = allowedOrigins.some(allowedOrigin => 
            origin.startsWith(allowedOrigin)
        );
        
        if (!isAllowed) {
            console.warn(`[eDEX-UI Security] Rejected WebSocket connection from unauthorized origin: ${origin}`);
        }
        
        return isAllowed;
    }
});
```

---

### Fix #2: Update Dependencies

Many npm packages have known vulnerabilities. Update `package.json` dependencies:

**Critical updates needed:**
- Electron: Update to latest LTS version (v28+)
- ws (WebSocket library): Update to latest version (8.x+)
- node-pty: Update to latest version (1.x+)

**Run these commands:**
```bash
npm audit
npm audit fix
npm update
```

---

### Fix #3: Add Security Headers

For the Electron app, add Content Security Policy (CSP) to prevent XSS attacks.

**File:** `src/_boot.js` (or main Electron entry point)

**Add before creating BrowserWindow:**
```javascript
const session = require('electron').session;

session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
        responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
                "default-src 'self'; " +
                "script-src 'self' 'unsafe-inline'; " +
                "style-src 'self' 'unsafe-inline'; " +
                "connect-src 'self' ws://localhost:* ws://127.0.0.1:*; " +
                "img-src 'self' data:;"
            ]
        }
    });
});
```

---

### Fix #4: Disable Node Integration in Renderer

Electron security best practice: disable Node.js integration in renderer processes.

**File:** `src/_boot.js` (or wherever BrowserWindow is created)

**Update BrowserWindow configuration:**
```javascript
mainWindow = new Belectron.BrowserWindow({
    // ... other options
    webPreferences: {
        nodeIntegration: false,  // CRITICAL: disable node in renderer
        contextIsolation: true,   // CRITICAL: isolate context
        enableRemoteModule: false, // Disable remote module
        sandbox: true              // Enable sandbox
    }
});
```

**Note:** This will require refactoring code that uses `require()` in HTML/renderer files. Use Electron IPC for communication instead.

---

## Additional Recommendations

### 1. Run with Minimal Privileges
- **Never run eDEX-UI as root/administrator**
- Create a dedicated user account with limited permissions

### 2. Network Isolation
- Only bind WebSocket to localhost (127.0.0.1), never 0.0.0.0
- Use firewall rules to block external access to eDEX-UI ports

### 3. Use Authentication Token
Add a random authentication token for WebSocket connections:

```javascript
// Generate token on startup
const crypto = require('crypto');
this.wsAuthToken = crypto.randomBytes(32).toString('hex');

// Require token in first WebSocket message
this.wss.on('connection', (ws, req) => {
    let authenticated = false;
    
    const authTimeout = setTimeout(() => {
        if (!authenticated) {
            ws.close(4401, 'Authentication timeout');
        }
    }, 5000);
    
    ws.once('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.authToken === this.wsAuthToken) {
                authenticated = true;
                clearTimeout(authTimeout);
                // Continue with normal operation
            } else {
                ws.close(4403, 'Invalid auth token');
            }
        } catch (e) {
            ws.close(4400, 'Invalid message format');
        }
    });
});
```

### 4. Enable Signed Builds
- Sign release binaries with code signing certificates
- Prevents tampering and malware injection

---

## Testing After Fixes

### 1. Test WebSocket Security
Create a test HTML file to verify origin blocking:

```html
<!DOCTYPE html>
<html>
<body>
<script>
    // This should be BLOCKED after fix
    const ws = new WebSocket('ws://localhost:3000');
    ws.onopen = () => console.log('Connected - SECURITY ISSUE!');
    ws.onerror = () => console.log('Blocked - Security working!');
</script>
</body>
</html>
```

### 2. Verify Functionality
- Test terminal creation
- Test command execution
- Test multiple terminals
- Test file system monitoring
- Test all UI features

### 3. Security Audit
```bash
npm audit
snyk test  # if you have Snyk installed
```

---

## Implementation Priority

1. **CRITICAL - Do immediately:** Fix #1 (WebSocket origin validation)
2. **HIGH:** Fix #2 (Update dependencies)
3. **MEDIUM:** Fix #3 (Security headers)
4. **MEDIUM:** Fix #4 (Disable Node integration)
5. **LOW:** Additional recommendations

---

## Maintaining Security

- Run `npm audit` regularly
- Subscribe to security advisories for dependencies
- Keep Electron updated to latest LTS
- Review code changes for security implications
- Use automated security scanning in CI/CD

---

## References

- CVE-2023-30856: https://nvd.nist.gov/vuln/detail/CVE-2023-30856
- GHSA-q8xc-f2wf-ffh9: https://github.com/GitSquared/edex-ui/security/advisories/GHSA-q8xc-f2wf-ffh9
- Electron Security Guide: https://www.electronjs.org/docs/latest/tutorial/security
- WebSocket Security: https://christian-schneider.net/CrossSiteWebSocketHijacking.html

---

## Contact

For security issues, please create a private security advisory rather than a public issue.
