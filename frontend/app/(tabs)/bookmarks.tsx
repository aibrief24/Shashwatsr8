import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, Platform } from 'react-native';
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
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { token, toggleBookmark, bookmarkIds } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const loadBookmarks = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const res = await api.getBookmarks(token);
      setArticles(res.bookmarks || []);
    } catch {} finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadBookmarks(); }, [bookmarkIds]);

  const handleRemove = async (id: string) => {
    await toggleBookmark(id);
    setArticles(prev => prev.filter(a => a.id !== id));
  };

  return (
    <View testID="bookmarks-screen" style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.pageTitle}>Saved Articles</Text>
      <Text style={styles.pageSubtitle}>{articles.length} bookmarked</Text>
      <FlatList
        data={articles}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity testID={`saved-article-${item.id}`} style={styles.card} onPress={() => router.push(`/article/${item.id}` as any)} activeOpacity={0.8}>
            <Image source={{ uri: item.image_url }} style={styles.cardImage} />
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
        ListEmptyComponent={
          <View style={styles.empty}>
            <Bookmark size={48} color={Colors.textTertiary} strokeWidth={1} />
            <Text style={styles.emptyTitle}>No saved articles</Text>
            <Text style={styles.emptyDesc}>Bookmark articles from the feed to read them later</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  pageTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary, paddingHorizontal: 16, marginTop: 16, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, paddingHorizontal: 16, marginTop: 4, marginBottom: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.sm,
    marginBottom: 10, overflow: 'hidden', borderWidth: 0.5, borderColor: Colors.border, alignItems: 'center',
  },
  cardImage: { width: 90, height: 80 },
  cardBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  cardCategory: { fontSize: 10, color: Colors.primary, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2, textTransform: 'uppercase' },
  cardTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, lineHeight: 18, marginBottom: 4 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardSource: { fontSize: 10, color: Colors.textTertiary },
  dot: { width: 2, height: 2, borderRadius: 1, backgroundColor: Colors.textTertiary },
  cardTime: { fontSize: 10, color: Colors.textTertiary },
  removeBtn: { padding: 12 },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginTop: 16, marginBottom: 8 },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center', lineHeight: 20 },
});
