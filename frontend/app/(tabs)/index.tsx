import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image as RNImage,
  Pressable,
  Platform,
  Linking,
  FlatList,
  ViewToken,
  useWindowDimensions,
  UIManager,
  Animated,
  ActivityIndicator,
  ScrollView,
  AppState,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestAndRegisterPushToken } from '@/utils/notifications';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import {
  Colors,
  FontSize,
  Radius,
  TELEGRAM_URL,
  WEBSITE_URL,
} from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Search,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Share2,
  Send,
  Globe,
  Zap,
  Clock,
} from 'lucide-react-native';
import { NativeAdCard } from '@/components/NativeAdCard';

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
  created_at?: string;
  article_url: string;
  is_breaking?: boolean;
  image_source_type?: string;
}

// ── Feed item union type ──────────────────────────────────────────────────
// Using a discriminated union so keyExtractor, renderItem, and getItemLayout
// can all handle articles and ad slots with stable, predictable behaviour.
type FeedItem =
  | { type: 'article'; data: Article; id: string }
  | { type: 'ad'; id: string };
// ─────────────────────────────────────────────────────────────────────────


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

const AnimatedSkeleton = ({
  CARD_HEIGHT,
  TAB_BAR_OFFSET,
}: {
  CARD_HEIGHT: number;
  TAB_BAR_OFFSET: number;
}) => {
  const op = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(op, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: false,
        }),
        Animated.timing(op, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: false,
        }),
      ])
    );

    anim.start();

    return () => {
      anim.stop();
      op.stopAnimation();
    };
  }, [op]);

  return (
    <View
      key="feed-skeleton"
      style={[styles.page, { height: CARD_HEIGHT, paddingBottom: TAB_BAR_OFFSET }]}
      collapsable={false}
    >
      <View style={{ flex: 1, backgroundColor: '#0B1221' }}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#1A2438', opacity: op },
          ]}
        />
        <View style={styles.imageOverlay} />

        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 20,
            zIndex: 10,
          }}
        >
          <View
            style={{
              width: 80,
              height: 24,
              borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.1)',
              marginBottom: 16,
            }}
          />
          <View
            style={{
              width: '90%',
              height: 32,
              borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.1)',
              marginBottom: 12,
            }}
          />
          <View
            style={{
              width: '70%',
              height: 32,
              borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.1)',
              marginBottom: 16,
            }}
          />
          <View
            style={{
              width: '100%',
              height: 60,
              borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.05)',
              marginBottom: 24,
            }}
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View
              style={{
                width: 120,
                height: 20,
                borderRadius: 4,
                backgroundColor: 'rgba(255,255,255,0.05)',
              }}
            />
            <View
              style={{
                width: 100,
                height: 20,
                borderRadius: 4,
                backgroundColor: 'rgba(255,255,255,0.05)',
              }}
            />
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
    <Pressable
      testID={`bookmark-btn-${article.id}`}
      style={styles.actionBtn}
      onPress={() => toggleBookmark(article, bookmarked)}
    >
      {bookmarked ? (
        <BookmarkCheck size={18} color={Colors.primary} fill={Colors.primary} />
      ) : (
        <Bookmark size={18} color={Colors.textSecondary} strokeWidth={2} />
      )}
    </Pressable>
  );
});

const SummaryBlock = React.memo(
  ({
    summary,
    expanded,
    handleExpand,
  }: {
    summary: string;
    expanded: boolean;
    handleExpand: () => void;
  }) => (
    <View style={styles.summaryContainer}>
      <Text
        style={styles.articleSummary}
        numberOfLines={expanded ? undefined : 4}
        ellipsizeMode="tail"
      >
        {summary}
      </Text>
      <Pressable
        onPress={handleExpand}
        style={styles.expandBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.expandBtnText}>
          {expanded ? 'Read less' : 'Read more'}
        </Text>
      </Pressable>
    </View>
  )
);

const ActionsBlock = React.memo(
  ({
    article,
    index,
    handleShare,
  }: {
    article: Article;
    index: number;
    handleShare: (article: Article) => void;
  }) => (
    <View style={styles.actions}>
      <Pressable
        testID={`read-full-btn-${index}`}
        style={styles.readBtn}
        onPress={() => Linking.openURL(article.article_url)}
      >
        <ExternalLink size={16} color="#fff" />
        <Text style={styles.readBtnText}>Full Article</Text>
      </Pressable>

      <View style={styles.actionsRight}>
        <Pressable
          testID={`share-btn-${index}`}
          style={styles.actionBtn}
          onPress={() => handleShare(article)}
        >
          <Share2 size={18} color={Colors.textSecondary} strokeWidth={2} />
        </Pressable>
        <BookmarkButton article={article} />
      </View>
    </View>
  )
);

