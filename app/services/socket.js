/**
 * socket.js — WebSocket connection to the Pi server
 *
 * This module maintains a single WebSocket connection that receives live
 * BedJet status updates from the Pi. Any part of the app can subscribe
 * to receive these updates.
 *
 * Design: singleton module (not a React hook)
 *
 * We deliberately make this a plain JS module rather than a React hook
 * so the connection persists even when the user navigates between screens.
 * A React hook would disconnect when the component unmounts.
 *
 * Usage in App.js:
 *   import * as socket from './services/socket';
 *   socket.connect();
 *   socket.subscribe(myHandler);   // called with status dict on each update
 *
 * Usage in a component (with cleanup):
 *   useEffect(() => {
 *     const handler = (status) => setStatus(status);
 *     socket.subscribe(handler);
 *     return () => socket.unsubscribe(handler);
 *   }, []);
 */

// The active WebSocket instance (null until connect() is called)
let ws = null;

// Set of listener functions to call when a new status arrives
const listeners = new Set();

// Timer for the reconnect delay (so we can cancel it if needed)
let reconnectTimer = null;

// The WebSocket URL — matches the Pi server URL but with ws:// protocol
// Updated by setSocketUrl() when the user changes the Pi IP in Settings
let socketUrl = 'ws://192.168.1.100:8000/ws';


// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Update the WebSocket URL (called from SettingsScreen when IP changes).
 * If already connected, closes the current connection and reconnects.
 * @param {string} piBaseUrl - e.g. "http://192.168.1.50:8000"
 */
export function setSocketUrl(piBaseUrl) {
  // Convert http:// to ws://
  socketUrl = piBaseUrl.replace(/^http/, 'ws') + '/ws';

  // Reconnect with the new URL if we were connected
  if (ws !== null) {
    disconnect();
    connect();
  }
}

/**
 * Open the WebSocket connection to the Pi.
 * Safe to call multiple times — ignores if already connected.
 */
export function connect() {
  // Don't open a second connection if one already exists
  if (ws !== null) return;

  console.log('[socket] Connecting to', socketUrl);
  ws = new WebSocket(socketUrl);

  ws.onopen = () => {
    console.log('[socket] Connected');
  };

  ws.onmessage = (event) => {
    // Parse the JSON status update from the Pi
    let status;
    try {
      status = JSON.parse(event.data);
    } catch (e) {
      console.warn('[socket] Could not parse message:', event.data);
      return;
    }

    // Notify all subscribers (e.g. the Zustand store)
    listeners.forEach((fn) => fn(status));
  };

  ws.onerror = (error) => {
    // Errors always precede a close event, so we just log here.
    // The reconnect logic lives in onclose.
    console.warn('[socket] Error:', error.message || 'Connection error');
    ws.close(); // triggers onclose, which handles the retry
  };

  ws.onclose = () => {
    console.log('[socket] Disconnected — will retry in 3 seconds');
    ws = null; // mark as disconnected so connect() will work again

    // Schedule a reconnect attempt. We use 3 seconds so we don't hammer
    // the Pi if it's rebooting or temporarily unreachable.
    reconnectTimer = setTimeout(connect, 3000);
  };
}

/**
 * Close the WebSocket connection and stop any pending reconnect.
 * Call this when the app is shutting down (rare in mobile apps).
 */
export function disconnect() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (ws !== null) {
    // Setting onclose to null prevents the reconnect timer from firing
    ws.onclose = null;
    ws.close();
    ws = null;
  }
}

/**
 * Register a function to be called whenever a new BedJet status arrives.
 * @param {Function} fn - Called with a status dict: { connected, mode, temp_f, ... }
 */
export function subscribe(fn) {
  listeners.add(fn);
}

/**
 * Remove a previously registered listener.
 * @param {Function} fn - The same function reference passed to subscribe()
 */
export function unsubscribe(fn) {
  listeners.delete(fn);
}

/**
 * True if the WebSocket is currently open and connected.
 */
export function isConnected() {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}
