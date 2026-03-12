import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Image, Platform, Keyboard } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/services/api';
import { Colors, FontSize, Radius } from '@/constants/theme';
import { ArrowLeft, Search, X, Clock } from 'lucide-react-native';

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleSearch = async () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.searchArticles(query.trim());
      setResults(res.articles || []);
    } catch {} finally { setLoading(false); }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
  };

  const SUGGESTIONS = ['OpenAI', 'GPT-5', 'AI Funding', 'Anthropic', 'Open Source', 'NVIDIA', 'Cursor'];

  return (
    <View testID="search-screen" style={[styles.container, { paddingTop: insets.top }]}>
      {/* Search Header */}
      <View style={styles.searchHeader}>
        <TouchableOpacity testID="search-back-btn" style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <Search size={18} color={Colors.textTertiary} />
          <TextInput
            testID="search-input"
            style={styles.searchInput}
            placeholder="Search AI news..."
            placeholderTextColor={Colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity testID="clear-search-btn" onPress={clearSearch}>
              <X size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Suggestions */}
      {!searched && (
        <View style={styles.suggestions}>
          <Text style={styles.sugTitle}>Trending Searches</Text>
          <View style={styles.sugGrid}>
            {SUGGESTIONS.map(s => (
              <TouchableOpacity testID={`suggestion-${s}`} key={s} style={styles.sugChip} onPress={() => { setQuery(s); }}>
                <Text style={styles.sugChipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Results */}
      {searched && (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.resultsList}
          renderItem={({ item }) => (
            <TouchableOpacity testID={`search-result-${item.id}`} style={styles.resultCard} onPress={() => router.push(`/article/${item.id}` as any)} activeOpacity={0.8}>
              <Image source={{ uri: item.image_url }} style={styles.resultImage} />
              <View style={styles.resultBody}>
                <Text style={styles.resultCategory}>{item.category}</Text>
                <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
                <View style={styles.resultMeta}>
                  <Text style={styles.resultSource}>{item.source_name}</Text>
                  <View style={styles.dot} />
                  <Clock size={10} color={Colors.textTertiary} />
                  <Text style={styles.resultTime}>{timeAgo(item.published_at)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Search size={40} color={Colors.textTertiary} strokeWidth={1} />
              <Text style={styles.emptyTitle}>No results found</Text>
              <Text style={styles.emptyDesc}>Try searching for a different topic</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceHighlight, borderRadius: Radius.md, paddingHorizontal: 14, height: 48, gap: 10, borderWidth: 0.5, borderColor: Colors.border },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.base },
  suggestions: { paddingHorizontal: 16, paddingTop: 20 },
  sugTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textTertiary, marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  sugGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sugChip: { backgroundColor: Colors.surface, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 0.5, borderColor: Colors.border },
  sugChipText: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '500' },
  resultsList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  resultCard: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.sm, marginBottom: 10, overflow: 'hidden', borderWidth: 0.5, borderColor: Colors.border },
  resultImage: { width: 100, height: 85 },
  resultBody: { flex: 1, padding: 12, justifyContent: 'center' },
  resultCategory: { fontSize: 10, color: Colors.primary, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2, textTransform: 'uppercase' },
  resultTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, lineHeight: 18, marginBottom: 4 },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resultSource: { fontSize: 10, color: Colors.textTertiary },
  dot: { width: 2, height: 2, borderRadius: 1, backgroundColor: Colors.textTertiary },
  resultTime: { fontSize: 10, color: Colors.textTertiary },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginTop: 16, marginBottom: 8 },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center' },
});