const CTAButtons = React.memo(({ index }: { index: number }) => (
  <View style={styles.ctaSection}>
    <Text style={styles.ctaText}>Explore more verified AI stories</Text>
    <View style={styles.ctaBtns}>
      <Pressable
        testID={`telegram-btn-${index}`}
        style={styles.ctaBtn}
        onPress={() => Linking.openURL(TELEGRAM_URL)}
      >
        <Send size={14} color={Colors.primary} />
        <Text style={styles.ctaBtnText} numberOfLines={1}>
          Telegram
        </Text>
      </Pressable>

      <Pressable
        testID={`website-btn-${index}`}
        style={[styles.ctaBtn, { backgroundColor: Colors.surfaceHighlight }]}
        onPress={() => Linking.openURL(WEBSITE_URL)}
      >
        <Globe size={14} color={Colors.textPrimary} />
        <Text
          style={[styles.ctaBtnText, { color: Colors.textPrimary }]}
          numberOfLines={1}
        >
          Website
        </Text>
      </Pressable>
    </View>
  </View>
));

const ImageBlock = React.memo(
  ({ article, index }: { article: Article; index: number }) => {
    if (article.image_url) {
      return (
        <Image
          source={{ uri: article.image_url }}
          style={styles.image}
          contentFit="cover"
          transition={200}
          priority={index < 2 ? 'high' : 'normal'}
          cachePolicy="memory-disk"
          placeholder="#080e1e"
        />
      );
    }

    if (
      article.image_source_type === 'arxiv_pool' ||
      article.article_url?.includes('arxiv.org')
    ) {
      return (
        <LinearGradient
          colors={['#04091a', '#060e22', '#050c1e']}
          style={[styles.image, styles.arxivPlaceholder]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.arxivGrid} pointerEvents="none">
            {Array.from({ length: 8 }).map((_, i) => (
              <View
                key={`arxiv-h-${article.id}-${i}`}
                style={[styles.arxivGridLine, { top: `${(i + 1) * 11}%` as any }]}
              />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <View
                key={`arxiv-v-${article.id}-${i}`}
                style={[styles.arxivGridLineV, { left: `${(i + 1) * 14}%` as any }]}
              />
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
    }

    return (
      <LinearGradient
        colors={['#080e1e', '#0a1530', '#06111f']}
        style={[styles.image, styles.sourcePlaceholder]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.sourceDotGrid}>
          {Array.from({ length: 30 }).map((_, i) => (
            <View
              key={`dot-${article.id}-${i}`}
              style={[styles.sourceDot, { opacity: 0.05 + (i % 7) * 0.03 }]}
            />
          ))}
        </View>
        <View style={styles.sourceBrandCenter}>
          <View style={styles.sourceFaviconContainer}>
            <RNImage
              source={{
                uri: `https://www.google.com/s2/favicons?domain=${article.source_url || article.article_url
                  }&sz=128`,
              }}
              style={styles.sourceFavicon}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.sourceNameLabel}>{article.source_name}</Text>
        </View>
      </LinearGradient>
    );
  }
);

const ArticleCard = React.memo(
  ({
    article,
    index,
    handleShare,
    TAB_BAR_OFFSET,
    CARD_HEIGHT,
  }: {
    article: Article;
    index: number;
    handleShare: (article: Article) => void;
    TAB_BAR_OFFSET: number;
    CARD_HEIGHT: number;
  }) => {
    const [expanded, setExpanded] = useState(false);
    const router = useRouter();

    const handleExpand = useCallback(() => {
      setExpanded(prev => !prev);
    }, []);

    return (
      <View style={[styles.page, { height: CARD_HEIGHT }]}>
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={() => router.push(`/article/${article.id}`)}
            style={styles.imageContainer}
          >
            <ImageBlock article={article} index={index} />

            <LinearGradient
              colors={['transparent', 'rgba(2,6,23,0.6)', Colors.background]}
              style={styles.imageOverlay}
            />

            {article.is_breaking && (
              <View style={styles.breakingBadge}>
                <Zap size={12} color="#fff" fill="#fff" />
                <Text style={styles.breakingText}>BREAKING</Text>
              </View>
            )}

            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{article.category}</Text>
            </View>
          </Pressable>

          <View style={[styles.cardContent, { paddingBottom: TAB_BAR_OFFSET }]}>
            <Pressable onPress={() => router.push(`/article/${article.id}`)}>
              <View style={styles.titleSection}>
                <Text
                  testID={`article-title-${index}`}
                  style={styles.articleTitle}
                  numberOfLines={3}
                >
                  {article.title}
                </Text>

                <View style={styles.metaRow}>
                  <Text style={styles.metaSource}>{article.source_name}</Text>
                  <View style={styles.metaDot} />
                  <Clock size={12} color={Colors.textTertiary} />
                  <Text style={styles.metaTime}>{timeAgo(article.published_at)}</Text>
                </View>
              </View>
            </Pressable>

            <SummaryBlock
              summary={article.summary}
              expanded={expanded}
              handleExpand={handleExpand}
            />
            <ActionsBlock
              article={article}
              index={index}
              handleShare={handleShare}
            />
            <CTAButtons index={index} />
          </View>
        </View>
      </View>
    );
  }
);

export default function HomeFeed() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [showPushCta, setShowPushCta] = useState(false);
  const [registeringPush, setRegisteringPush] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastRefreshTime = useRef<number>(Date.now());
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const flatListRef = useRef<FlatList<FeedItem>>(null);

  const HEADER_HEIGHT = insets.top + 52;
  const TAB_BAR_OFFSET = Platform.OS === 'ios' ? 100 : 90;
  const CARD_HEIGHT = height - HEADER_HEIGHT;

  // ── Interleaved feed: one ad slot after every 5 articles ──────────────
  // Stable item IDs: article items use the article UUID, ad slots use
  // 'ad-after-<position>' which is deterministic and never changes per article.
  const feedItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    articles.forEach((article, i) => {
      items.push({ type: 'article', data: article, id: article.id });
      if ((i + 1) % 5 === 0) {
        items.push({ type: 'ad', id: `ad-after-${i}` });
      }
    });
    return items;
  }, [articles]);

  const refreshArticles = async (silent = false, isPullRefresh = false) => {
    // If it's a silent check from AppState or Focus, we don't trigger the UI spinners unless list is completely empty
    if (!silent && !isPullRefresh && articles.length === 0) setLoading(true);
    if (isPullRefresh) setRefreshing(true);

    try {
      const res = await api.getArticles(undefined, 20, 0);
      let fetched = res.articles || [];
      if (fetched.length > 0) {
        console.log(`[FEED] fetched first article time: ${fetched[0].published_at || fetched[0].created_at}`);
        console.log(`[FEED] fetched last article time: ${fetched[fetched.length - 1].published_at || fetched[fetched.length - 1].created_at}`);
      }

      setArticles(prev => {
        const sortArticles = (arr: Article[]) => arr.sort((a, b) => {
          const timeA = new Date(a.published_at || a.created_at || 0).getTime();
          const timeB = new Date(b.published_at || b.created_at || 0).getTime();
          return timeB - timeA;
        });

        // Base case: app is empty, so we seed it natively
        if (prev.length === 0) {
          const uniqueFetched = fetched.filter(
            (v: Article, i: number, a: Article[]) => a.findIndex(t => t.id === v.id) === i
          );
          const sortedFetch = sortArticles(uniqueFetched);
          setOffset(sortedFetch.length);
          setHasMore(sortedFetch.length === 20);
          console.log(`[FEED-REFRESH] initial load count: ${sortedFetch.length}`);
          console.log(`[FEED] final sorted order ok`);
          return sortedFetch;
        }

        // Active app case: we check for entirely new articles not currently tracked
        const existingIds = new Set(prev.map(a => a.id));
        const trulyNew = fetched.filter((a: Article) => !existingIds.has(a.id));

        if (trulyNew.length > 0) {
          console.log(`[FEED-REFRESH] new articles found count: ${trulyNew.length}`);
          const combined = [...trulyNew, ...prev];

          const validImages = trulyNew.map((a: Article) => a.image_url).filter(Boolean);
          if (validImages.length > 0) Image.prefetch(validImages).catch(() => { });

          // CRITICAL: shift the loadMore pagination offset window by precisely the length we injected at the top
          setOffset(currentOffset => currentOffset + trulyNew.length);
          const finalSorted = sortArticles(combined);
          console.log(`[FEED] final sorted order ok`);
          return finalSorted;
        } else {
          console.log('[FEED-REFRESH] no new articles');
          return prev;
        }
      });
      lastRefreshTime.current = Date.now();
    } catch (e) {
      console.log('Failed to refresh articles:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const res = await api.getArticles(undefined, 15, offset);
      const newArticles = res.articles || [];
      if (newArticles.length === 0) {
        setHasMore(false);
        return;
      }

      setArticles(prev => {
        const combined = [...prev, ...newArticles];
        const unique = combined.filter(
          (v: Article, i: number, a: Article[]) =>
            a.findIndex(t => t.id === v.id) === i
        );
        return unique.sort((a, b) => {
          const timeA = new Date(a.published_at || a.created_at || 0).getTime();
          const timeB = new Date(b.published_at || b.created_at || 0).getTime();
          return timeB - timeA;
        });
      });
      setOffset(prev => prev + 15);
      if (newArticles.length < 15) {
        setHasMore(false);
      }
    } catch (e) {
      console.log('Failed to load more articles:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    refreshArticles(false, false);
    AsyncStorage.getItem('push_prompt_dismissed_v2').then((val: string | null) => {
      if (val !== 'true') setShowPushCta(true);
    });
    console.log('[DEBUG-PUSH] home fully mounted');

    // Automatically check for new content when pulling the app back from the background
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const now = Date.now();
        if (now - lastRefreshTime.current > 3 * 60 * 1000) { // 3 min cache timeout natively integrated
          console.log('[FEED-REFRESH] app returned active');
          refreshArticles(true, false);
        }
      }
    });

    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Whenever users switch tabs explicitly and organically return
      const now = Date.now();
      if (now - lastRefreshTime.current > 3 * 60 * 1000) {
        console.log('[FEED-REFRESH] focus refresh');
        refreshArticles(true, false);
      }
    }, [])
  );

  const onPullRefresh = useCallback(() => {
    console.log('[FEED-REFRESH] pull refresh');
    // Manual intervention bypasses cache entirely natively
    refreshArticles(false, true);
  }, []);

  const handleEnablePush = async () => {
    console.log('[DEBUG-PUSH] notification CTA pressed');
    setRegisteringPush(true);
    try {
      if (token) {
        await requestAndRegisterPushToken(token);
      }
    } catch (e) {
      console.log('[DEBUG-PUSH] error', e);
    } finally {
      setRegisteringPush(false);
      setShowPushCta(false);
      AsyncStorage.setItem('push_prompt_dismissed_v2', 'true');
    }
  };

  const handleShare = useCallback(async (_article: Article) => {
    // keep your existing share logic here
  }, []);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const renderCard = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => {
      if (item.type === 'ad') {
        return (
          <NativeAdCard
            cardHeight={CARD_HEIGHT}
            tabBarOffset={TAB_BAR_OFFSET}
          />
        );
      }
      return (
        <ArticleCard
          article={item.data}
          index={index}
          handleShare={handleShare}
          TAB_BAR_OFFSET={TAB_BAR_OFFSET}
          CARD_HEIGHT={CARD_HEIGHT}
        />
      );
    },
    [handleShare, TAB_BAR_OFFSET, CARD_HEIGHT]
  );
  const renderHeaderLayout = () => (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 12,
          paddingBottom: 16,
          height: HEADER_HEIGHT,
        },
      ]}
    >
      <View style={styles.headerLeft}>
        <View style={styles.headerLogoBadge}>
          <RNImage
            source={require('@/assets/images/icon.png')}
            style={styles.headerLogoImage}
            resizeMode="contain"
          />
        </View>
        <View>
          <Text style={styles.headerTitle}>AIBrief24</Text>
          <Text style={styles.headerSub}>Fresh AI Updates Today</Text>
        </View>
      </View>

      <Pressable
        testID="search-btn"
        style={styles.headerBtn}
        onPress={() => {
          if (!loading) router.push('/search');
        }}
      >
        <Search size={20} color={Colors.textPrimary} strokeWidth={2} />
      </Pressable>
    </View>
  );

  const renderPushBanner = () => {
    if (!showPushCta) return null;
    return (
      <View
        style={{
          marginHorizontal: 20,
          marginBottom: 12,
          padding: 16,
          backgroundColor: Colors.surfaceHighlight,
          borderRadius: Radius.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flex: 1, marginRight: 16 }}>
          <Text
            style={{
              color: Colors.textPrimary,
              fontSize: 16,
              fontWeight: '700',
              marginBottom: 4,
            }}
          >
            Turn on notifications
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>
            Get major AI launches & breaking news.
          </Text>
        </View>
        <Pressable
          onPress={handleEnablePush}
          disabled={registeringPush}
          style={{
            backgroundColor: Colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: Radius.full,
          }}
        >
          {registeringPush ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
              Enable
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View testID="home-feed" style={styles.container}>
      {renderHeaderLayout()}
      {renderPushBanner()}

      <View style={{ flex: 1, width: '100%' }}>
        {loading ? (
          <View
            key="feed-loading"
            style={{
              flex: 1,
              width: '100%',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: CARD_HEIGHT,
            }}
            collapsable={false}
          >
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : articles.length === 0 ? (
          <View
            key="feed-empty"
            style={{
              flex: 1,
              width: '100%',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: CARD_HEIGHT,
            }}
            collapsable={false}
          >
            <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>
              No articles found.
            </Text>
          </View>
        ) : (
          <View
            key="feed-list"
            style={{ flex: 1, width: '100%' }}
            collapsable={false}
          >
            <FlatList
              ref={flatListRef}
              testID="feed-list"
              data={feedItems}
              renderItem={renderCard}
              keyExtractor={(item) => item.id}
              refreshing={refreshing}
              onRefresh={onPullRefresh}
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
              getItemLayout={(_, index) => ({
                length: CARD_HEIGHT,
                offset: CARD_HEIGHT * index,
                index,
              })}
              contentContainerStyle={{ paddingBottom: TAB_BAR_OFFSET }}
              onEndReached={loadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={loadingMore ? (
                <View style={{ height: 100, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              ) : null}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: Colors.background,
    zIndex: 10,
    borderBottomWidth: 0,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerLogoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  headerLogoImage: {
    width: '100%',
    height: '100%',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  page: { width: '100%', overflow: 'hidden' },
  imageContainer: { flex: 0.35, width: '100%', position: 'relative' },
  image: { width: '100%', height: '100%' },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '80%' },
  breakingBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
  },
  breakingText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  categoryBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(11, 18, 33, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  categoryText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cardContent: {
    flex: 0.65,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.background,
    justifyContent: 'space-between',
  },
  titleSection: { marginBottom: 0 },
  articleTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
    lineHeight: 24,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  metaSource: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.textTertiary },
  metaTime: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },
  summaryContainer: { flex: 1, justifyContent: 'center', marginVertical: 4 },
  articleSummary: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    fontWeight: '400',
  },
  expandBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingRight: 20,
  },
  expandBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  readBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  readBtnText: {
    fontSize: FontSize.sm,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actionsRight: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 10,
    letterSpacing: 0.5,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  ctaBtns: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    flexWrap: 'wrap',
  },
  ctaBtn: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: Radius.md,
    backgroundColor: `${Colors.primary}15`,
  },
  ctaBtnText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pageCounter: {
    position: 'absolute',
    right: 20,
    backgroundColor: 'rgba(11, 18, 33, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  pageCounterText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 1,
  },
  arxivPlaceholder: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  arxivGrid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  arxivGridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(59,130,246,0.06)',
  },
  arxivGridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(59,130,246,0.06)',
  },
  arxivBadge: { alignItems: 'center', gap: 8 },
  arxivGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(59,130,246,0.08)',
    top: -30,
  },
  arxivSymbol: {
    fontSize: 52,
    color: 'rgba(99,155,255,0.55)',
    fontWeight: '300',
    lineHeight: 60,
  },
  arxivLabel: {
    fontSize: 10,
    color: 'rgba(147,197,253,0.5)',
    letterSpacing: 3,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  arxivSub: {
    fontSize: 9,
    color: 'rgba(147,197,253,0.28)',
    letterSpacing: 1.5,
    fontWeight: '500',
  },
  sourcePlaceholder: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  sourceDotGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 18,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  sourceDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#3a7bd5' },
  sourceBrandCenter: { alignItems: 'center', gap: 14 },
  sourceFaviconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  sourceFavicon: { width: 48, height: 48 },
  sourceNameLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2.5,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});
