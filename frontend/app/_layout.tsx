import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Platform, InteractionManager, Linking, AppState } from 'react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AdsContext } from '@/contexts/AdsContext';
import { Colors } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { api } from '@/services/api';
import { requestAndRegisterPushToken, isPushEnabled } from '@/utils/notifications';
import * as SplashScreen from 'expo-splash-screen';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useSegments, usePathname } from 'expo-router';
import mobileAds from 'react-native-google-mobile-ads';
import { Settings as FBSettings } from 'react-native-fbsdk-next';
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  PermissionStatus,
} from 'expo-tracking-transparency';
import AsyncStorage from '@react-native-async-storage/async-storage';

function GlobalAuthObserver() {
  const { loading, token, hasOnboarded } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();

  const processedNotificationId = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (loading || !hasOnboarded) return;

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
    if (Platform.OS === 'web') return;
    if (loading || !hasOnboarded) return;

    // Respect an explicit opt-out: re-registering here would silently undo the
    // Settings toggle on the next launch.
    let cancelled = false;
    (async () => {
      if (!(await isPushEnabled())) {
        console.log('[PUSH-FLOW] auto-register skipped — notifications turned off by user');
        return;
      }
      if (cancelled) return;
      requestAndRegisterPushToken(token ?? undefined).catch(() => {});
    })();

    return () => { cancelled = true; };
  }, [loading, hasOnboarded, token]);

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
      const browseAllowed = ['(tabs)', 'article', 'search', 'login', 'signup', 'forgot-password', 'reset-password', 'privacy'];
      if (!browseAllowed.includes(currentSegment)) {
        router.replace('/(tabs)');
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

function GlobalDeepLinkCapture() {
  useEffect(() => {
    const captureUrl = async (url: string | null) => {
      if (!url) return;
      console.log(`[DeepLink] Captured URL: ${url}`);
      if (url.includes('reset-password')) {
        console.log(`[DeepLink] Storing reset-password URL to AsyncStorage`);
        try {
          await AsyncStorage.setItem('@pending_reset_url', url);
        } catch (e) {
          console.error('[DeepLink] Failed to store URL', e);
        }
      }
    };
    Linking.getInitialURL().then(captureUrl).catch((e) => console.error('[DeepLink] getInitialURL error', e));
    const sub = Linking.addEventListener('url', ({ url }) => captureUrl(url));
    return () => sub.remove();
  }, []);
  return null;
}

// ── Startup timing ──────────────────────────────────────────────────────────
// The native splash is hidden SPLASH_HIDE_DELAY_MS after mount. The ATT prompt
// waits until after that plus a settle delay, so the dialog can never be raised
// while the splash still covers the screen — an App Store reviewer must see the
// app's UI before the tracking dialog appears. Keep these two in sync; that is
// why the splash timer reads the same constant instead of a bare literal.
const SPLASH_HIDE_DELAY_MS = 800;
const ATT_SETTLE_DELAY_MS = 500;
const ATT_PROMPT_DELAY_MS = SPLASH_HIDE_DELAY_MS + ATT_SETTLE_DELAY_MS;

function GlobalSplashHider() {
  useEffect(() => {
    console.log(`[Startup] Setting ${SPLASH_HIDE_DELAY_MS}ms timer to hide splash screen`);
    const timer = setTimeout(async () => {
      try {
        await SplashScreen.hideAsync();
      } catch (e) {
        console.error('[Startup] Splash screen hide failed:', e);
      }
    }, SPLASH_HIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

/**
 * Requests App Tracking Transparency, then initializes the ad SDKs.
 *
 * WHY IT IS SHAPED LIKE THIS — App Store Guideline 2.1 rejection:
 * iOS silently no-ops `requestTrackingPermissionsAsync()` unless the app is in
 * the `active` UIApplicationState. The previous version called it from a bare
 * mount effect during cold start, while the app was still inactive behind the
 * splash, so on the reviewer's device the dialog never appeared and the app was
 * rejected for declaring ATT without ever prompting.
 *
 * EVERY condition below must hold before the prompt is raised:
 *   1. AppState.currentState === 'active'  — otherwise we subscribe and wait,
 *      and we re-check immediately before prompting in case we were backgrounded.
 *   2. The root navigator has mounted      — this hook only runs from RootLayout.
 *   3. Interactions/animations have settled — InteractionManager.runAfterInteractions.
 *   4. The splash is gone + a settle delay  — ATT_PROMPT_DELAY_MS.
 *
 * The ad SDKs are initialized ONLY after the ATT status resolves (granted,
 * denied, or already-determined on a previous launch), so no tracking-enabled
 * ad request can ever be made pre-consent.
 *
 * As before: adsEnabled starts FALSE and NativeAdView is never rendered until
 * it is true. If mobileAds().initialize() throws, adsEnabled stays false and the
 * app continues to work normally — just without ads.
 */
function useAdsBootstrap(): boolean {
  const [adsEnabled, setAdsEnabled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;

    let cancelled = false;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let interaction: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
    let appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;

    // Function declarations (not consts) so the mutual references below are
    // hoisted and order-independent.
    function initAdSdks(trackingAuthorized: boolean) {
      console.log(`[AdMob] Starting initialization (tracking authorized: ${trackingAuthorized})...`);
      mobileAds()
        .initialize()
        .then(() => {
          if (cancelled) return;
          console.log('[AdMob] Initialization succeeded — ads enabled.');
          setAdsEnabled(true);
        })
        .catch((e: unknown) => {
          console.warn('[AdMob] Initialization failed — ads disabled. App continues normally.', e);
          // adsEnabled stays false — no ad components will be rendered
        });

      // ── Meta (Facebook) SDK init for install/event tracking ──────────────
      // ANDROID ONLY, deliberately.
      //
      // The native iOS project contains NO Facebook configuration whatsoever —
      // no FacebookAppID, FacebookClientToken, or fb<appid> URL scheme in
      // ios/AIBrief24/Info.plist. The react-native-fbsdk-next config plugin in
      // app.json was never applied to this prebuild-ejected ios/ directory, so
      // on iOS the SDK has no App ID, cannot initialize, and cannot attribute
      // anything. Calling it there is dead weight in the startup path — and it
      // would silently become a real pre-consent tracking call the moment
      // someone does wire the native config up.
      //
      // If Meta attribution is wanted on iOS: add the native config first, then
      // re-enable it here gated on `trackingAuthorized` (never unconditionally).
      if (Platform.OS === 'android') {
        try {
          FBSettings.initializeSDK();
          FBSettings.setAdvertiserTrackingEnabled(true); // no ATT on Android
          console.log('[FBSDK] Initialized (Android).');
        } catch (e) {
          console.warn('[FBSDK] init failed', e);
        }
      } else {
        console.log('[FBSDK] Skipped on iOS — SDK has no native configuration.');
      }
    }

    function armAppStateListener() {
      if (appStateSub || cancelled) return;
      appStateSub = AppState.addEventListener('change', (next) => {
        if (next !== 'active' || cancelled) return;
        appStateSub?.remove();
        appStateSub = null;
        console.log('[ATT] App became active — scheduling prompt');
        scheduleAfterFirstRender();
      });
    }

    async function requestAttThenInitAds() {
      if (cancelled || started) return;

      // Gate (1), re-checked at the last moment: the app may have been
      // backgrounded while we were waiting out the delay.
      if (AppState.currentState !== 'active') {
        console.log(`[ATT] App is "${AppState.currentState}" at prompt time — deferring`);
        armAppStateListener();
        return;
      }
      started = true;

      let trackingAuthorized = false;

      if (Platform.OS === 'ios') {
        try {
          const current = await getTrackingPermissionsAsync();
          if (current.status === PermissionStatus.UNDETERMINED) {
            console.log('[ATT] Status undetermined — presenting prompt now');
            const result = await requestTrackingPermissionsAsync();
            trackingAuthorized = result.status === PermissionStatus.GRANTED;
            console.log(`[ATT] User responded: ${result.status}`);
          } else {
            // Already granted/denied on a previous launch — never re-prompt.
            trackingAuthorized = current.status === PermissionStatus.GRANTED;
            console.log(`[ATT] Already determined (${current.status}) — skipping prompt`);
          }
        } catch (e) {
          console.log('[ATT] request failed', e);
        }
      }

      if (cancelled) return;
      initAdSdks(trackingAuthorized);
    }

    function scheduleAfterFirstRender() {
      // Gates (2) + (3) + (4).
      interaction = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        timer = setTimeout(requestAttThenInitAds, ATT_PROMPT_DELAY_MS);
      });
    }

    if (AppState.currentState === 'active') {
      scheduleAfterFirstRender();
    } else {
      console.log(`[ATT] AppState is "${AppState.currentState}" at mount — waiting for active`);
      armAppStateListener();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      interaction?.cancel();
      appStateSub?.remove();
    };
  }, []);

  return adsEnabled;
}

export default function RootLayout() {
  // ATT prompt + ad SDK init, gated on the app being active and the UI visible.
  const adsEnabled = useAdsBootstrap();

  return (
    <AdsContext.Provider value={{ adsEnabled }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <StatusBar style="light" />
          <GlobalSplashHider />
          <GlobalDeepLinkCapture />
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
