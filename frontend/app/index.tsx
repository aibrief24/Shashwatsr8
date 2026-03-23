import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

export default function SplashEntry() {
  const { loading, hasOnboarded, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // Auth resolved via local storage, route instantly
    if (!hasOnboarded) {
      router.replace('/onboarding');
    } else if (!user) {
      router.replace('/login');
    } else {
      router.replace('/(tabs)');
    }
  }, [loading, hasOnboarded, user]);

  return <View style={{ flex: 1, backgroundColor: '#020617' }} />;
}
