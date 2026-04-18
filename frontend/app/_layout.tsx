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
import { useSegments } from 'expo-router';

function GlobalAuthObserver() {
  const { loading, token, hasOnboarded } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const processedNotificationId = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !token || !hasOnboarded) return;

    if (
      lastNotificationResponse &&
      lastNotificationResponse.notification.request.content.data.articleId &&
      lastNotificationResponse.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
    ) {
      const notifId = lastNotificationResponse.notification.request.identifier;
      if (processedNotificationId.current !== notifId) {
        processedNotificationId.current = notifId;
        const articleId = lastNotificationResponse.notification.request.content.data.articleId;
        console.log(`[PUSH-NAV] Tapped notification for article: ${articleId}`);
        router.push(`/article/${articleId}` as any);
      }
    }
  }, [lastNotificationResponse, loading, token, hasOnboarded, router]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    console.log(`[Auth Observer] token: ${!!token}, segment: ${segments[0]}`);

    if (!hasOnboarded) {
      if (segments[0] !== 'onboarding') router.replace('/onboarding');
      return;
    }

    if (!token) {
      const currentSegment = segments[0] as string;
      if (currentSegment !== 'login' && currentSegment !== 'signup' && currentSegment !== 'forgot-password' && currentSegment !== 'reset-password') {
        router.replace('/login');
      }
    } else {
      const allowedAuthRoutes = ['(tabs)', 'article', 'search', 'privacy', 'reset-password'];
      if (!allowedAuthRoutes.includes(segments[0] as string)) {
        console.log(`[Auth Observer] executing unified navigate to /tabs from segment: ${segments[0]}`);
        router.replace('/(tabs)');
      }
    }
  }, [loading, token, hasOnboarded, segments]);

  return null;
}

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

// removed auto-prompting NotificationObserver

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
        <GlobalAuthObserver />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'none',
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
