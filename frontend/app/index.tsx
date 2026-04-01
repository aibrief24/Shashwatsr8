import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export default function SplashEntry() {
  const { loading, hasOnboarded, user } = useAuth();

  useEffect(() => {
    console.log(`[Startup Router] Index evaluated. loading=${loading}, onboarded=${hasOnboarded}, user=${user?.id}`);
  }, [loading, hasOnboarded, user]);

  if (loading) return <View style={{ flex: 1, backgroundColor: '#020617' }} />;
  if (!hasOnboarded) return <Redirect href="/onboarding" />;
  if (!user) return <Redirect href="/login" />;

  return <Redirect href="/(tabs)" />;
}
