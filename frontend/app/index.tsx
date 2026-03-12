import { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, FontSize } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

export default function SplashEntry() {
  const { loading, hasOnboarded, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      if (!hasOnboarded) {
        router.replace('/onboarding');
      } else if (!user) {
        router.replace('/login');
      } else {
        router.replace('/(tabs)');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [loading, hasOnboarded, user]);

  return (
    <LinearGradient colors={['#020617', '#0F172A', '#020617']} style={styles.container}>
      <View testID="splash-screen" style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>AI</Text>
          </View>
          <Text style={styles.appName}>AIBrief24</Text>
        </View>
        <Text style={styles.tagline}>AI News in 60 Seconds</Text>
        <ActivityIndicator color={Colors.primary} style={styles.loader} size="small" />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: 16 },
  logoBadge: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 24, elevation: 12,
    marginBottom: 20,
  },
  logoIcon: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  appName: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
  tagline: { fontSize: FontSize.base, color: Colors.textSecondary, marginTop: 8 },
  loader: { marginTop: 48 },
});
