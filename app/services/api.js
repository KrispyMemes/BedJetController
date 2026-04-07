/**
 * api.js — HTTP client for the Pi backend
 *
 * This module wraps all the fetch() calls to the Raspberry Pi server.
 * No component in the app should call fetch() directly — they all go
 * through this module. That way, if the Pi's URL changes, there's only
 * one place to update.
 *
 * Usage:
 *   import * as api from '../services/api';
 *   const status = await api.getStatus();
 *   await api.setMode(4);          // Cool mode
 *   await api.setTemperature(72);  // 72°F
 */

// ---------------------------------------------------------------------------
// Pi server URL
//
// Change this to your Raspberry Pi's local IP address.
// The SettingsScreen lets users change this at runtime — it calls
// setPiBaseUrl() below to update this variable.
//
// Find your Pi's IP by running: hostname -I
// ---------------------------------------------------------------------------
let PI_BASE_URL = 'http://192.168.1.100:8000';

/**
 * Update the Pi server URL at runtime (called from SettingsScreen).
 * @param {string} url - e.g. "http://192.168.1.50:8000"
 */
export function setPiBaseUrl(url) {
  PI_BASE_URL = url.replace(/\/$/, ''); // strip trailing slash if present
}

/**
 * Get the current Pi server URL (used by SettingsScreen to show the saved value).
 */
export function getPiBaseUrl() {
  return PI_BASE_URL;
}


// ---------------------------------------------------------------------------
// Helper — wraps every fetch call in a try/catch
//
// All API functions return either the parsed JSON response (on success)
// or { success: false, error: "..." } (on network failure or bad response).
// Components can always check result.success to know if it worked.
// ---------------------------------------------------------------------------

async function request(path, options = {}) {
  try {
    const response = await fetch(`${PI_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    if (!response.ok) {
      return { success: false, error: `Server error: ${response.status}` };
    }

    return await response.json();
  } catch (error) {
    // Network error — Pi is probably offline or unreachable
    return { success: false, error: error.message };
  }
}


// ---------------------------------------------------------------------------
// API functions — one per endpoint
// ---------------------------------------------------------------------------

/**
 * Get the current BedJet status.
 * Returns a status object, or { connected: false } if BedJet is not connected.
 */
export async function getStatus() {
  return request('/status');
}

/**
 * Change the BedJet operating mode.
 * @param {number} mode - 0=Standby, 1=Heat, 2=Turbo, 3=Extended Heat, 4=Cool, 5=Dry, 6=Wait
 */
export async function setMode(mode) {
  return request('/command/mode', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

/**
 * Set the target temperature.
 * @param {number} tempF - Temperature in Fahrenheit (66–104)
 */
export async function setTemperature(tempF) {
  return request('/command/temperature', {
    method: 'POST',
    body: JSON.stringify({ temp_f: tempF }),
  });
}

/**
 * Set the fan speed.
 * @param {number} step - Fan speed step (0–19, where 0=5% and 19=100%)
 */
export async function setFan(step) {
  return request('/command/fan', {
    method: 'POST',
    body: JSON.stringify({ step }),
  });
}

/**
 * Set the auto-off timer.
 * @param {number} hours - Hours (0–9)
 * @param {number} minutes - Minutes (0–59)
 */
export async function setTimer(hours, minutes) {
  return request('/command/timer', {
    method: 'POST',
    body: JSON.stringify({ hours, minutes }),
  });
}

/**
 * Turn the BedJet off (put it into Standby mode).
 */
export async function turnOff() {
  return request('/command/off', { method: 'POST' });
}

/**
 * Quick health check — is the Pi online?
 * Returns { pi_ok: true, bedjet_connected: true/false } or { success: false, error: ... }
 */
export async function checkHealth() {
  return request('/health');
}
