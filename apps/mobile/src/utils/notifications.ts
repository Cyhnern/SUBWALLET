import { Platform } from 'react-native';
import { usersApi } from '../api/users';

/**
 * Register for Push Notifications and send token to SubWallet API
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    // Check if running in browser or native platform
    if (Platform.OS === 'web') {
      console.log('Push notifications are managed via Web Push / Service Workers on web');
      return null;
    }

    // Try requiring expo-notifications safely on native platforms
    let Notifications: any = null;
    try {
      Notifications = require('expo-notifications');
    } catch {
      console.log('expo-notifications module not installed in current environment');
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
      console.log('Push notification permission denied');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData?.data;

    if (token) {
      await usersApi.updateMe({ pushToken: token });
      console.log('Push Token registered successfully:', token);
    }

    return token || null;
  } catch (error) {
    console.log('Error registering for push notifications:', error);
    return null;
  }
}
