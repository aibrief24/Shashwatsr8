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
        <View style={styles.iconWrapOuter}>
          <LinearGradient colors={[currentSlide.color + '30', 'transparent']} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.iconWrap, { borderColor: currentSlide.color + '40' }]}>
            <Icon size={56} color={currentSlide.color} strokeWidth={1.5} />
          </View>
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
  slideArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  iconWrapOuter: {
    width: 140, height: 140, borderRadius: 70,
    justifyContent: 'center', alignItems: 'center', marginBottom: 40,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: Colors.surface,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.5, shadowRadius: 30, elevation: 10,
  },
  iconWrap: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', borderWidth: 1, backgroundColor: Colors.background },
  slideTitle: { fontSize: 30, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 16, letterSpacing: -0.5, lineHeight: 36 },
  slideDesc: { fontSize: 16, color: '#94A3B8', textAlign: 'center', lineHeight: 24, paddingHorizontal: 12 },
  bottomSection: { paddingBottom: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 32, alignItems: 'center' },
  dots: { flexDirection: 'row', marginBottom: 32 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.surfaceHighlight, marginHorizontal: 4 },
  dotActive: { width: 20, backgroundColor: Colors.primary },
  nextBtnGrad: { height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 100, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 6 },
  nextBtnText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
});
