/**
 * TempControl.js — Temperature adjustment (+/- buttons)
 *
 * Shows the current target temperature with + and - buttons to adjust it
 * in 1°F increments.
 *
 * Debounce strategy:
 *   The user might tap + several times quickly. We don't want to send a
 *   separate BLE command for each tap — that would flood the BedJet.
 *   Instead, we:
 *     1. Update local display state immediately (feels instant to the user)
 *     2. Wait 400ms after the last tap before sending the command
 *     3. If the user taps again before 400ms, cancel the pending command
 *        and restart the timer
 *
 * Valid range: 66°F – 104°F (BedJet hardware limit)
 */

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useBedJetStore } from '../store';
import * as api from '../services/api';

const TEMP_MIN = 66;
const TEMP_MAX = 104;
const DEBOUNCE_MS = 400;

export default function TempControl() {
  const setTempF = useBedJetStore((state) => state.setTempF);

  // Local state for immediate UI feedback while debouncing
  // Initialized from the store; updated when the store changes
  const [localTemp, setLocalTemp] = useState(setTempF ?? 72);
  const debounceRef = useRef(null);

  // Keep local temp in sync when the store updates (e.g. another user changed it)
  useEffect(() => {
    if (setTempF !== null) {
      setLocalTemp(setTempF);
    }
  }, [setTempF]);

  function handleTempChange(delta) {
    const newTemp = Math.min(TEMP_MAX, Math.max(TEMP_MIN, localTemp + delta));
    if (newTemp === localTemp) return; // already at limit

    // Update the display immediately
    setLocalTemp(newTemp);

    // Cancel any pending API call
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Schedule the actual API call after the user stops tapping
    debounceRef.current = setTimeout(async () => {
      const result = await api.setTemperature(newTemp);
      if (!result.success) {
        Alert.alert('Error', result.error || 'Could not set temperature');
        // Revert to store value on failure
        if (setTempF !== null) setLocalTemp(setTempF);
      }
    }, DEBOUNCE_MS);
  }

  const atMin = localTemp <= TEMP_MIN;
  const atMax = localTemp >= TEMP_MAX;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={[styles.button, atMin && styles.buttonDisabled]}
        onPress={() => handleTempChange(-1)}
        disabled={atMin}
      >
        <Text style={styles.buttonText}>−</Text>
      </TouchableOpacity>

      <View style={styles.display}>
        <Text style={styles.tempValue}>{localTemp}°F</Text>
        <Text style={styles.tempLabel}>Target temp</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, atMax && styles.buttonDisabled]}
        onPress={() => handleTempChange(+1)}
        disabled={atMax}
      >
        <Text style={styles.buttonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 16,
    padding: 16,
    justifyContent: 'space-between',
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a4a7a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#64ffda',
  },
  buttonDisabled: {
    borderColor: '#2d3748',
    backgroundColor: '#0f3460',
  },
  buttonText: {
    color: '#64ffda',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  display: {
    alignItems: 'center',
  },
  tempValue: {
    color: '#ffffff',
    fontSize: 42,
    fontWeight: '700',
  },
  tempLabel: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
