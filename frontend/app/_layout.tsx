import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform, InteractionManager } from 'react-native';
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
    console.log('[DEBUG-CRASH] permission request start');
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    console.log(`[DEBUG-CRASH] permission result: ${finalStatus}`);

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? "e4aa3746-6261-41f1-bb3d-b0a87b6f0f6e";
    console.log(`[DEBUG-CRASH] projectId used for getExpoPushTokenAsync: ${projectId}`);

    if (!projectId || projectId === "placeholder-project-id") {
      console.log('No valid projectId found in app.json. Please run `eas init` to generate a real project ID.');
      return;
    }

    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'android') {
      console.log('expo-notifications: Android Push notification tokens are not supported in Expo Go. Please use a development build.');
      return;
    }

    try {
      console.log('[DEBUG-CRASH] token generation start');
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log('[DEBUG-CRASH] token generation end');
      console.log(`[DEBUG-CRASH] generated Expo push token value presence: ${!!token}`);
      console.log('Expo Push Token:', token);
    } catch (e) {
      console.log('[DEBUG-CRASH] error thrown during token generation:', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications. (Not an emulator/simulator)');
  }

  return token;
}

function NotificationObserver() {
  const { user, token } = useAuth();

  useEffect(() => {
    console.log('[DEBUG-CRASH] NotificationObserver mount');
    if (user?.id && token) {
      console.log('[DEBUG] Immediate Push Registration (No Timeout to avoid Android 13 prompt suppression)');
      InteractionManager.runAfterInteractions(() => {
        registerForPushNotificationsAsync().then((pushToken) => {
          if (pushToken) {
            console.log('[DEBUG-CRASH] backend /push/register start');
            api.registerPushToken(pushToken, Platform.OS, token)
              .then(() => {
                console.log('[DEBUG-CRASH] backend response result: success');
                console.log('[DEBUG-CRASH] backend /push/register end');
              })
              .catch((e: any) => console.error('[DEBUG-CRASH] error thrown during register flow:', e));
          }
        }).catch((err: any) => console.log('[DEBUG-CRASH] error thrown during permission/token flow:', err));
      });
    }
  }, [user?.id, token]);

  return null;
}

function GlobalSplashHider() {
  useEffect(() => {
    console.log('[Startup] Setting 800ms timer to hide splash screen');
    const timer = setTimeout(async () => {
      try {
        await SplashScreen.hideAsync();
      } catch (e) {
        console.error('[Startup] Splash screen hide failed:', e);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="light" />
        <GlobalSplashHider />
        <NotificationObserver />
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
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
