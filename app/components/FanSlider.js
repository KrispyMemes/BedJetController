/**
 * FanSlider.js — Fan speed control
 *
 * A horizontal slider that lets the user set the fan speed from 5% to 100%.
 * The BedJet uses 20 steps (0–19), each representing 5% more power.
 *
 * Important: We use onSlidingComplete (fires when the user lifts their finger)
 * instead of onValueChange (fires continuously while dragging). This prevents
 * sending dozens of BLE commands while the user is still sliding.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import Slider from '@react-native-community/slider';
import { useBedJetStore } from '../store';
import * as api from '../services/api';

export default function FanSlider() {
  const fanStep = useBedJetStore((state) => state.fanStep);

  // Local state for the slider position while dragging
  const [localStep, setLocalStep] = useState(fanStep ?? 0);

  // Sync with store when it changes (another user adjusted the fan)
  useEffect(() => {
    setLocalStep(fanStep);
  }, [fanStep]);

  async function handleSlidingComplete(step) {
    const roundedStep = Math.round(step);
    const result = await api.setFan(roundedStep);
    if (!result.success) {
      Alert.alert('Error', result.error || 'Could not set fan speed');
      setLocalStep(fanStep); // revert on failure
    }
  }

  const displayPct = localStep * 5 + 5;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>Fan Speed</Text>
        <Text style={styles.value}>{displayPct}%</Text>
      </View>

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={19}
        step={1}
        value={localStep}
        onValueChange={setLocalStep}             // updates display while dragging
        onSlidingComplete={handleSlidingComplete} // sends command only when done
        minimumTrackTintColor="#64ffda"
        maximumTrackTintColor="#2d3748"
        thumbTintColor="#64ffda"
      />

      {/* Min / Max labels */}
      <View style={styles.tickRow}>
        <Text style={styles.tickLabel}>5%</Text>
        <Text style={styles.tickLabel}>100%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f3460',
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  label: {
    color: '#8892b0',
    fontSize: 14,
  },
  value: {
    color: '#64ffda',
    fontSize: 24,
    fontWeight: '700',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  tickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  tickLabel: {
    color: '#4a5568',
    fontSize: 11,
  },
});
