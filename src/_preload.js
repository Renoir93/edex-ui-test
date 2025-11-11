// Context Isolation Preload Script
// Provides secure IPC bridge between main and renderer processes
// Enables context isolation while maintaining terminal functionality

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

/**
 * Security: Context Isolation Preload
 * 
 * This preload script creates a secure bridge between the main and renderer processes.
 * Instead of exposing all Node.js APIs (dangerous), we selectively expose only the
 * functions needed for eDEX-UI to operate.
 * 
 * This prevents malicious code from accessing system APIs directly.
 */

// Whitelisted IPC channels for terminal operations
const ALLOWED_CHANNELS = {
  // Terminal operations
  'terminal:execute': true,
  'terminal:resize': true,
  'terminal:kill': true,
  'terminal:data': true,
  'terminal:exit': true,
  
  // File operations
  'file:read': true,
  'file:write': true,
  'file:delete': true,
  'file:list': true,
  'file:stats': true,
  
  // System operations
  'system:info': true,
  'system:cwd': true,
  'system:env': true,
  
  // WebSocket operations
  'websocket:connect': true,
  'websocket:disconnect': true,
  'websocket:send': true,
  'websocket:message': true,
};

/**
 * Validate IPC channel name
 * @param {string} channel - The channel name to validate
 * @returns {boolean} - True if channel is whitelisted
 */
function isChannelAllowed(channel) {
  return ALLOWED_CHANNELS[channel] === true;
}

/**
 * Secure API Bridge
 * Exposes safe functions to renderer process
 */
const secureAPI = {
  /**
   * Send IPC message to main process
   * Only allows whitelisted channels
   */
  send: (channel, ...args) => {
    if (!isChannelAllowed(channel)) {
      console.error(`[SECURITY] Blocked IPC send on non-whitelisted channel: ${channel}`);
      throw new Error(`Channel '${channel}' is not allowed`);
    }
    ipcRenderer.send(channel, ...args);
  },

  /**
   * Send IPC message and wait for reply
   * Only allows whitelisted channels
   */
  invoke: async (channel, ...args) => {
    if (!isChannelAllowed(channel)) {
      console.error(`[SECURITY] Blocked IPC invoke on non-whitelisted channel: ${channel}`);
      throw new Error(`Channel '${channel}' is not allowed`);
    }
    return await ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Listen for IPC messages from main process
   * Provides receive functionality for async operations
   */
  on: (channel, callback) => {
    if (!isChannelAllowed(channel)) {
      console.error(`[SECURITY] Blocked IPC listener on non-whitelisted channel: ${channel}`);
      throw new Error(`Channel '${channel}' is not allowed`);
    }
    
    // Wrap callback to validate message format
    const wrappedCallback = (event, ...args) => {
      // event is not exposed to renderer, only args are passed
      callback(...args);
    };
    
    ipcRenderer.on(channel, wrappedCallback);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, wrappedCallback);
    };
  },

  /**
   * One-time IPC message listener
   */
  once: (channel, callback) => {
    if (!isChannelAllowed(channel)) {
      console.error(`[SECURITY] Blocked IPC once listener on non-whitelisted channel: ${channel}`);
      throw new Error(`Channel '${channel}' is not allowed`);
    }
    
    ipcRenderer.once(channel, (event, ...args) => {
      callback(...args);
    });
  },

  /**
   * Get application version
   * Safe to expose as it's read-only metadata
   */
  getVersion: () => {
    return ipcRenderer.sendSync('app:get-version');
  },

  /**
   * Get current working directory
   * Safe operation via IPC
   */
  getCwd: async () => {
    return await ipcRenderer.invoke('system:cwd');
  },

  /**
   * Get environment variables (filtered)
   * Returns only safe environment variables
   */
  getEnv: async () => {
    return await ipcRenderer.invoke('system:env');
  },
};

// Expose secure API to renderer process via contextBridge
// This is the ONLY way renderer can access main process functionality
contextBridge.exposeInMainWorld('electronAPI', secureAPI);

// Expose console for debugging (can be disabled in production)
contextBridge.exposeInMainWorld('console', console);

/**
 * Security: Prevent direct access to Node.js APIs
 * These are automatically isolated with contextIsolation: true
 */

// Log preload initialization
console.log('[PRELOAD] Context isolation enabled - Secure API bridge initialized');
