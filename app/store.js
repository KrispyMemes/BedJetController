/**
 * store.js — Zustand global state store
 *
 * This is the single source of truth for BedJet state in the mobile app.
 * Every component reads from this store; none hold their own copy of the
 * device state.
 *
 * How it works:
 *   1. App.js subscribes socket.js to updateFromStatus()
 *   2. When the Pi sends a WebSocket update, socket.js calls updateFromStatus()
 *   3. Zustand updates the store, which causes any component using the store
 *      to re-render automatically
 *
 * Usage in a component:
 *   import { useBedJetStore } from '../store';
 *
 *   function MyComponent() {
 *     const mode = useBedJetStore(state => state.mode);
 *     const actualTempF = useBedJetStore(state => state.actualTempF);
 *     // ...
 *   }
 */

import { create } from 'zustand';

/**
 * Mode integer to display name mapping.
 * Mirrors the MODE_NAMES dict in bedjet_ble.py.
 */
export const MODE_NAMES = {
  0: 'Standby',
  1: 'Heat',
  2: 'Turbo',
  3: 'Extended Heat',
  4: 'Cool',
  5: 'Dry',
  6: 'Wait',
};

/**
 * The Zustand store.
 *
 * All state starts as null/false until the first WebSocket message arrives.
 * Components should handle the null case (show a loading state or "--").
 */
export const useBedJetStore = create((set) => ({
  // Is the Pi currently connected to the BedJet via BLE?
  connected: false,

  // Current operating mode (integer 0-6)
  mode: 0,

  // The actual temperature the BedJet is currently reading (Fahrenheit)
  actualTempF: null,

  // The target temperature the user has set (Fahrenheit)
  setTempF: null,

  // Fan speed as a step (0-19)
  fanStep: 0,

  // Fan speed as a percentage (5%-100%)
  fanPct: 5,

  // Timer countdown remaining
  timerH: 0,
  timerM: 0,
  timerS: 0,

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Update all state from a status dict received via WebSocket.
   * This is the only way state should change — always driven by the Pi.
   *
   * @param {object} status - Status dict from the Pi, e.g.:
   *   {
   *     connected: true,
   *     mode: 4,
   *     actual_temp_f: 68,
   *     set_temp_f: 70,
   *     fan_step: 10,
   *     fan_pct: 55,
   *     timer_h: 0,
   *     timer_m: 30,
   *     timer_s: 0
   *   }
   */
  updateFromStatus: (status) => {
    if (!status.connected) {
      set({ connected: false });
      return;
    }

    set({
      connected:   true,
      mode:        status.mode,
      actualTempF: status.actual_temp_f,
      setTempF:    status.set_temp_f,
      fanStep:     status.fan_step,
      fanPct:      status.fan_pct,
      timerH:      status.timer_h,
      timerM:      status.timer_m,
      timerS:      status.timer_s,
    });
  },

  /**
   * Manually mark the BedJet as disconnected (e.g. when WebSocket drops).
   */
  setDisconnected: () => set({ connected: false }),
}));
