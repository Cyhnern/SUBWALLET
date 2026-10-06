import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/context/AuthContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="add-subscription"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'Yeni Abonelik',
              headerStyle: { backgroundColor: '#0F172A' },
              headerTintColor: '#fff',
            }}
          />
          <Stack.Screen
            name="subscription/[id]"
            options={{
              headerShown: true,
              title: 'Abonelik',
              headerStyle: { backgroundColor: '#0F172A' },
              headerTintColor: '#fff',
            }}
          />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
