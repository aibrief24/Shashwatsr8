import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Image as RNImage, TouchableOpacity, Platform, Linking, Share, ActivityIndicator, FlatList, ViewToken, useWindowDimensions, LayoutAnimation, UIManager, Animated, InteractionManager } from 'react-native';
import { Image } from 'expo-image';
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
  thumbnail_url?: string;
  source_name: string;
  source_url: string;
  category: string;
  published_at: string;
  article_url: string;
  is_breaking?: boolean;
  image_source_type?: string;
}

const MOCK_DATA: Article[] = Array.from({ length: 5 }).map((_, i) => ({
  id: `mock-${i}`,
  title: `Mock Safe Structure Article ${i}`,
  summary: `This is a mock summary for article ${i} specifically loaded for structural isolation testing without any network traffic or remote downloads.`,
  image_url: '',
  source_name: 'MockSource',
  source_url: 'https://example.com',
  category: 'AI Research',
  published_at: new Date().toISOString(),
  article_url: 'https://example.com',
  image_source_type: i % 2 === 0 ? 'arxiv_pool' : undefined
}));

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AnimatedSkeleton = ({ CARD_HEIGHT, TAB_BAR_OFFSET }: any) => {
  const op = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    console.log('[DEBUG-CRASH] AnimatedSkeleton mount');
    Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, [op]);

  return (
    <View style={[styles.page, { height: CARD_HEIGHT, paddingBottom: TAB_BAR_OFFSET }]}>
      <View style={{ flex: 1, backgroundColor: '#0B1221' }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A2438', opacity: op }]} />
        <View style={styles.imageOverlay} />

        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, zIndex: 10 }}>
          <View style={{ width: 80, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 16 }} />
          <View style={{ width: '90%', height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 12 }} />
          <View style={{ width: '70%', height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 16 }} />
          <View style={{ width: '100%', height: 60, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 24 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 120, height: 20, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.05)' }} />
            <View style={{ width: 100, height: 20, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.05)' }} />
          </View>
        </View>
      </View>
    </View>
  );
};

const BookmarkButton = React.memo(({ article }: { article: Article }) => {
  const { isBookmarked, toggleBookmark } = useAuth();
  const bookmarked = isBookmarked(article.id);

  return (
    <TouchableOpacity testID={`bookmark-btn-${article.id}`} style={styles.actionBtn} onPress={() => toggleBookmark(article, bookmarked)}>
      {bookmarked ? (
        <BookmarkCheck size={18} color={Colors.primary} fill={Colors.primary} />
      ) : (
        <Bookmark size={18} color={Colors.textSecondary} strokeWidth={2} />
      )}
    </TouchableOpacity>
  );
});

