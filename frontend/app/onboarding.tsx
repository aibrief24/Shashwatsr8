import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, FontSize, Radius } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Zap, Image as ImageIcon, Bookmark, Bell } from 'lucide-react-native';

const slides = [
  { icon: Zap, title: 'AI News, Lightning Fast', desc: 'Get the latest AI updates in bite-sized summaries you can read in 60 seconds. Swipe through news like never before.', color: Colors.primary },
  { icon: ImageIcon, title: 'Image + Summary + Source', desc: 'Every article comes with a relevant image, a concise AI-generated summary, and a link to the original source.', color: Colors.secondary },
  { icon: Bookmark, title: 'Bookmark & Share', desc: 'Save articles for later reading and share the most interesting AI news with your network instantly.', color: Colors.success },
  { icon: Bell, title: 'Never Miss an Update', desc: 'Enable push notifications to get alerted the moment breaking AI news drops. Stay ahead of the curve.', color: Colors.accent },
];

export default function OnboardingScreen() {
  const [page, setPage] = useState(0);
  const router = useRouter();
  const { completeOnboarding } = useAuth();

  const handleFinish = async () => {
    await completeOnboarding();
    router.replace('/login');
  };

  const handleNext = () => {
    if (page < slides.length - 1) {
      setPage(page + 1);
    } else {
      handleFinish();
    }
  };

  const currentSlide = slides[page];
  const Icon = currentSlide.icon;

  return (
    <View testID="onboarding-screen" style={styles.container}>
      {/* Header */}
      <SafeAreaView style={styles.headerArea}>
        <View style={styles.headerRow}>
          <View style={styles.spacer} />
          <TouchableOpacity testID="skip-btn" style={styles.skipBtn} onPress={handleFinish}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Content */}
      <View style={styles.slideArea}>
        <View style={[styles.iconWrap, { backgroundColor: currentSlide.color + '25', borderColor: currentSlide.color + '40' }]}>
          <Icon size={48} color={currentSlide.color} strokeWidth={1.5} />
        </View>
        <Text style={styles.slideTitle}>{currentSlide.title}</Text>
        <Text style={styles.slideDesc}>{currentSlide.desc}</Text>
      </View>

      {/* Bottom */}
      <View style={styles.bottomSection}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, page === i && styles.dotActive]} />
          ))}
        </View>
        <TouchableOpacity testID="onboarding-next-btn" onPress={handleNext} activeOpacity={0.8}>
          <LinearGradient colors={[Colors.primary, Colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGrad}>
            <Text style={styles.nextBtnText}>{page === slides.length - 1 ? 'Get Started' : 'Next'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerArea: { backgroundColor: 'transparent' },
  headerRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: Platform.OS === 'web' ? 20 : 8, paddingBottom: 8 },
  spacer: { flex: 1 },
  skipBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  skipText: { color: Colors.textSecondary, fontSize: FontSize.base },
  slideArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  iconWrap: {
    width: 100, height: 100, borderRadius: 30,
    justifyContent: 'center', alignItems: 'center', marginBottom: 32,
    borderWidth: 1,
  },
  slideTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 16, letterSpacing: -0.5 },
  slideDesc: { fontSize: 16, color: '#94A3B8', textAlign: 'center', lineHeight: 24 },
  bottomSection: { paddingBottom: Platform.OS === 'ios' ? 50 : 30, paddingHorizontal: 24, alignItems: 'center' },
  dots: { flexDirection: 'row', marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.surfaceHighlight, marginHorizontal: 4 },
  dotActive: { width: 24, backgroundColor: Colors.primary },
  nextBtnGrad: { height: 56, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 100 },
  nextBtnText: { fontSize: FontSize.lg, fontWeight: '700', color: '#FFFFFF' },
});
