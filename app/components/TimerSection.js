/**
 * TimerSection.js — Auto-off timer control
 *
 * Lets the user set a countdown timer. When it expires, the BedJet turns off.
 * Provides quick preset buttons (30min, 1hr, 2hr, 4hr) plus a custom option.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as api from '../services/api';

const PRESETS = [
  { label: '30m',  hours: 0, minutes: 30 },
  { label: '1hr',  hours: 1, minutes: 0  },
  { label: '2hr',  hours: 2, minutes: 0  },
  { label: '4hr',  hours: 4, minutes: 0  },
  { label: 'Off',  hours: 0, minutes: 0  },
];

export default function TimerSection() {
  const [activePreset, setActivePreset] = useState(null);

  async function handlePreset(preset) {
    const result = await api.setTimer(preset.hours, preset.minutes);
    if (result.success) {
      setActivePreset(preset.label);
    } else {
      Alert.alert('Error', result.error || 'Could not set timer');
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {PRESETS.map((preset) => {
          const isActive = activePreset === preset.label;
          return (
            <TouchableOpacity
              key={preset.label}
              style={[styles.button, isActive && styles.buttonActive]}
              onPress={() => handlePreset(preset)}
            >
              <Text style={[styles.buttonText, isActive && styles.buttonTextActive]}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f3460',
    borderRadius: 16,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  button: {
    flex: 1,
    backgroundColor: '#1a2a4a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d3748',
  },
  buttonActive: {
    borderColor: '#64ffda',
    backgroundColor: '#1a4a7a',
  },
  buttonText: {
    color: '#8892b0',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonTextActive: {
    color: '#64ffda',
  },
});
