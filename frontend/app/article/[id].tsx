import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Linking, Share, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { Colors, FontSize, Radius, TELEGRAM_URL, WEBSITE_URL } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ExternalLink, Share2, Bookmark, BookmarkCheck, Send, Globe, Clock, Zap } from 'lucide-react-native';

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ArticleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [article, setArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toggleBookmark, isBookmarked } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (id) loadArticle();
  }, [id]);

  const loadArticle = async () => {
    try {
      const data = await api.getArticle(id!);
      setArticle(data);
    } catch {} finally { setLoading(false); }
  };

  const handleShare = async () => {
    if (!article) return;
    try {
      await Share.share({ message: `${article.title}\n\nRead more:\n${article.article_url}`, title: article.title });
    } catch {}
  };

  if (loading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  if (!article) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>Article not found</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backLink}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  const bookmarked = isBookmarked(article.id);

  return (
    <View testID="article-detail" style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero Image */}
        <View style={styles.imageWrap}>
          <Image source={{ uri: article.image_url }} style={styles.heroImage} resizeMode="cover" />
          <LinearGradient colors={['rgba(2,6,23,0.5)', 'transparent', 'rgba(2,6,23,0.8)']} style={styles.imageOverlay} />
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity testID="article-back-btn" style={styles.topBtn} onPress={() => router.back()}>
              <ArrowLeft size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.topRight}>
              <TouchableOpacity testID="article-share-btn" style={styles.topBtn} onPress={handleShare}>
                <Share2 size={20} color="#fff" strokeWidth={1.5} />
              </TouchableOpacity>
              <TouchableOpacity testID="article-bookmark-btn" style={styles.topBtn} onPress={() => toggleBookmark(article.id)}>
                {bookmarked ? <BookmarkCheck size={20} color={Colors.primary} fill={Colors.primary} /> : <Bookmark size={20} color="#fff" strokeWidth={1.5} />}
              </TouchableOpacity>
            </View>
          </View>
          {article.is_breaking && (
            <View style={styles.breakingBadge}>
              <Zap size={12} color="#fff" fill="#fff" />
              <Text style={styles.breakingText}>BREAKING</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.categoryRow}>
            <View style={styles.categoryBadge}><Text style={styles.categoryText}>{article.category}</Text></View>
            <View style={styles.metaRow}>
              <Clock size={12} color={Colors.textTertiary} />
              <Text style={styles.metaTime}>{timeAgo(article.published_at)}</Text>
            </View>
          </View>

          <Text style={styles.title}>{article.title}</Text>

          <View style={styles.sourceRow}>
            <Text style={styles.sourceLabel}>Source:</Text>
            <TouchableOpacity onPress={() => article.source_url && Linking.openURL(article.source_url)} activeOpacity={0.7}>
              <Text style={styles.sourceName}>{article.source_name}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.summary}>{article.summary}</Text>

          {/* Actions */}
          <TouchableOpacity testID="read-original-btn" style={styles.readOriginalBtn} onPress={() => Linking.openURL(article.article_url)} activeOpacity={0.8}>
            <LinearGradient colors={[Colors.primary, Colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.readOriginalGrad}>
              <ExternalLink size={18} color="#fff" />
              <Text style={styles.readOriginalText}>Read Full Article</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
              <Share2 size={18} color={Colors.textSecondary} strokeWidth={1.5} />
              <Text style={styles.actionBtnText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => toggleBookmark(article.id)}>
              {bookmarked ? <BookmarkCheck size={18} color={Colors.primary} fill={Colors.primary} /> : <Bookmark size={18} color={Colors.textSecondary} strokeWidth={1.5} />}
              <Text style={[styles.actionBtnText, bookmarked && { color: Colors.primary }]}>{bookmarked ? 'Saved' : 'Save'}</Text>
            </TouchableOpacity>
          </View>

          {/* CTA */}
          <View style={styles.ctaBox}>
            <Text style={styles.ctaTitle}>Want even more AI updates?</Text>
            <Text style={styles.ctaDesc}>Join our Telegram channel and visit our website for the latest AI news.</Text>
            <View style={styles.ctaBtns}>
              <TouchableOpacity testID="article-telegram-btn" style={[styles.ctaBtn, { borderColor: Colors.primary }]} onPress={() => Linking.openURL(TELEGRAM_URL)}>
                <Send size={16} color={Colors.primary} />
                <Text style={[styles.ctaBtnText, { color: Colors.primary }]}>Join Telegram</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="article-website-btn" style={[styles.ctaBtn, { borderColor: Colors.secondary }]} onPress={() => Linking.openURL(WEBSITE_URL)}>
                <Globe size={16} color={Colors.secondary} />
                <Text style={[styles.ctaBtnText, { color: Colors.secondary }]}>Visit Website</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  errorText: { color: Colors.textSecondary, fontSize: FontSize.base },
  backLink: { color: Colors.primary, fontSize: FontSize.sm, marginTop: 12 },
  scrollContent: { paddingBottom: 40 },
  imageWrap: { width: '100%', height: 280, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  imageOverlay: { ...StyleSheet.absoluteFillObject },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  topBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  topRight: { flexDirection: 'row', gap: 8 },
  breakingBadge: { position: 'absolute', bottom: 16, left: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, gap: 4 },
  breakingText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  content: { padding: 20 },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  categoryBadge: { backgroundColor: Colors.primary + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  categoryText: { color: Colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTime: { fontSize: FontSize.xs, color: Colors.textTertiary },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, lineHeight: 32, letterSpacing: -0.5, marginBottom: 12 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 6 },
  sourceLabel: { fontSize: FontSize.xs, color: Colors.textTertiary },
  sourceName: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  summary: { fontSize: FontSize.base, color: Colors.textSecondary, lineHeight: 26, marginBottom: 24 },
  readOriginalBtn: { marginBottom: 16 },
  readOriginalGrad: { height: 52, borderRadius: Radius.md, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  readOriginalText: { fontSize: FontSize.base, fontWeight: '700', color: '#fff' },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: Colors.surfaceHighlight, borderRadius: Radius.sm },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  ctaBox: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 20, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  ctaTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  ctaDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 14 },
  ctaBtns: { flexDirection: 'row', gap: 10 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.sm, borderWidth: 1 },
  ctaBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
});
