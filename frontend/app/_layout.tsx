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
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';

try { SplashScreen.preventAutoHideAsync(); } catch { }

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId || projectId === "placeholder-project-id") {
      console.log('No valid projectId found in app.json. Please run `eas init` to generate a real project ID.');
      return;
    }

    // Explicitly check for Expo Go on Android which no longer supports push notifications
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'android') {
      console.log('expo-notifications: Android Push notification tokens are not supported in Expo Go. Please use a development build.');
      return;
    }

    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log('Expo Push Token:', token);
    } catch (e) {
      console.log('Token generation error:', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications. (Not an emulator/simulator)');
  }

  return token;
}

function AppContent() {
  const { user, token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log('[Startup] AppContent mounted, loading:', loading);
    if (!loading) {
      console.log('[Startup] Loading complete, preparing to hide splash screen');
      // Delay to prevent Android race condition with expo-router <Redirect>
      const timer = setTimeout(async () => {
        try {
          await SplashScreen.hideAsync();
          console.log('[Startup] Splash screen successfully hidden');
        } catch (e) {
          console.error('[Startup] Splash screen hide failed:', e);
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  useEffect(() => {
    if (user?.id) {
      registerForPushNotificationsAsync().then((token) => {
        if (token) {
          api.registerPushToken(token, Platform.OS)
            .then(() => console.log('Token registered on backend'))
            .catch(e => console.error('Token register error:', e));
        }
      });
    }
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
