import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getApiBaseUrl = () => {
  // 1. Env variable EXPO_PUBLIC_API_URL öncelikli
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    if (typeof __DEV__ !== 'undefined' && !__DEV__ && !envUrl.toLowerCase().startsWith('https://')) {
      console.warn('Üretim ortamında HTTPS kullanımı zorunludur');
    }
    return envUrl;
  }

  // 2. Web ortamı
  if (Platform.OS === 'web') {
    return 'http://localhost:3000/api/v1';
  }

  // 3. Expo Go yerel geliştirme
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:3000/api/v1`;
  }

  return 'http://192.168.1.42:3000/api/v1';
};

export const API_BASE_URL = getApiBaseUrl();
