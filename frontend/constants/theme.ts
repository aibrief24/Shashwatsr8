import { Platform } from 'react-native';

export const Colors = {
  background: '#040710', // Deep midnight navy / black
  surface: '#0B1221', // Dark elevated surface
  surfaceHighlight: '#162032', // Slightly lighter for active elements
  primary: '#00D1FF', // Electric blue / cyan highlight
  primaryGlow: 'rgba(0, 209, 255, 0.4)',
  secondary: '#6366F1', // Vivid indigo
  accent: '#8B5CF6', // Subtle violet
  textPrimary: '#FFFFFF', // Crisp white
  textSecondary: '#94A3B8', // Soft gray
  textTertiary: '#64748B', // Muted gray-blue
  border: '#1E293B',
  success: '#10B981',
  overlayStart: 'transparent',
  overlayEnd: '#040710',
  card: '#0B1221',
  inputBg: '#162032',
  error: '#EF4444',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 24,
  xl: 32,
  full: 9999,
};

export const FontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const TELEGRAM_URL = 'https://t.me/aibrief24';
export const WEBSITE_URL = 'https://aibrief24.com/';

// ─── Store links ──────────────────────────────────────────────────────────────
// Sharing must point at the store the sharer is actually on. Keep these two the
// single source of truth — the share copy used to be duplicated across four
// call sites, which drifted.
export const STORE_URL = Platform.select({
  ios: 'https://apps.apple.com/app/id6794633949',
  default: 'https://play.google.com/store/apps/details?id=com.aibrief24.app',
});

export const STORE_NAME = Platform.select({
  ios: 'the App Store',
  default: 'Google Play',
});

/** Canonical share copy for an article. Used by every share path so they cannot drift. */
export const buildShareMessage = (title: string) =>
  `${title}\n\nGet AIBrief24 — AI news in seconds:\n${STORE_URL}`;
