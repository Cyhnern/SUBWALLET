import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getApiBaseUrl = () => {
  if (Platform.OS === 'web') {
    return 'http://localhost:3000/api/v1';
  }

  // Expo Go üzerinden telefonda test ederken bilgisayarın IP'sini hostUri'den otomatik al
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:3000/api/v1`;
  }

  return 'http://192.168.1.42:3000/api/v1';
};

export const API_BASE_URL = getApiBaseUrl();
