/**
 * HomeScreen.js — Main control panel
 *
 * This is the screen the user sees first. It shows the current BedJet status
 * and provides controls for all the main functions.
 *
 * This screen is intentionally thin — it just arranges the components.
 * The actual logic (calling the Pi API, reading from the store) lives in
 * each individual component.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';

import ConnectionStatus from '../components/ConnectionStatus';
import ModeSelector from '../components/ModeSelector';
import TempControl from '../components/TempControl';
import FanSlider from '../components/FanSlider';
import TimerSection from '../components/TimerSection';
import { useBedJetStore } from '../store';
import * as api from '../services/api';

export default function HomeScreen() {
  const connected = useBedJetStore((state) => state.connected);

  async function handleTurnOff() {
    const result = await api.turnOff();
    if (!result.success) {
      Alert.alert('Error', result.error || 'Could not turn off BedJet');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Live connection + status readout */}
      <ConnectionStatus />

      {/* Show controls only when connected */}
      {connected ? (
        <>
          {/* Mode selection buttons */}
          <SectionLabel text="Mode" />
          <ModeSelector />

          {/* Temperature +/- */}
          <SectionLabel text="Temperature" />
          <TempControl />

          {/* Fan speed slider */}
          <SectionLabel text="Fan Speed" />
          <FanSlider />

          {/* Timer */}
          <SectionLabel text="Timer" />
          <TimerSection />

          {/* Turn off button */}
          <TouchableOpacity style={styles.offButton} onPress={handleTurnOff}>
            <Text style={styles.offButtonText}>Turn Off</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.disconnectedNote}>
          <Text style={styles.disconnectedText}>
            BedJet is not connected.{'\n'}
            Make sure the Pi is running and on the same WiFi network.
          </Text>
        </View>
      )}

    </ScrollView>
  );
}

function SectionLabel({ text }) {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionLabel: {
    color: '#8892b0',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 10,
  },
  offButton: {
    marginTop: 32,
    backgroundColor: '#c0392b',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  offButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  disconnectedNote: {
    marginTop: 40,
    padding: 20,
    backgroundColor: '#0f3460',
    borderRadius: 12,
    alignItems: 'center',
  },
  disconnectedText: {
    color: '#8892b0',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
  },
});
