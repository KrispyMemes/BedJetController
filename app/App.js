/**
 * App.js — Root component
 *
 * This is the entry point of the mobile app. It does three things:
 *   1. Sets up navigation (stack with Home and Settings screens)
 *   2. Starts the WebSocket connection to the Pi (once, on app launch)
 *   3. Wires the WebSocket updates into the Zustand store
 *
 * The WebSocket connection is started here (not inside a screen) so it
 * stays alive when the user navigates between screens.
 */

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import HomeScreen from './screens/HomeScreen';
import SettingsScreen from './screens/SettingsScreen';
import { useBedJetStore } from './store';
import * as socket from './services/socket';
import { setPiBaseUrl } from './services/api';
import { setSocketUrl } from './services/socket';

const Stack = createNativeStackNavigator();

// Key used to save/load the Pi IP from device storage
const PI_URL_STORAGE_KEY = '@bedjet_pi_url';

export default function App() {
  const updateFromStatus = useBedJetStore((state) => state.updateFromStatus);
  const setDisconnected  = useBedJetStore((state) => state.setDisconnected);

  useEffect(() => {
    // --- Load saved Pi URL from storage, then connect ---
    async function initConnection() {
      try {
        const savedUrl = await AsyncStorage.getItem(PI_URL_STORAGE_KEY);
        if (savedUrl) {
          // Restore the saved IP address before connecting
          setPiBaseUrl(savedUrl);
          setSocketUrl(savedUrl);
        }
      } catch (e) {
        console.warn('Could not load saved Pi URL:', e);
      }

      // Subscribe to WebSocket status updates BEFORE connecting, so we
      // don't miss the first message that arrives on open.
      socket.subscribe(updateFromStatus);

      // Open the WebSocket connection. It will auto-reconnect if it drops.
      socket.connect();
    }

    initConnection();

    // Cleanup when the app unmounts (rare, but good practice)
    return () => {
      socket.unsubscribe(updateFromStatus);
      socket.disconnect();
    };
  }, []); // Empty array = run once on mount

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#16213e' },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: 'BedJet Controller',
            headerRight: () => <SettingsButton />,
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// Small gear icon button in the header that navigates to Settings
function SettingsButton() {
  // We use useNavigation hook here since this isn't a screen component
  const { useNavigation } = require('@react-navigation/native');
  const navigation = useNavigation();

  return (
    <React.Fragment>
      <SettingsIcon onPress={() => navigation.navigate('Settings')} />
    </React.Fragment>
  );
}

// Simple text-based settings button (no icon library needed)
function SettingsIcon({ onPress }) {
  const { TouchableOpacity, Text } = require('react-native');
  return (
    <TouchableOpacity onPress={onPress} style={{ marginRight: 4, padding: 4 }}>
      <Text style={{ color: '#ffffff', fontSize: 22 }}>⚙️</Text>
    </TouchableOpacity>
  );
}
