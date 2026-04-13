import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { Colors, FontSize, Radius } from '@/constants/theme';
import { Bookmark, Trash2, Clock } from 'lucide-react-native';

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function BookmarksScreen() {
  const [loading, setLoading] = useState(false);
  const { token, toggleBookmark, bookmarkIds, bookmarkedArticlesCache, setBookmarkedArticlesCache } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const loadBookmarks = useCallback(async () => {
    if (!token) return;
    // If the cache already has all bookmarked articles, do not refetch
    if (bookmarkedArticlesCache.length >= bookmarkIds.length && bookmarkIds.length > 0) return;

    setLoading(true);
    try {
      const res = await api.getBookmarks(token);
      setBookmarkedArticlesCache(res.bookmarks || []);
    } catch { } finally { setLoading(false); }
  }, [token, bookmarkIds.length, bookmarkedArticlesCache.length]);

  useEffect(() => { loadBookmarks(); }, [loadBookmarks]);

  const handleRemove = async (id: string) => {
    await toggleBookmark(id, true);
    // Context cache will auto-update optimistically 
  };

  return (
    <View testID="bookmarks-screen" style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.pageTitle}>Saved Articles</Text>
      <Text style={styles.pageSubtitle}>{bookmarkedArticlesCache.length} bookmarked for later</Text>
      <FlatList
        data={bookmarkedArticlesCache}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity testID={`saved-article-${item.id}`} style={styles.card} onPress={() => router.push(`/article/${item.id}` as any)} activeOpacity={0.8}>
            <Image source={{ uri: item.image_url }} style={styles.cardImage} contentFit="cover" transition={200} cachePolicy="memory-disk" placeholder="#080e1e" />
            <View style={styles.cardBody}>
              <Text style={styles.cardCategory}>{item.category}</Text>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <View style={styles.cardMeta}>
                <Text style={styles.cardSource}>{item.source_name}</Text>
                <View style={styles.dot} />
                <Clock size={10} color={Colors.textTertiary} />
                <Text style={styles.cardTime}>{timeAgo(item.published_at)}</Text>
              </View>
            </View>
            <TouchableOpacity testID={`remove-bookmark-${item.id}`} style={styles.removeBtn} onPress={() => handleRemove(item.id)}>
              <Trash2 size={16} color={Colors.accent} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Bookmark size={48} color={Colors.textTertiary} strokeWidth={1} />
            <Text style={styles.emptyTitle}>No saved articles</Text>
            <Text style={styles.emptyDesc}>Bookmark articles from the feed to read them later</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  pageTitle: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary, paddingHorizontal: 20, marginTop: 24, letterSpacing: -1 },
  pageSubtitle: { fontSize: 16, color: Colors.textSecondary, paddingHorizontal: 20, marginTop: 4, marginBottom: 32 },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  card: {
    flexDirection: 'row', backgroundColor: 'rgba(11,18,33,0.8)', borderRadius: 16,
    marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', alignItems: 'center',
  },
  cardImage: { width: 110, height: 110 },
  cardBody: { flex: 1, paddingHorizontal: 16, paddingVertical: 16, justifyContent: 'space-between' },
  cardCategory: { fontSize: 11, color: Colors.primary, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, lineHeight: 22, marginBottom: 8, letterSpacing: -0.3 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardSource: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textTertiary },
  cardTime: { fontSize: 11, color: Colors.textTertiary },
  removeBtn: { padding: 16, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', marginTop: 100, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginTop: 24, marginBottom: 8, letterSpacing: -0.5 },
  emptyDesc: { fontSize: 15, color: Colors.textTertiary, textAlign: 'center', lineHeight: 22 },
});
