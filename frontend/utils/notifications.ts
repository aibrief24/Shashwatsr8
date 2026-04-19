import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { api } from '@/services/api';

export async function requestAndRegisterPushToken(authToken: string, logPrefix = '[PUSH-FLOW]'): Promise<boolean> {
    if (Platform.OS === 'web') {
        console.log('[PUSH] Skipping push registration on web');
        return false;
    }

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
        console.log(`${logPrefix} permission request start`);
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        console.log(`${logPrefix} permission result: ${finalStatus}`);

        if (finalStatus !== 'granted') {
            console.log(`${logPrefix} Failed to get push token for push notification! App will continue normally.`);
            return false;
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? "e4aa3746-6261-41f1-bb3d-b0a87b6f0f6e";
        console.log(`${logPrefix} projectId used for getExpoPushTokenAsync: ${projectId}`);

        if (!projectId || projectId === "placeholder-project-id") {
            console.log(`${logPrefix} No valid projectId found in app.json. Cannot generate push token.`);
            return false;
        }

        if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'android') {
            console.log(`${logPrefix} Android Push notification tokens are not supported in Expo Go. Please use a development build.`);
            return false;
        }

        try {
            console.log(`${logPrefix} token generation start`);
            const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
            token = tokenResponse.data;
            console.log(`${logPrefix} token generated`);
            console.log(`${logPrefix} expo token value:`, token);

            if (token) {
                console.log(`${logPrefix} backend /push/register start`);
                await api.registerPushToken(token, Platform.OS, authToken);
                console.log(`${logPrefix} backend response result: success`);
                console.log(`${logPrefix} backend /push/register end`);
                return true;
            }
        } catch (e) {
            console.log(`${logPrefix} error thrown during token generation or registration:`, e);
            return false;
        }
    } else {
        console.log(`${logPrefix} Must use physical device for Push Notifications. (Not an emulator/simulator)`);
        return false;
    }

    return false;
}
