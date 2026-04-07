/**
 * ConnectionStatus.js — Live status header
 *
 * Shows a colored dot (green = connected, red = not), the current mode name,
 * and the actual temperature being read by the BedJet.
 *
 * This is the first thing the user sees on the Home screen.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useBedJetStore, MODE_NAMES } from '../store';

export default function ConnectionStatus() {
  const connected   = useBedJetStore((state) => state.connected);
  const mode        = useBedJetStore((state) => state.mode);
  const actualTempF = useBedJetStore((state) => state.actualTempF);
  const setTempF    = useBedJetStore((state) => state.setTempF);
  const timerH      = useBedJetStore((state) => state.timerH);
  const timerM      = useBedJetStore((state) => state.timerM);
  const timerS      = useBedJetStore((state) => state.timerS);

  const modeName = MODE_NAMES[mode] || 'Unknown';

  // Format the remaining timer as h:mm:ss
  const timerDisplay = timerH > 0 || timerM > 0 || timerS > 0
    ? `${timerH}:${String(timerM).padStart(2, '0')}:${String(timerS).padStart(2, '0')}`
    : null;

  return (
    <View style={styles.card}>
      {/* Connection status row */}
      <View style={styles.statusRow}>
        <View style={[styles.dot, connected ? styles.dotGreen : styles.dotRed]} />
        <Text style={styles.statusText}>
          {connected ? 'BedJet Connected' : 'Not Connected'}
        </Text>
      </View>

      {/* Temperature and mode display */}
      {connected && (
        <>
          <View style={styles.tempRow}>
            {/* Actual (measured) temperature */}
            <View style={styles.tempBlock}>
              <Text style={styles.tempValue}>
                {actualTempF !== null ? `${actualTempF}°F` : '--'}
              </Text>
              <Text style={styles.tempLabel}>Actual</Text>
            </View>

            {/* Current mode */}
            <View style={styles.modeBlock}>
              <Text style={styles.modeValue}>{modeName}</Text>
              <Text style={styles.tempLabel}>Mode</Text>
            </View>

            {/* Target (set) temperature */}
            <View style={styles.tempBlock}>
              <Text style={styles.tempValue}>
                {setTempF !== null ? `${setTempF}°F` : '--'}
              </Text>
              <Text style={styles.tempLabel}>Target</Text>
            </View>
          </View>

          {/* Timer countdown (only shown when timer is active) */}
          {timerDisplay && (
            <View style={styles.timerRow}>
              <Text style={styles.timerText}>⏱ {timerDisplay} remaining</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f3460',
    borderRadius: 16,
    padding: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  dotGreen: { backgroundColor: '#48bb78' },
  dotRed:   { backgroundColor: '#fc8181' },
  statusText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },

  tempRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  tempBlock: {
    alignItems: 'center',
    flex: 1,
  },
  modeBlock: {
    alignItems: 'center',
    flex: 1.5,
  },
  tempValue: {
    color: '#64ffda',
    fontSize: 32,
    fontWeight: '700',
  },
  modeValue: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  tempLabel: {
    color: '#8892b0',
    fontSize: 11,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  timerRow: {
    marginTop: 14,
    alignItems: 'center',
  },
  timerText: {
    color: '#8892b0',
    fontSize: 13,
  },
});
