import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';

/**
 * The user's notification INTENT, independent of the OS permission.
 *
 * Unset  → treated as true, so existing installs keep their current behaviour.
 * 'false' → the user explicitly turned notifications off in Settings; the app
 *           must not silently re-register on the next launch, or the toggle
 *           would undo itself.
 */
export const PUSH_ENABLED_KEY = 'push_enabled';

export async function isPushEnabled(): Promise<boolean> {
    try {
        const raw = await AsyncStorage.getItem(PUSH_ENABLED_KEY);
        return raw !== 'false';
    } catch (e) {
        console.log('[PUSH] Failed to read push_enabled, defaulting to true', e);
        return true;
    }
}

export async function setPushEnabled(enabled: boolean): Promise<void> {
    try {
        await AsyncStorage.setItem(PUSH_ENABLED_KEY, enabled ? 'true' : 'false');
        console.log(`[PUSH] push_enabled = ${enabled}`);
    } catch (e) {
        console.log('[PUSH] Failed to persist push_enabled', e);
    }
}

// ── OS permission ────────────────────────────────────────────────────────────

export type PushPermission = {
    status: Notifications.PermissionStatus | 'undetermined';
    canAskAgain: boolean;
};

/** Read-only permission check — never prompts. */
export async function getPushPermission(): Promise<PushPermission> {
    if (Platform.OS === 'web' || !Device.isDevice) {
        return { status: Notifications.PermissionStatus.DENIED, canAskAgain: false };
    }
    try {
        const res = await Notifications.getPermissionsAsync();
        return { status: res.status, canAskAgain: res.canAskAgain };
    } catch (e) {
        console.log('[PUSH] getPermissionsAsync failed', e);
        return { status: Notifications.PermissionStatus.DENIED, canAskAgain: false };
    }
}

/** Presents the OS permission dialog. Only call when status is undetermined. */
export async function requestPushPermission(): Promise<PushPermission> {
    try {
        const res = await Notifications.requestPermissionsAsync();
        return { status: res.status, canAskAgain: res.canAskAgain };
    } catch (e) {
        console.log('[PUSH] requestPermissionsAsync failed', e);
        return { status: Notifications.PermissionStatus.DENIED, canAskAgain: false };
    }
}

// ── Expo push token ──────────────────────────────────────────────────────────

/**
 * Fetch this device's Expo push token. Does NOT request permission — callers
 * decide whether prompting is appropriate. Returns null when a token cannot
 * exist here (web, simulator, Expo Go on Android, missing projectId).
 */
export async function getExpoPushToken(logPrefix = '[PUSH-FLOW]'): Promise<string | null> {
    if (Platform.OS === 'web') {
        console.log('[PUSH] Skipping push token on web');
        return null;
    }

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    if (!Device.isDevice) {
        console.log(`${logPrefix} Must use physical device for Push Notifications. (Not an emulator/simulator)`);
        return null;
    }

    const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId ??
        'e4aa3746-6261-41f1-bb3d-b0a87b6f0f6e';
    console.log(`${logPrefix} projectId used for getExpoPushTokenAsync: ${projectId}`);

    if (!projectId || projectId === 'placeholder-project-id') {
        console.log(`${logPrefix} No valid projectId found in app.json. Cannot generate push token.`);
        return null;
    }

    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'android') {
        console.log(`${logPrefix} Android Push notification tokens are not supported in Expo Go. Please use a development build.`);
        return null;
    }

    try {
        console.log(`${logPrefix} token generation start`);
        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        console.log(`${logPrefix} token generated`);
        return tokenResponse.data || null;
    } catch (e) {
        console.log(`${logPrefix} error thrown during token generation:`, e);
        return null;
    }
}

// ── Server registration ──────────────────────────────────────────────────────

/**
 * Register this device's token with the backend. Assumes permission is already
 * granted. Returns false if no token could be obtained or the call failed.
 */
export async function enablePushOnServer(authToken?: string, logPrefix = '[PUSH-FLOW]'): Promise<boolean> {
    const token = await getExpoPushToken(logPrefix);
    if (!token) return false;

    try {
        console.log(`${logPrefix} backend /push/register start`);
        await api.registerPushToken(token, Platform.OS, authToken);
        console.log(`${logPrefix} backend /push/register end`);
        return true;
    } catch (e) {
        console.log(`${logPrefix} /push/register failed:`, e);
        return false;
    }
}

/**
 * Deactivate this device's token server-side so the notification worker stops
 * selecting it. Returns false only when there is a token that we failed to
 * unregister — a device that never had one (web/simulator) is already silent,
 * which counts as success.
 */
export async function disablePushOnServer(authToken?: string, logPrefix = '[PUSH-FLOW]'): Promise<boolean> {
    if (Platform.OS === 'web' || !Device.isDevice) {
        console.log(`${logPrefix} No push token can exist here — nothing to unregister`);
        return true;
    }

    const token = await getExpoPushToken(logPrefix);
    if (!token) {
        // A real device that cannot produce its token: we must not claim the
        // server-side token was deactivated when it may still be active.
        console.log(`${logPrefix} Could not resolve push token — unregister aborted`);
        return false;
    }

    try {
        console.log(`${logPrefix} backend /push/unregister start`);
        await api.unregisterPush(token, authToken);
        console.log(`${logPrefix} backend /push/unregister end`);
        return true;
    } catch (e) {
        console.log(`${logPrefix} /push/unregister failed:`, e);
        return false;
    }
}

/**
 * Full opt-in flow: request permission if needed, then register.
 * Unchanged public signature — existing callers keep working.
 */
export async function requestAndRegisterPushToken(authToken?: string, logPrefix = '[PUSH-FLOW]'): Promise<boolean> {
    if (Platform.OS === 'web') {
        console.log('[PUSH] Skipping push registration on web');
        return false;
    }

    if (!Device.isDevice) {
        console.log(`${logPrefix} Must use physical device for Push Notifications. (Not an emulator/simulator)`);
        return false;
    }

    console.log(`${logPrefix} permission request start`);
    const existing = await getPushPermission();
    let finalStatus = existing.status;

    if (finalStatus !== Notifications.PermissionStatus.GRANTED) {
        const requested = await requestPushPermission();
        finalStatus = requested.status;
    }
    console.log(`${logPrefix} permission result: ${finalStatus}`);

    if (finalStatus !== Notifications.PermissionStatus.GRANTED) {
        console.log(`${logPrefix} Failed to get push token for push notification! App will continue normally.`);
        return false;
    }

    return enablePushOnServer(authToken, logPrefix);
}
