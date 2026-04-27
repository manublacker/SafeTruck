import { useEffect } from 'react';
import { DarkTheme as NavDark, DefaultTheme as NavLight, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { loadToken } from '@/services/api';

export const unstable_settings = {
  anchor: '(tabs)',
};

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { tokens } = useTheme();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: tokens.surface }}>
        <ActivityIndicator size="large" color={tokens.brand} />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutInner() {
  const { isDark } = useTheme();

  return (
    <NavThemeProvider value={isDark ? NavDark : NavLight}>
      <AuthGate>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack>
      </AuthGate>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    loadToken();
  }, []);

  return (
    <AuthProvider>
      <AppThemeProvider>
        <RootLayoutInner />
      </AppThemeProvider>
    </AuthProvider>
  );
}
