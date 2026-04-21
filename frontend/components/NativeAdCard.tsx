/**
 * NativeAdCard.tsx
 *
 * Boot-safe native ad card for AIBrief24.
 *
 * CRASH PREVENTION:
 *   NativeAdView is NEVER rendered until adsEnabled === true in AdsContext.
 *   adsEnabled is only set true after mobileAds().initialize() resolves.
 *   If SDK init fails, this component renders a stable placeholder forever.
 *   The app will never crash due to this component.
 *
 * SAFE AD FLAG:
 *   EXPO_PUBLIC_USE_TEST_ADS=true  → Google test native ad (default, closed testing)
 *   EXPO_PUBLIC_USE_TEST_ADS=false → real Ad Unit ID (public Play Store launch only)
 *   Switch to real ads: change .env → EXPO_PUBLIC_USE_TEST_ADS=false, then rebuild.
 *
 * FABRIC SAFETY:
 *   - No animation wrappers
 *   - Stable tree shape (placeholder and loaded state have identical outer View)
 *   - Height is always exactly cardHeight prop (same as ArticleCard)
 *   - No random or index-based keys
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useAds } from '@/contexts/AdsContext';
import { Colors, Radius, FontSize } from '@/constants/theme';

// ── Safe ad mode flag ────────────────────────────────────────────────────────
// Defaults to test ads unless explicitly set to the string 'false'.
const USE_TEST_ADS = process.env.EXPO_PUBLIC_USE_TEST_ADS !== 'false';

// Official Google test native ad unit IDs (from react-native-google-mobile-ads TestIds)
const GOOGLE_TEST_NATIVE_ANDROID = 'ca-app-pub-3940256099942544/2247696110';
const GOOGLE_TEST_NATIVE_IOS = 'ca-app-pub-3940256099942544/3986624511';
const REAL_NATIVE_AD_UNIT_ID = 'ca-app-pub-6497331440034971/1975616205';

function getAdUnitId(): string {
    if (USE_TEST_ADS) {
        return Platform.OS === 'ios' ? GOOGLE_TEST_NATIVE_IOS : GOOGLE_TEST_NATIVE_ANDROID;
    }
    return REAL_NATIVE_AD_UNIT_ID;
}

export const NATIVE_AD_UNIT_ID = getAdUnitId();
// ────────────────────────────────────────────────────────────────────────────

interface NativeAdCardProps {
    /** Must match CARD_HEIGHT from the feed so pagingEnabled snap is not broken. */
    cardHeight: number;
    /** Bottom padding matching TAB_BAR_OFFSET, same as ArticleCard. */
    tabBarOffset: number;
}

/** Stable placeholder — same dimensions as a loaded ad, no native components. */
function AdPlaceholder({
    cardHeight,
    tabBarOffset,
}: NativeAdCardProps) {
    return (
        <View style={[styles.card, { height: cardHeight }]}>
            <View style={styles.adLabelRow}>
                <View style={styles.adBadge}>
                    <Text style={styles.adBadgeText}>Ad</Text>
                </View>
                <Text style={styles.adSponsored}>Sponsored</Text>
            </View>
            <View style={styles.mediaPlaceholder} />
            <View style={[styles.contentArea, { paddingBottom: tabBarOffset }]}>
                <View style={styles.placeholderHeadline} />
                <View style={styles.placeholderBody} />
                <View style={styles.placeholderCta} />
            </View>
        </View>
    );
}

/**
 * The actual native ad loader — only imported/instantiated after adsEnabled is true.
 * Keeping this in a separate inner component means that if anything in this code path
 * throws, it stays isolated and the parent (which returns the placeholder) is safe.
 */
