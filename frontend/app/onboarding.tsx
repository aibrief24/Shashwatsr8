import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  FlatList,
  useWindowDimensions,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, FontSize, Radius } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Zap, Image as ImageIcon, Bookmark, Bell } from 'lucide-react-native';
import CategoryPicker from '@/components/CategoryPicker';

const slides = [
  { icon: Zap, title: 'AI News, Lightning Fast', desc: 'Get the latest AI updates in bite-sized summaries you can read in 60 seconds. Swipe through news like never before.', color: Colors.primary },
  { icon: ImageIcon, title: 'Image + Summary + Source', desc: 'Every article comes with a relevant image, a concise AI-generated summary, and a link to the original source.', color: Colors.secondary },
  { icon: Bookmark, title: 'Bookmark & Share', desc: 'Save articles for later reading and share the most interesting AI news with your network instantly.', color: Colors.success },
  { icon: Bell, title: 'Never Miss an Update', desc: 'Enable push notifications to get alerted the moment breaking AI news drops. Stay ahead of the curve.', color: Colors.accent },
];

// The interest picker is the final onboarding step (index === slides.length).
const PICKER_STEP = slides.length;
const TOTAL_STEPS = slides.length + 1;

// Pages of the horizontal pager: the 4 intro slides, then the interest picker.
// The picker is last, so there is nothing to swipe to beyond it.
type OnboardingPage =
  | { key: string; type: 'slide'; slide: (typeof slides)[number] }
  | { key: string; type: 'picker' };

const PAGES: OnboardingPage[] = [
  ...slides.map((slide, i) => ({ key: `slide-${i}`, type: 'slide' as const, slide })),
  { key: 'picker', type: 'picker' as const },
];

export default function OnboardingScreen() {
  // `page` is the SINGLE source of truth for: which page the pager shows, which
  // dot is active, the Next button label, and whether Skip/Next render at all.
  // Both swipes and button taps funnel into it.
  const [page, setPage] = useState(0);
  const router = useRouter();
  const { completeOnboarding } = useAuth();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<OnboardingPage>>(null);

  const handleFinish = useCallback(async () => {
    await completeOnboarding();
    router.replace('/(tabs)');
  }, [completeOnboarding, router]);

  // Button-driven navigation: update the index and drive the pager to match.
  const goToIndex = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, TOTAL_STEPS - 1));
    setPage(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  }, []);

  // Swipe-driven navigation. Paging snaps to exact multiples of the page width,
  // so rounding the offset yields the settled index on both platforms.
  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return;
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      const clamped = Math.max(0, Math.min(next, TOTAL_STEPS - 1));
      setPage(prev => (prev === clamped ? prev : clamped));
    },
    [width]
  );

  const handleNext = useCallback(() => {
    // The last slide advances to the picker; the picker finishes onboarding itself.
    if (page < PICKER_STEP) goToIndex(page + 1);
  }, [page, goToIndex]);

  // "Skip" skips the intro slides, not the interest picker — a selection is
  // required before the feed can be personalized.
  const handleSkipSlides = useCallback(() => goToIndex(PICKER_STEP), [goToIndex]);

  // Exact page geometry so scrollToIndex lands precisely without measurement.
  const getItemLayout = useCallback(
    (_data: ArrayLike<OnboardingPage> | null | undefined, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width]
  );

  const renderPage = useCallback(
    ({ item }: ListRenderItemInfo<OnboardingPage>) => {
      if (item.type === 'picker') {
        return (
          <View style={{ width }}>
            <View style={styles.pickerArea}>
              <CategoryPicker
                confirmLabel="Get Started"
                onConfirm={handleFinish}
              />
            </View>
          </View>
        );
      }

      const Icon = item.slide.icon;
      return (
        <View style={{ width }}>
          <View style={styles.slideArea}>
            <View style={styles.iconWrapOuter}>
              <LinearGradient colors={[item.slide.color + '30', 'transparent']} style={StyleSheet.absoluteFillObject} />
              <View style={[styles.iconWrap, { borderColor: item.slide.color + '40' }]}>
                <Icon size={56} color={item.slide.color} strokeWidth={1.5} />
              </View>
            </View>
            <Text style={styles.slideTitle}>{item.slide.title}</Text>
            <Text style={styles.slideDesc}>{item.slide.desc}</Text>
          </View>
        </View>
      );
    },
    [width, handleFinish]
  );

  const isPickerStep = page === PICKER_STEP;

  const renderDots = () => (
    <View style={styles.dots}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View key={i} style={[styles.dot, page === i && styles.dotActive]} />
      ))}
    </View>
  );

  return (
    <View testID="onboarding-screen" style={styles.container}>
      {/* Header — Skip is hidden on the picker step, exactly as before. */}
      <SafeAreaView style={styles.headerArea}>
        <View style={styles.headerRow}>
          <View style={styles.spacer} />
          {!isPickerStep && (
            <TouchableOpacity testID="skip-btn" style={styles.skipBtn} onPress={handleSkipSlides}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {/* Content — horizontal paged swipe. The picker is the last page, so the
          pager physically cannot scroll past it; iOS bounce rubber-bands and
          snaps back without ever reaching a "finished" state, because finishing
          only happens via CategoryPicker's own confirm callback. */}
      <FlatList
        ref={listRef}
        testID="onboarding-pager"
        data={PAGES}
        keyExtractor={item => item.key}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumScrollEnd}
        getItemLayout={getItemLayout}
        // Keep all 5 pages mounted: the picker must not lose the user's
        // selection when they swipe back to a slide and forward again.
        initialNumToRender={TOTAL_STEPS}
        windowSize={TOTAL_STEPS}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        style={styles.pager}
      />

      {/* Bottom — dots always. The Next button renders only on the intro slides;
          on the picker step the finish control is CategoryPicker's own footer
          button ("Get Started" / "Select N more to continue"), as before. */}
      <View style={isPickerStep ? styles.pickerDots : styles.bottomSection}>
        {renderDots()}
        {!isPickerStep && (
          <TouchableOpacity testID="onboarding-next-btn" onPress={handleNext} activeOpacity={0.8}>
            <LinearGradient colors={[Colors.primary, Colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGrad}>
              <Text style={styles.nextBtnText}>{page === slides.length - 1 ? 'Choose Interests' : 'Next'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
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
  pager: { flex: 1 },
  slideArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  pickerArea: { flex: 1 },
  // `dots` already carries marginBottom: 32, which doubles as the bottom inset here.
  pickerDots: { alignItems: 'center' },
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
