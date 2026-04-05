import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export default function SplashEntry() {
  const { loading, hasOnboarded, token, user } = useAuth();

  useEffect(() => {
    console.log(
      `[Startup Router] loading=${loading}, onboarded=${hasOnboarded}, token=${!!token}, user=${user?.id}`
    );
  }, [loading, hasOnboarded, token, user]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#020617',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="small" color="#ffffff" />
      </View>
    );
  }

  if (!hasOnboarded) return <Redirect href="/onboarding" />;
  if (!token) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}
