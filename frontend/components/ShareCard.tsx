// frontend/components/ShareCard.tsx
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

const CARD = 1080;

interface Props {
  article: {
    title: string;
    summary: string;
    image_url?: string;
    thumbnail_url?: string;
    source_name?: string;
  };
  onImageLoad?: () => void;
  onImageError?: () => void;
}

export default function ShareCard({ article, onImageLoad, onImageError }: Props) {
  const imageUri = article.thumbnail_url || article.image_url;
  const hasImage = !!imageUri;

  return (
    <View style={styles.card}>
      <View style={styles.topBar}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brandName}>AIBrief24</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.brandTag}>AI NEWS</Text>
      </View>

      {hasImage ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          resizeMode="cover"
          onLoad={onImageLoad}
          onError={onImageError}
        />
      ) : (
        <View style={[styles.image, styles.imageFallback]}>
          <Text style={styles.fallbackMark}>AI</Text>
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.headline} numberOfLines={4}>
          {article.title}
        </Text>
        <Text style={styles.summary} numberOfLines={5}>
          {article.summary}
        </Text>
        {!!article.source_name && (
          <Text style={styles.source}>Source: {article.source_name}</Text>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerAccent} />
        <View style={styles.footerTextWrap}>
          <Text style={styles.footerTitle}>Get AIBrief24 — AI news in seconds</Text>
          <Text style={styles.footerSub}>Download free on Google Play</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD,
    height: CARD,
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingTop: 44,
    paddingBottom: 28,
  },
  logo: { width: 64, height: 64, borderRadius: 14 },
  brandName: {
    color: Colors.textPrimary,
    fontSize: 40,
    fontWeight: '800',
    marginLeft: 20,
    letterSpacing: 0.5,
  },
  brandTag: {
    color: Colors.primary,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 3,
  },
  image: {
    width: CARD - 96,
    height: 470,
    marginHorizontal: 48,
    borderRadius: 28,
    backgroundColor: '#0a1530',
  },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackMark: {
    color: Colors.primary,
    fontSize: 120,
    fontWeight: '900',
    opacity: 0.5,
  },
  content: {
    paddingHorizontal: 48,
    paddingTop: 34,
    flex: 1,
  },
  headline: {
    color: Colors.textPrimary,
    fontSize: 46,
    fontWeight: '800',
    lineHeight: 56,
  },
  summary: {
    color: '#B8C2D9',
    fontSize: 30,
    lineHeight: 42,
    marginTop: 22,
  },
  source: {
    color: Colors.primary,
    fontSize: 26,
    fontWeight: '600',
    marginTop: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1024',
    paddingHorizontal: 48,
    paddingVertical: 34,
  },
  footerAccent: {
    width: 8,
    height: 64,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginRight: 24,
  },
  footerTextWrap: { flex: 1 },
  footerTitle: {
    color: Colors.textPrimary,
    fontSize: 34,
    fontWeight: '800',
  },
  footerSub: {
    color: '#8B97B5',
    fontSize: 26,
    marginTop: 6,
  },
});
