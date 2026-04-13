import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/services/api';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Cpu, Rocket, Brain, FlaskConical, DollarSign, Package, Building2, GitBranch, Zap } from 'lucide-react-native';

const CATEGORY_ICONS: Record<string, any> = {
  'Latest': Zap,
  'AI Tools': Cpu,
  'AI Startups': Rocket,
  'AI Models': Brain,
  'AI Research': FlaskConical,
  'Funding News': DollarSign,
  'Product Launches': Package,
  'Big Tech AI': Building2,
  'Open Source AI': GitBranch,
};

const CATEGORY_COLORS = [
  Colors.primary, Colors.secondary, Colors.accent, Colors.success,
  '#F59E0B', '#EC4899', '#06B6D4', '#84CC16', '#8B5CF6',
];

interface CategoryItem { name: string; count: number; }

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [catLoading, setCatLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const res = await api.getCategories();
      setCategories(res.categories || []);
    } catch { } finally { setLoading(false); }
  };

  const selectCategory = (name: string) => {
    setSelectedCat(name);
    setArticles([]);
    setCatLoading(true);
    setOffset(0);
    setHasMore(true);
    // Defer API to unblock rapid UI navigation flashes
    setTimeout(async () => {
      try {
        const res = await api.getArticles(name, 15, 0);
        setArticles(res.articles || []);
        if ((res.articles || []).length < 15) setHasMore(false);
        setOffset(15);
      } catch { } finally {
        setCatLoading(false);
      }
    }, 50);
  };

  const loadMore = async () => {
    if (!hasMore || catLoading) return;
    try {
      const res = await api.getArticles(selectedCat!, 15, offset);
      const newArts = res.articles || [];
      if (newArts.length > 0) {
        setArticles(prev => {
          const existing = new Set(prev.map(a => a.id));
          return [...prev, ...newArts.filter((a: any) => !existing.has(a.id))];
        });
        setOffset(prev => prev + 15);
      } else {
        setHasMore(false);
      }
    } catch { }
  };

  if (selectedCat) {
    return (
      <View testID="category-detail" style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.catHeader}>
          <TouchableOpacity testID="back-btn" onPress={() => { setSelectedCat(null); setArticles([]); }} style={styles.backBtn}>
            <Text style={styles.backText}>{'←'}</Text>
          </TouchableOpacity>
          <Text style={styles.catTitle}>{selectedCat}</Text>
          <Text style={styles.catCount}>{articles.length} stories</Text>
        </View>
        {catLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={articles}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            renderItem={({ item }) => (
              <TouchableOpacity testID={`cat-article-${item.id}`} style={styles.articleCard} onPress={() => router.push(`/article/${item.id}` as any)} activeOpacity={0.8}>
                <Image source={{ uri: item.thumbnail_url || item.image_url }} style={styles.articleImage} contentFit="cover" transition={200} cachePolicy="memory-disk" placeholder="#080e1e" />
                <View style={styles.articleInfo}>
                  <Text style={styles.articleTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.articleSource}>{item.source_name}</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={() => <Text style={styles.emptyText}>No articles in this category</Text>}
          />
        )}
      </View>
    );
  }

  return (
    <ScrollView testID="categories-screen" style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={{ paddingBottom: 120 }}>
      <Text style={styles.pageTitle}>Explore Categories</Text>
      <Text style={styles.pageSubtitle}>Discover AI news by topic</Text>
      <View style={styles.grid}>
        {categories.map((cat, i) => {
          const Icon = CATEGORY_ICONS[cat.name] || Zap;
          const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
          return (
            <TouchableOpacity testID={`category-${cat.name}`} key={cat.name} style={styles.gridItem} onPress={() => selectCategory(cat.name)} activeOpacity={0.8}>
              <View style={[styles.gridIcon, { backgroundColor: color + '20' }]}>
                <Icon size={24} color={color} strokeWidth={1.5} />
              </View>
              <Text style={styles.gridName}>{cat.name}</Text>
              <Text style={styles.gridCount}>{cat.count} articles</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  pageTitle: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary, paddingHorizontal: 20, marginTop: 24, letterSpacing: -1 },
  pageSubtitle: { fontSize: 16, color: Colors.textSecondary, paddingHorizontal: 20, marginTop: 4, marginBottom: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, justifyContent: 'space-between', gap: 12 },
  gridItem: {
    width: '48%', backgroundColor: Colors.surface, borderRadius: 20,
    padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 5
  },
  gridIcon: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  gridName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4, letterSpacing: -0.3 },
  gridCount: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  catHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 20, color: Colors.textPrimary },
  catTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, flex: 1, letterSpacing: -0.5 },
  catCount: { fontSize: 12, color: Colors.primary, fontWeight: '700', backgroundColor: Colors.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },
  articleCard: { flexDirection: 'row', backgroundColor: 'rgba(11,18,33,0.8)', borderRadius: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  articleImage: { width: 110, height: 110 },
  articleInfo: { flex: 1, padding: 16, justifyContent: 'space-between' },
  articleTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, lineHeight: 22, letterSpacing: -0.3 },
  articleSource: { fontSize: 11, color: Colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyText: { fontSize: 15, color: Colors.textTertiary, textAlign: 'center', marginTop: 40, fontWeight: '500' },
});
