import { Stack } from 'expo-router';
import { AuthProvider } from '@/lib/auth';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: 'Flointra',
            headerStyle: { backgroundColor: '#F9F5FF' },
            headerTintColor: '#2D1B69',
          }}
        />
      </Stack>
    </AuthProvider>
  );
}
