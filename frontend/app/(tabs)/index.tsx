import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions, Platform, Linking, Share, ActivityIndicator, FlatList, ViewToken } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { Colors, FontSize, Spacing, Radius, TELEGRAM_URL, WEBSITE_URL } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Bookmark, BookmarkCheck, ExternalLink, Share2, Send, Globe, Zap, Clock } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

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
  const flatListRef = useRef<FlatList>(null);

  const HEADER_HEIGHT = insets.top + 52;
  const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 64;
  const CARD_HEIGHT = height - HEADER_HEIGHT - TAB_BAR_HEIGHT;

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
    } catch {}
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
      {/* Image */}
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

      {/* Content */}
      <View style={styles.cardContent}>
        <Text testID={`article-title-${index}`} style={styles.articleTitle} numberOfLines={3}>{article.title}</Text>
        <Text style={styles.articleSummary} numberOfLines={7}>{article.summary}</Text>

        {/* Meta */}
        <View style={styles.metaRow}>
          <Text style={styles.metaSource}>{article.source_name}</Text>
          <View style={styles.metaDot} />
          <Clock size={12} color={Colors.textTertiary} />
          <Text style={styles.metaTime}>{timeAgo(article.published_at)}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity testID={`read-full-btn-${index}`} style={styles.readBtn} onPress={() => Linking.openURL(article.article_url)} activeOpacity={0.8}>
            <ExternalLink size={16} color={Colors.primary} />
            <Text style={styles.readBtnText}>Full Article</Text>
          </TouchableOpacity>
          <TouchableOpacity testID={`share-btn-${index}`} style={styles.actionBtn} onPress={() => handleShare(article)}>
            <Share2 size={20} color={Colors.textSecondary} strokeWidth={1.5} />
          </TouchableOpacity>
          <TouchableOpacity testID={`bookmark-btn-${index}`} style={styles.actionBtn} onPress={() => toggleBookmark(article.id)}>
            {isBookmarked(article.id) ? <BookmarkCheck size={20} color={Colors.primary} fill={Colors.primary} /> : <Bookmark size={20} color={Colors.textSecondary} strokeWidth={1.5} />}
          </TouchableOpacity>
        </View>

        {/* CTA */}
        <View style={styles.ctaSection}>
          <Text style={styles.ctaText}>Want more AI updates?</Text>
          <View style={styles.ctaBtns}>
            <TouchableOpacity testID={`telegram-btn-${index}`} style={styles.ctaBtn} onPress={() => Linking.openURL(TELEGRAM_URL)}>
              <Send size={14} color={Colors.primary} />
              <Text style={styles.ctaBtnText}>Telegram</Text>
            </TouchableOpacity>
            <TouchableOpacity testID={`website-btn-${index}`} style={styles.ctaBtn} onPress={() => Linking.openURL(WEBSITE_URL)}>
              <Globe size={14} color={Colors.secondary} />
              <Text style={[styles.ctaBtnText, { color: Colors.secondary }]}>Website</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View testID="home-feed" style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, height: HEADER_HEIGHT }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerLogoBadge}><Text style={styles.headerLogoText}>AI</Text></View>
          <View>
            <Text style={styles.headerTitle}>AIBrief24</Text>
            <Text style={styles.headerSub}>{articles.length} stories today</Text>
          </View>
        </View>
        <TouchableOpacity testID="search-btn" style={styles.headerBtn} onPress={() => router.push('/search')}>
          <Search size={22} color={Colors.textPrimary} strokeWidth={1.5} />
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
      />

      {/* Page counter */}
      <View style={[styles.pageCounter, { bottom: 12 }]}>
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingBottom: 8, backgroundColor: Colors.background, zIndex: 10,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogoBadge: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  headerLogoText: { fontSize: 14, fontWeight: '900', color: '#fff' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
  headerSub: { fontSize: FontSize.xs, color: Colors.textTertiary },
  headerBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  page: { width: '100%' },
  imageContainer: { height: '32%', width: '100%', position: 'relative' },
  image: { width: '100%', height: '100%' },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%' },
  breakingBadge: {
    position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, gap: 4,
  },
  breakingText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  categoryBadge: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(15,23,42,0.8)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  categoryText: { color: Colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cardContent: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  articleTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, lineHeight: 26, letterSpacing: -0.3, marginBottom: 8 },
  articleSummary: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 22, marginBottom: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
  metaSource: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textTertiary },
  metaTime: { fontSize: FontSize.xs, color: Colors.textTertiary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  readBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary + '15', paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.sm, borderWidth: 0.5, borderColor: Colors.primary + '30' },
  readBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  actionBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  ctaSection: { borderTopWidth: 0.5, borderTopColor: Colors.border, paddingTop: 10 },
  ctaText: { fontSize: FontSize.xs, color: Colors.textTertiary, marginBottom: 6, textAlign: 'center' },
  ctaBtns: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm, backgroundColor: Colors.surfaceHighlight },
  ctaBtnText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },
  pageCounter: {
    position: 'absolute', right: 16,
    backgroundColor: 'rgba(15,23,42,0.9)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  pageCounterText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
});
