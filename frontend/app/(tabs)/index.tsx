import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Platform, Linking, Share, ActivityIndicator, FlatList, ViewToken, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { Colors, FontSize, Spacing, Radius, TELEGRAM_URL, WEBSITE_URL } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Bookmark, BookmarkCheck, ExternalLink, Share2, Send, Globe, Zap, Clock } from 'lucide-react-native';



interface Article {
  id: string;
  title: string;
  summary: string;
  image_url: string;
  source_name: string;
  category: string;
  published_at: string;
  article_url: string;
  is_breaking?: boolean;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function HomeFeed() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { token, toggleBookmark, isBookmarked } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);

  const HEADER_HEIGHT = insets.top + 52;
  const TAB_BAR_OFFSET = Platform.OS === 'ios' ? 100 : 90;
  const CARD_HEIGHT = height - HEADER_HEIGHT;

  useEffect(() => {
    loadArticles();
  }, []);

  const loadArticles = async () => {
    try {
      const res = await api.getArticles();
      setArticles(res.articles || []);
    } catch (e) {
      console.log('Failed to load articles:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async (article: Article) => {
    try {
      await Share.share({ message: `${article.title}\n\nRead more on AIBrief24:\n${article.article_url}`, title: article.title });
    } catch { }
  };

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading AI news...</Text>
      </View>
    );
  }

  const renderCard = ({ item: article, index }: { item: Article; index: number }) => (
    <View style={[styles.page, { height: CARD_HEIGHT }]}>
      <View style={styles.imageContainer}>
        <Image source={{ uri: article.image_url }} style={styles.image} resizeMode="cover" />
        <LinearGradient colors={['transparent', 'rgba(2,6,23,0.6)', Colors.background]} style={styles.imageOverlay} />
        {article.is_breaking && (
          <View style={styles.breakingBadge}>
            <Zap size={12} color="#fff" fill="#fff" />
            <Text style={styles.breakingText}>BREAKING</Text>
          </View>
        )}
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{article.category}</Text>
        </View>
      </View>

      <View style={[styles.cardContent, { paddingBottom: TAB_BAR_OFFSET }]}>
        <View>
          <Text testID={`article-title-${index}`} style={styles.articleTitle} numberOfLines={3}>{article.title}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaSource}>{article.source_name}</Text>
            <View style={styles.metaDot} />
            <Clock size={12} color={Colors.textTertiary} />
            <Text style={styles.metaTime}>{timeAgo(article.published_at)}</Text>
          </View>
        </View>

        <Text style={styles.articleSummary} numberOfLines={5}>{article.summary}</Text>

        <View style={styles.actions}>
          <TouchableOpacity testID={`read-full-btn-${index}`} style={styles.readBtn} onPress={() => Linking.openURL(article.article_url)} activeOpacity={0.8}>
            <ExternalLink size={16} color="#fff" />
            <Text style={styles.readBtnText}>Full Article</Text>
          </TouchableOpacity>
          <View style={styles.actionsRight}>
            <TouchableOpacity testID={`share-btn-${index}`} style={styles.actionBtn} onPress={() => handleShare(article)}>
              <Share2 size={18} color={Colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity testID={`bookmark-btn-${index}`} style={styles.actionBtn} onPress={() => toggleBookmark(article.id)}>
              {isBookmarked(article.id) ? (
                <BookmarkCheck size={18} color={Colors.primary} fill={Colors.primary} />
              ) : (
                <Bookmark size={18} color={Colors.textSecondary} strokeWidth={2} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.ctaSection}>
          <Text style={styles.ctaText}>Explore more verified AI stories</Text>
          <View style={styles.ctaBtns}>
            <TouchableOpacity testID={`telegram-btn-${index}`} style={styles.ctaBtn} onPress={() => Linking.openURL(TELEGRAM_URL)}>
              <Send size={14} color={Colors.primary} />
              <Text style={styles.ctaBtnText} numberOfLines={1}>Telegram</Text>
            </TouchableOpacity>
            <TouchableOpacity testID={`website-btn-${index}`} style={[styles.ctaBtn, { backgroundColor: Colors.surfaceHighlight }]} onPress={() => Linking.openURL(WEBSITE_URL)}>
              <Globe size={14} color={Colors.textPrimary} />
              <Text style={[styles.ctaBtnText, { color: Colors.textPrimary }]} numberOfLines={1}>Website</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View testID="home-feed" style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, paddingBottom: 16, height: HEADER_HEIGHT }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerLogoBadge}>
            <LinearGradient colors={[Colors.primary, Colors.secondary]} style={StyleSheet.absoluteFillObject} />
            <Text style={styles.headerLogoText}>AI</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>AIBrief24</Text>
            <Text style={styles.headerSub}>Fresh AI updates today</Text>
          </View>
        </View>
        <TouchableOpacity testID="search-btn" style={styles.headerBtn} onPress={() => router.push('/search')}>
          <Search size={20} color={Colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Swipe Feed */}
      <FlatList
        ref={flatListRef}
        testID="feed-list"
        data={articles}
        renderItem={renderCard}
        keyExtractor={item => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={CARD_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({ length: CARD_HEIGHT, offset: CARD_HEIGHT * index, index })}
        contentContainerStyle={{ paddingBottom: TAB_BAR_OFFSET }}
      />

      {/* Page counter */}
      <View pointerEvents="none" style={[styles.pageCounter, { bottom: TAB_BAR_OFFSET + 12 }]}>
        <Text style={styles.pageCounterText}>{currentIndex + 1}/{articles.length}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 12 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, backgroundColor: Colors.background, zIndex: 10,
    borderBottomWidth: 0,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerLogoBadge: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  headerLogoText: { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
  headerSub: { fontSize: 11, color: Colors.primary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  page: { width: '100%', overflow: 'hidden' },
  imageContainer: { flex: 0.35, width: '100%', position: 'relative' },
  image: { width: '100%', height: '100%' },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '80%' },
  breakingBadge: {
    position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.accent, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, gap: 5,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  breakingText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  categoryBadge: {
    position: 'absolute', top: 16, right: 16,
    backgroundColor: 'rgba(11, 18, 33, 0.75)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)',
  },
  categoryText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cardContent: { flex: 0.65, paddingHorizontal: 20, paddingTop: 16, backgroundColor: Colors.background, justifyContent: 'space-between' },
  articleTitle: { fontSize: 21, fontWeight: '800', color: Colors.textPrimary, lineHeight: 28, letterSpacing: -0.5, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  metaSource: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.textTertiary },
  metaTime: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },
  articleSummary: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, fontWeight: '400' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: Radius.full, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  readBtnText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '700', letterSpacing: 0.5 },
  actionsRight: { flexDirection: 'row', gap: 12 },
  actionBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  ctaSection: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 16, alignItems: 'center' },
  ctaText: { fontSize: 12, color: Colors.textTertiary, marginBottom: 12, letterSpacing: 0.5, fontWeight: '600', textTransform: 'uppercase' },
  ctaBtns: { flexDirection: 'row', justifyContent: 'center', gap: 12, width: '100%', flexWrap: 'wrap' },
  ctaBtn: { flex: 1, minWidth: '45%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 4, borderRadius: Radius.md, backgroundColor: Colors.primary + '15' },
  ctaBtnText: { fontSize: 13, color: Colors.primary, fontWeight: '700', letterSpacing: 0.5 },
  pageCounter: {
    position: 'absolute', right: 20,
    backgroundColor: 'rgba(11, 18, 33, 0.9)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  pageCounterText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700', letterSpacing: 1 },
});
