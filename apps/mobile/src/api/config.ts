import { Platform } from 'react-native';

// Web tarayıcısında test ederken localhost:3000 kullanılır.
// Fiziksel telefonda test ederken bilgisayarının yerel ağ IP'sini (örn. 192.168.1.42) yazabilirsin.
export const API_BASE_URL =
  Platform.OS === 'web'
    ? 'http://localhost:3000/api/v1'
    : 'http://192.168.1.42:3000/api/v1';