const ArticleCard = React.memo(({ article, index, handleShare, TAB_BAR_OFFSET, CARD_HEIGHT }: any) => {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  const handleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <View style={[styles.page, { height: CARD_HEIGHT }]}>
      <TouchableOpacity
        activeOpacity={1}
        style={{ flex: 1 }}
        onPress={() => router.push(`/article/${article.id}`)}
      >
        <View style={styles.imageContainer}>
          {(() => {
            console.log(`[DEBUG-CRASH] image resolution start for index ${index}`);
            if (article.image_url) {
              console.log(`[DEBUG-CRASH] image component mount for index ${index}`);
              return (
                <Image
                  source={{ uri: article.image_url }}
                  style={styles.image}
                  contentFit="cover"
                  transition={200}
                  priority={index < 2 ? 'high' : 'normal'}
                  cachePolicy="memory-disk"
                  placeholder="#080e1e"
                  onLoad={() => {
                    console.log(`[DEBUG-CRASH] image loaded for index ${index}`);
                    if (index === 0) console.log('[DEBUG-CRASH] first visible article image render');
                  }}
                />
              );
            } else if (article.image_source_type === 'arxiv_pool' || article.article_url?.includes('arxiv.org')) {
              console.log(`[DEBUG-CRASH] fallback render start (arxiv) for index ${index}`);
              return (
                <LinearGradient
                  colors={['#04091a', '#060e22', '#050c1e']}
                  style={[styles.image, styles.arxivPlaceholder]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.arxivGrid} pointerEvents="none">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <View key={`h${i}`} style={[styles.arxivGridLine, { top: `${(i + 1) * 11}%` as any }]} />
                    ))}
                    {Array.from({ length: 6 }).map((_, i) => (
                      <View key={`v${i}`} style={[styles.arxivGridLineV, { left: `${(i + 1) * 14}%` as any }]} />
                    ))}
                  </View>
                  <View style={styles.arxivBadge}>
                    <View style={styles.arxivGlow} />
                    <Text style={styles.arxivSymbol}>∂</Text>
                    <Text style={styles.arxivLabel}>AI RESEARCH PAPER</Text>
                    <Text style={styles.arxivSub}>arXiv Preprint</Text>
                  </View>
                </LinearGradient>
              );
            } else {
              console.log(`[DEBUG-CRASH] fallback render start (source) for index ${index}`);
              return (
                <LinearGradient
                  colors={['#080e1e', '#0a1530', '#06111f']}
                  style={[styles.image, styles.sourcePlaceholder]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.sourceDotGrid}>
                    {Array.from({ length: 30 }).map((_, i) => (
                      <View key={i} style={[styles.sourceDot, { opacity: 0.05 + (i % 7) * 0.03 }]} />
                    ))}
                  </View>
                  <View style={styles.sourceBrandCenter}>
                    <View style={styles.sourceFaviconContainer}>
                      <RNImage
                        source={{ uri: `https://www.google.com/s2/favicons?domain=${article.source_url || article.article_url}&sz=128` }}
                        style={styles.sourceFavicon}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={styles.sourceNameLabel}>{article.source_name}</Text>
                  </View>
                </LinearGradient>
              );
            }
          })()}

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
          <View style={styles.titleSection}>
            <Text testID={`article-title-${index}`} style={styles.articleTitle} numberOfLines={3}>{article.title}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaSource}>{article.source_name}</Text>
              <View style={styles.metaDot} />
              <Clock size={12} color={Colors.textTertiary} />
              <Text style={styles.metaTime}>{timeAgo(article.published_at)}</Text>
            </View>
          </View>

          <View style={styles.summaryContainer}>
            <Text style={styles.articleSummary} numberOfLines={expanded ? undefined : 4} ellipsizeMode="tail">{article.summary}</Text>
            <TouchableOpacity onPress={handleExpand} style={styles.expandBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.expandBtnText}>{expanded ? 'Read less' : 'Read more'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity testID={`read-full-btn-${index}`} style={styles.readBtn} onPress={() => Linking.openURL(article.article_url)} activeOpacity={0.8}>
              <ExternalLink size={16} color="#fff" />
              <Text style={styles.readBtnText}>Full Article</Text>
            </TouchableOpacity>
            <View style={styles.actionsRight}>
              <TouchableOpacity testID={`share-btn-${index}`} style={styles.actionBtn} onPress={() => handleShare(article)}>
                <Share2 size={18} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
              <BookmarkButton article={article} />
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
      </TouchableOpacity>
    </View>
  );
});

