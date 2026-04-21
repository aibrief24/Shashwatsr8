import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Platform, InteractionManager } from 'react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AdsContext } from '@/contexts/AdsContext';
import { Colors } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { api } from '@/services/api';
import * as SplashScreen from 'expo-splash-screen';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useSegments, usePathname } from 'expo-router';
import mobileAds from 'react-native-google-mobile-ads';

function GlobalAuthObserver() {
  const { loading, token, hasOnboarded } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();

  const processedNotificationId = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (loading || !token || !hasOnboarded) return;

    const handleNotif = (response: any) => {
      if (
        response &&
        response.notification.request.content.data.articleId &&
        response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        const notifId = response.notification.request.identifier;
        if (processedNotificationId.current !== notifId) {
          processedNotificationId.current = notifId;
          const articleId = response.notification.request.content.data.articleId;
          console.log(`[PUSH-NAV] Tapped notification for article: ${articleId}`);
          router.push(`/article/${articleId}` as any);
        }
      }
    };

    Notifications.getLastNotificationResponseAsync?.().then(response => {
      if (response) handleNotif(response);
    });

    const sub = Notifications.addNotificationResponseReceivedListener(handleNotif);

    return () => {
      sub?.remove?.();
    };
  }, [loading, token, hasOnboarded, router]);

  useEffect(() => {
    if (loading) return;

    const PUBLIC_ROUTES = ['/privacy', '/terms', '/support', '/delete-account'];
    if (PUBLIC_ROUTES.includes(pathname)) {
      return;
    }

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
  }, [loading, token, hasOnboarded, segments, pathname]);

  return null;
}

try { SplashScreen.preventAutoHideAsync(); } catch { }

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

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
  // ── AdMob boot-safe initialization ──────────────────────────────────────
  // adsEnabled starts FALSE. NativeAdView is never rendered until this is true.
  // If mobileAds().initialize() throws for any reason, adsEnabled stays false
  // and the app continues to work normally — just without ads.
  const [adsEnabled, setAdsEnabled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;

    console.log('[AdMob] Starting initialization...');
    mobileAds()
      .initialize()
      .then(() => {
        console.log('[AdMob] Initialization succeeded — ads enabled.');
        setAdsEnabled(true);
      })
      .catch((e: unknown) => {
        console.warn('[AdMob] Initialization failed — ads disabled. App continues normally.', e);
        // adsEnabled stays false — no ad components will be rendered
      });
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AdsContext.Provider value={{ adsEnabled }}>
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
    </AdsContext.Provider>
  );
}