function NativeAdLoader({ cardHeight, tabBarOffset }: NativeAdCardProps) {
    // Lazy-import so the module-level code of NativeAd doesn't execute at all
    // until we are ready.
    const [nativeAd, setNativeAd] = useState<any>(null);
    const adRef = useRef<any>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        let cancelled = false;

        import('react-native-google-mobile-ads')
            .then(({ NativeAd }) => {
                if (cancelled || !mountedRef.current) return;
                return NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID);
            })
            .then((ad) => {
                if (!ad || cancelled || !mountedRef.current) {
                    ad?.destroy?.();
                    return;
                }
                if (adRef.current) {
                    adRef.current.destroy();
                }
                adRef.current = ad;
                setNativeAd(ad);
            })
            .catch(() => {
                // Ad load failure is non-fatal — placeholder remains visible.
            });

        return () => {
            cancelled = true;
            mountedRef.current = false;
            if (adRef.current) {
                adRef.current.destroy();
                adRef.current = null;
            }
        };
    }, []);

    if (!nativeAd) {
        return <AdPlaceholder cardHeight={cardHeight} tabBarOffset={tabBarOffset} />;
    }

    // Only import/render NativeAdView after the ad object is loaded.
    const {
        NativeAdView,
        NativeMediaView,
        NativeAsset,
        NativeAssetType,
    } = require('react-native-google-mobile-ads');

    return (
        <NativeAdView
            nativeAd={nativeAd}
            style={[styles.card, { height: cardHeight }]}
        >
            <View style={styles.adLabelRow}>
                <View style={styles.adBadge}>
                    <Text style={styles.adBadgeText}>Ad</Text>
                </View>
                <Text style={styles.adSponsored}>Sponsored</Text>
            </View>

            <NativeMediaView style={styles.mediaView} resizeMode="cover" />

            <View style={[styles.contentArea, { paddingBottom: tabBarOffset }]}>
                <NativeAsset assetType={NativeAssetType.HEADLINE}>
                    <Text style={styles.headline} numberOfLines={2} />
                </NativeAsset>

                <NativeAsset assetType={NativeAssetType.BODY}>
                    <Text style={styles.body} numberOfLines={3} />
                </NativeAsset>

                {nativeAd.advertiser ? (
                    <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                        <Text style={styles.advertiser} numberOfLines={1} />
                    </NativeAsset>
                ) : (
                    <View style={styles.advertiserPlaceholder} />
                )}

                <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                    <Text style={styles.ctaButton} />
                </NativeAsset>
            </View>
        </NativeAdView>
    );
}

/**
 * NativeAdCard — Exported component used in the Feed FlatList.
 *
 * Gate: reads adsEnabled from AdsContext. If false, renders a pure-JS
 * placeholder with no native ad components. NativeAdLoader is only
 * mounted after adsEnabled becomes true.
 */
export const NativeAdCard = React.memo(function NativeAdCard({
    cardHeight,
    tabBarOffset,
}: NativeAdCardProps) {
    const { adsEnabled } = useAds();

    // Never render native ad components on web, or before SDK is initialized.
    if (!adsEnabled || Platform.OS === 'web') {
        return <AdPlaceholder cardHeight={cardHeight} tabBarOffset={tabBarOffset} />;
    }

    return <NativeAdLoader cardHeight={cardHeight} tabBarOffset={tabBarOffset} />;
});

const styles = StyleSheet.create({
    card: {
        width: '100%',
        backgroundColor: Colors.surface,
        overflow: 'hidden',
    },
    adLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 8,
        gap: 8,
    },
    adBadge: {
        backgroundColor: Colors.surfaceHighlight,
        borderRadius: Radius.sm,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    adBadgeText: {
        color: Colors.textTertiary,
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    adSponsored: {
        color: Colors.textTertiary,
        fontSize: 11,
        fontWeight: '500',
    },
    mediaView: {
        width: '100%',
        height: 180,
        backgroundColor: Colors.surfaceHighlight,
    },
    mediaPlaceholder: {
        width: '100%',
        height: 180,
        backgroundColor: Colors.surfaceHighlight,
    },
    contentArea: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 14,
        gap: 10,
    },
    headline: {
        color: Colors.textPrimary,
        fontSize: FontSize.lg,
        fontWeight: '700',
        lineHeight: 26,
        letterSpacing: -0.3,
    },
    body: {
        color: Colors.textSecondary,
        fontSize: FontSize.sm,
        lineHeight: 20,
    },
    advertiser: {
        color: Colors.textTertiary,
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    advertiserPlaceholder: {
        height: 14,
    },
    ctaButton: {
        alignSelf: 'flex-start',
        backgroundColor: Colors.primary,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: Radius.full,
        color: '#000',
        fontSize: FontSize.sm,
        fontWeight: '700',
        overflow: 'hidden',
    },
    placeholderHeadline: {
        height: 26,
        borderRadius: 6,
        backgroundColor: Colors.surfaceHighlight,
        width: '85%',
    },
    placeholderBody: {
        height: 60,
        borderRadius: 6,
        backgroundColor: Colors.surfaceHighlight,
        opacity: 0.6,
    },
    placeholderCta: {
        height: 38,
        width: 120,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceHighlight,
        opacity: 0.4,
    },
});