export default function HomeFeed() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);

  const HEADER_HEIGHT = insets.top + 52;
  const TAB_BAR_OFFSET = Platform.OS === 'ios' ? 100 : 90;
  const CARD_HEIGHT = height - HEADER_HEIGHT;

  const loadArticles = async () => {
    console.log('[DEBUG-CRASH] loadArticles start');
    try {
      console.log('[DEBUG-CRASH] api.getArticles request start');
      const res = await api.getArticles(undefined, 15, 0);
      console.log('[DEBUG-CRASH] api.getArticles request end');

      const loaded = res.articles || [];
      console.log(`[DEBUG-CRASH] response count: ${loaded.length}`);

      console.log('[DEBUG-CRASH] state update with fetched articles start');
      console.log('[DEBUG-CRASH] image prefetch start');
      const validImages = loaded.map((a: any) => a.image_url).filter(Boolean);
      if (validImages.length > 0) {
        Image.prefetch(validImages).then(() => console.log('[DEBUG-CRASH] image prefetch end')).catch(e => console.log('Prefetch err', e));
      }

      setArticles(loaded);
      setOffset(15);
      console.log('[DEBUG-CRASH] state update with fetched articles end');

    } catch (e) {
      console.log('Failed to load articles:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[DEBUG-CRASH] home/feed mount');
    loadArticles();
  }, []);

  useEffect(() => {
    if (!loading) {
      console.log('[DEBUG-CRASH] FlatList render after fetched data arrives');
    }
  }, [loading]);

  const handleShare = useCallback(async (article: Article) => {
    //
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const renderCard = useCallback(({ item: article, index }: { item: Article; index: number }) => (
    <ArticleCard
      article={article}
      index={index}
      handleShare={handleShare}
      TAB_BAR_OFFSET={TAB_BAR_OFFSET}
      CARD_HEIGHT={CARD_HEIGHT}
    />
  ), [handleShare, TAB_BAR_OFFSET, CARD_HEIGHT]);

  return (
    <View testID="home-feed" style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12, paddingBottom: 16, height: HEADER_HEIGHT }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerLogoBadge}>
            <LinearGradient colors={[Colors.primary, Colors.secondary]} style={StyleSheet.absoluteFillObject} />
            <Text style={styles.headerLogoText}>AI</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>AIBrief24 MOCK</Text>
            <Text style={styles.headerSub}>Isolating App Memory</Text>
          </View>
        </View>
        <TouchableOpacity
          testID="search-btn"
          style={styles.headerBtn}
          onPress={() => {
            if (!loading) router.push('/search');
          }}
          activeOpacity={loading ? 1 : 0.2}
        >
          <Search size={20} color={Colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <AnimatedSkeleton CARD_HEIGHT={CARD_HEIGHT} TAB_BAR_OFFSET={TAB_BAR_OFFSET} />
      ) : (
        <>
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
            windowSize={3}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            removeClippedSubviews={false}
            ListHeaderComponent={() => {
              console.log('[DEBUG-CRASH] FlatList header render');
              return null;
            }}
            ListFooterComponent={() => {
              console.log('[DEBUG-CRASH] FlatList footer render');
              return null;
            }}
            getItemLayout={(_, index) => ({ length: CARD_HEIGHT, offset: CARD_HEIGHT * index, index })}
            contentContainerStyle={{ paddingBottom: TAB_BAR_OFFSET }}
          />

          <View pointerEvents="none" style={[styles.pageCounter, { bottom: TAB_BAR_OFFSET + 12 }]}>
            <Text style={styles.pageCounterText}>{currentIndex + 1}/{articles.length}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
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
  },
  breakingText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  categoryBadge: {
    position: 'absolute', top: 16, right: 16,
    backgroundColor: 'rgba(11, 18, 33, 0.75)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  categoryText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cardContent: { flex: 0.65, paddingHorizontal: 20, paddingTop: 12, backgroundColor: Colors.background, justifyContent: 'space-between' },
  titleSection: { marginBottom: 0 },
  articleTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, lineHeight: 24, letterSpacing: -0.5, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  metaSource: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.textTertiary },
  metaTime: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },
  summaryContainer: { flex: 1, justifyContent: 'center', marginVertical: 4 },
  articleSummary: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, fontWeight: '400' },
  expandBtn: { marginTop: 6, alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 20 },
  expandBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  readBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: Radius.full },
  readBtnText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '700', letterSpacing: 0.5 },
  actionsRight: { flexDirection: 'row', gap: 12 },
  actionBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  ctaSection: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, alignItems: 'center' },
  ctaText: { fontSize: 11, color: Colors.textTertiary, marginBottom: 10, letterSpacing: 0.5, fontWeight: '600', textTransform: 'uppercase' },
  ctaBtns: { flexDirection: 'row', justifyContent: 'center', gap: 12, width: '100%', flexWrap: 'wrap' },
  ctaBtn: { flex: 1, minWidth: '45%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 4, borderRadius: Radius.md, backgroundColor: Colors.primary + '15' },
  ctaBtnText: { fontSize: 13, color: Colors.primary, fontWeight: '700', letterSpacing: 0.5 },
  pageCounter: {
    position: 'absolute', right: 20,
    backgroundColor: 'rgba(11, 18, 33, 0.9)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  pageCounterText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700', letterSpacing: 1 },
  arxivPlaceholder: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  arxivGrid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  arxivGridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(59,130,246,0.06)' },
  arxivGridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(59,130,246,0.06)' },
  arxivBadge: { alignItems: 'center', gap: 8 },
  arxivGlow: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(59,130,246,0.08)', top: -30 },
  arxivSymbol: { fontSize: 52, color: 'rgba(99,155,255,0.55)', fontWeight: '300', lineHeight: 60 },
  arxivLabel: { fontSize: 10, color: 'rgba(147,197,253,0.5)', letterSpacing: 3, fontWeight: '700', textTransform: 'uppercase' },
  arxivSub: { fontSize: 9, color: 'rgba(147,197,253,0.28)', letterSpacing: 1.5, fontWeight: '500' },
  sourcePlaceholder: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  sourceDotGrid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 18, justifyContent: 'space-around', alignItems: 'center' },
  sourceDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#3a7bd5' },
  sourceBrandCenter: { alignItems: 'center', gap: 14 },
  sourceFaviconContainer: { width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  sourceFavicon: { width: 48, height: 48 },
  sourceNameLabel: { fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: 2.5, fontWeight: '600', textTransform: 'uppercase' }
});
