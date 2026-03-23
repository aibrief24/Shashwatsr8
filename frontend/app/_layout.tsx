import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { api } from '@/services/api';
import * as SplashScreen from 'expo-splash-screen';

try { SplashScreen.preventAutoHideAsync(); } catch { }

function AppContent() {
  const { user, token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      try { SplashScreen.hideAsync(); } catch { }
    }
  }, [loading]);

  useEffect(() => {
    // Push notifications removed for Expo Go compatibility
  }, [user?.id]);


  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="article/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="search" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="light" />
        <AppContent />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
