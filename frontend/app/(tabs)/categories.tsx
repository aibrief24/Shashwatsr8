import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, Platform } from 'react-native';
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
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const res = await api.getCategories();
      setCategories(res.categories || []);
    } catch {} finally { setLoading(false); }
  };

  const selectCategory = async (name: string) => {
    setSelectedCat(name);
    try {
      const res = await api.getArticles(name);
      setArticles(res.articles || []);
    } catch {}
  };

  if (selectedCat) {
    return (
      <View testID="category-detail" style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.catHeader}>
          <TouchableOpacity testID="back-btn" onPress={() => { setSelectedCat(null); setArticles([]); }} style={styles.backBtn}>
            <Text style={styles.backText}>{'←'}</Text>
          </TouchableOpacity>
          <Text style={styles.catTitle}>{selectedCat}</Text>
          <Text style={styles.catCount}>{articles.length} articles</Text>
        </View>
        <FlatList
          data={articles}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity testID={`cat-article-${item.id}`} style={styles.articleCard} onPress={() => router.push(`/article/${item.id}` as any)} activeOpacity={0.8}>
              <Image source={{ uri: item.image_url }} style={styles.articleImage} />
              <View style={styles.articleInfo}>
                <Text style={styles.articleTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.articleSource}>{item.source_name}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No articles in this category</Text>}
        />
      </View>
    );
  }

  return (
    <View testID="categories-screen" style={[styles.container, { paddingTop: insets.top }]}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  pageTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary, paddingHorizontal: 16, marginTop: 16, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, paddingHorizontal: 16, marginTop: 4, marginBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  gridItem: {
    width: '47%', backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 16, borderWidth: 0.5, borderColor: Colors.border, marginBottom: 4,
  },
  gridIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  gridName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  gridCount: { fontSize: FontSize.xs, color: Colors.textTertiary },
  catHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 20, color: Colors.textPrimary },
  catTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary, flex: 1, letterSpacing: -0.5 },
  catCount: { fontSize: FontSize.xs, color: Colors.textTertiary },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  articleCard: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.sm, marginBottom: 10, overflow: 'hidden', borderWidth: 0.5, borderColor: Colors.border },
  articleImage: { width: 100, height: 80 },
  articleInfo: { flex: 1, padding: 12, justifyContent: 'center' },
  articleTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  articleSource: { fontSize: FontSize.xs, color: Colors.primary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center', marginTop: 40 },
});
