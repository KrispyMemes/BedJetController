/**
 * SettingsScreen.js — App configuration
 *
 * Currently handles one setting: the Pi's IP address.
 *
 * The IP address is saved to the device's local storage (AsyncStorage) so it
 * persists after the app is closed and reopened.
 *
 * When the user saves a new IP, it updates both the HTTP API client (api.js)
 * and the WebSocket client (socket.js) so they point to the new address.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { setPiBaseUrl, getPiBaseUrl, checkHealth } from '../services/api';
import { setSocketUrl } from '../services/socket';

const PI_URL_STORAGE_KEY = '@bedjet_pi_url';

export default function SettingsScreen() {
  // Local state for the text input — doesn't update the app until Save is pressed
  const [inputUrl, setInputUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  // Load the current saved URL when the screen opens
  useEffect(() => {
    setInputUrl(getPiBaseUrl());
  }, []);

  async function handleSave() {
    // Basic validation — must look like http://something:port
    const trimmed = inputUrl.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      Alert.alert('Invalid URL', 'URL must start with http:// (e.g. http://192.168.1.100:8000)');
      return;
    }

    // Save to device storage
    try {
      await AsyncStorage.setItem(PI_URL_STORAGE_KEY, trimmed);
    } catch (e) {
      Alert.alert('Error', 'Could not save settings: ' + e.message);
      return;
    }

    // Update the running API and WebSocket clients
    setPiBaseUrl(trimmed);
    setSocketUrl(trimmed);

    Alert.alert('Saved', 'Pi URL updated. The app will reconnect automatically.');
  }

  async function handleTest() {
    setIsTesting(true);
    // Temporarily point to the entered URL to test (doesn't save)
    const original = getPiBaseUrl();
    setPiBaseUrl(inputUrl.trim());

    const result = await checkHealth();

    // Restore original URL if test fails (we haven't saved yet)
    if (!result.pi_ok) {
      setPiBaseUrl(original);
    }

    setIsTesting(false);

    if (result.pi_ok) {
      const bedjetStatus = result.bedjet_connected ? 'BedJet is connected ✓' : 'BedJet is NOT connected (Pi is reachable but BedJet may be off)';
      Alert.alert('Connection Test', `Pi is reachable ✓\n${bedjetStatus}`);
    } else {
      Alert.alert('Connection Test Failed', `Could not reach Pi at:\n${inputUrl}\n\nError: ${result.error || 'Unknown error'}\n\nCheck that:\n• The IP address is correct\n• The Pi is on and on the same WiFi\n• The BedJet server is running`);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        <Text style={styles.heading}>Raspberry Pi Connection</Text>
        <Text style={styles.description}>
          Enter the local IP address of your Raspberry Pi. You can find it by
          running{' '}
          <Text style={styles.code}>hostname -I</Text>
          {' '}on the Pi.
        </Text>

        <Text style={styles.label}>Pi Server URL</Text>
        <TextInput
          style={styles.input}
          value={inputUrl}
          onChangeText={setInputUrl}
          placeholder="http://192.168.1.100:8000"
          placeholderTextColor="#4a5568"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.button, styles.testButton]}
          onPress={handleTest}
          disabled={isTesting}
        >
          <Text style={styles.buttonText}>
            {isTesting ? 'Testing...' : 'Test Connection'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleSave}>
          <Text style={styles.buttonText}>Save</Text>
        </TouchableOpacity>

        <View style={styles.helpBox}>
          <Text style={styles.helpHeading}>Quick setup reminder</Text>
          <Text style={styles.helpText}>
            1. SSH into the Pi{'\n'}
            2. cd ~/BedJetController/pi{'\n'}
            3. export BEDJET_MAC=XX:XX:XX:XX:XX:XX{'\n'}
            4. source venv/bin/activate{'\n'}
            5. python main.py{'\n'}
            {'\n'}
            The server runs on port 8000 by default.
          </Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#16213e' },
  container: { flex: 1, backgroundColor: '#16213e' },
  content: { padding: 20, paddingBottom: 60 },

  heading: {
    color: '#e2e8f0',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    color: '#8892b0',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 24,
  },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: '#0f3460',
    color: '#64ffda',
    paddingHorizontal: 4,
    borderRadius: 4,
  },

  label: {
    color: '#8892b0',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f3460',
    color: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    marginBottom: 16,
  },

  button: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  testButton: { backgroundColor: '#0f3460', borderWidth: 1, borderColor: '#64ffda' },
  saveButton: { backgroundColor: '#64ffda' },
  buttonText: { color: '#0f3460', fontSize: 16, fontWeight: '700' },

  helpBox: {
    marginTop: 32,
    padding: 16,
    backgroundColor: '#0f3460',
    borderRadius: 12,
  },
  helpHeading: {
    color: '#64ffda',
    fontWeight: '700',
    marginBottom: 8,
    fontSize: 14,
  },
  helpText: {
    color: '#8892b0',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 22,
  },
});
