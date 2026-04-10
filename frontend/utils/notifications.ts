import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { api } from '@/services/api';

export async function requestAndRegisterPushToken(authToken: string): Promise<boolean> {
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
        console.log('[PUSH-FLOW] permission request start');
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        console.log(`[PUSH-FLOW] permission result: ${finalStatus}`);

        if (finalStatus !== 'granted') {
            console.log('[PUSH-FLOW] Failed to get push token for push notification! App will continue normally.');
            return false;
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? "e4aa3746-6261-41f1-bb3d-b0a87b6f0f6e";
        console.log(`[PUSH-FLOW] projectId used for getExpoPushTokenAsync: ${projectId}`);

        if (!projectId || projectId === "placeholder-project-id") {
            console.log('[PUSH-FLOW] No valid projectId found in app.json. Cannot generate push token.');
            return false;
        }

        if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'android') {
            console.log('[PUSH-FLOW] Android Push notification tokens are not supported in Expo Go. Please use a development build.');
            return false;
        }

        try {
            console.log('[PUSH-FLOW] token generation start');
            token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
            console.log('[PUSH-FLOW] token generation end');
            console.log(`[PUSH-FLOW] generated Expo push token value presence: ${!!token}`);

            if (token) {
                console.log('[PUSH-FLOW] backend /push/register start');
                await api.registerPushToken(token, Platform.OS, authToken);
                console.log('[PUSH-FLOW] backend response result: success');
                console.log('[PUSH-FLOW] backend /push/register end');
                return true;
            }
        } catch (e) {
            console.log('[PUSH-FLOW] error thrown during token generation or registration:', e);
            return false;
        }
    } else {
        console.log('[PUSH-FLOW] Must use physical device for Push Notifications. (Not an emulator/simulator)');
        return false;
    }

    return false;
}
