import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { usersApi } from '../api/users';

/**
 * Register for Push Notifications and send token to SubWallet API
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return null;
    }

    let Notifications: any = null;
    try {
      Notifications = require('expo-notifications');
    } catch {
      return null;
    }

    if (!Notifications) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#e11d48',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenData?.data;

    if (token) {
      await usersApi.registerDevice({ token, platform: Platform.OS });
    }

    return token || null;
  } catch (error) {
    return null;
  }
}
