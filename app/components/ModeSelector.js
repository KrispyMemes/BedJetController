/**
 * ModeSelector.js — Operating mode buttons
 *
 * Shows a grid of buttons for each BedJet mode. The active mode is highlighted.
 * Tapping a button sends the mode change command to the Pi.
 *
 * We do NOT update the store optimistically (before confirmation from the BedJet).
 * Instead, we wait for the next WebSocket status update, which arrives in ~400ms.
 * This prevents visual glitching if a command fails.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useBedJetStore, MODE_NAMES } from '../store';
import * as api from '../services/api';

// The modes we show buttons for (Standby is handled by the "Turn Off" button)
const MODES = [
  { id: 1, label: 'Heat',     icon: '🔥' },
  { id: 2, label: 'Turbo',    icon: '🚀' },
  { id: 3, label: 'Extended', icon: '♨️' },
  { id: 4, label: 'Cool',     icon: '❄️' },
  { id: 5, label: 'Dry',      icon: '💨' },
  { id: 6, label: 'Wait',     icon: '⏸' },
];

export default function ModeSelector() {
  const currentMode = useBedJetStore((state) => state.mode);

  async function handleModePress(modeId) {
    if (modeId === currentMode) return; // already in this mode

    const result = await api.setMode(modeId);
    if (!result.success) {
      Alert.alert('Error', result.error || 'Could not change mode');
    }
    // No optimistic update — wait for the WebSocket to confirm
  }

  return (
    <View style={styles.grid}>
      {MODES.map((m) => {
        const isActive = m.id === currentMode;
        return (
          <TouchableOpacity
            key={m.id}
            style={[styles.button, isActive && styles.buttonActive]}
            onPress={() => handleModePress(m.id)}
          >
            <Text style={styles.icon}>{m.icon}</Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  button: {
    width: '31%',
    backgroundColor: '#0f3460',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  buttonActive: {
    backgroundColor: '#1a4a7a',
    borderColor: '#64ffda',
  },
  icon: {
    fontSize: 22,
    marginBottom: 4,
  },
  label: {
    color: '#8892b0',
    fontSize: 13,
    fontWeight: '600',
  },
  labelActive: {
    color: '#64ffda',
  },
});
