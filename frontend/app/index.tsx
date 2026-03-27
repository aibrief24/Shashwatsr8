import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';

export default function SplashEntry() {
  const { loading, hasOnboarded, user } = useAuth();

  if (loading) return <View style={{ flex: 1, backgroundColor: '#020617' }} />;
  if (!hasOnboarded) return <Redirect href="/onboarding" />;
  if (!user) return <Redirect href="/login" />;

  return <Redirect href="/(tabs)" />;
}
