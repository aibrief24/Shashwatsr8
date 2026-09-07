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
 *   EXPO_PUBLIC_USE_TEST_ADS=true   → Google test native ad (local dev / preview)
 *   anything else, including unset  → real Ad Unit ID (fail-safe default)
 *
 * DIAGNOSTICS:
 *   EXPO_PUBLIC_AD_DIAGNOSTICS=true → the placeholder shows the AdMob error
 *   code when a load fails. Preview builds only; never enabled in production.
 *
 * ASSET RENDERING — IMPORTANT:
 *   <NativeAsset> does NOT inject text. It only clones its child to attach a
 *   ref and register that view with the native ad (see the library's
 *   NativeAsset.tsx). The text MUST be supplied by us as the child's children,
 *   e.g. <Text>{nativeAd.headline}</Text>. A self-closing <Text /> registers
 *   correctly but renders nothing — which is what broke this card previously.
 *
 * FABRIC SAFETY:
 *   - No animation wrappers
 *   - Stable tree shape (placeholder and loaded state have identical outer View)
 *   - Height is always exactly cardHeight prop (same as ArticleCard)
 *   - No random or index-based keys
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { useAds } from '@/contexts/AdsContext';
import { Colors, Radius, FontSize } from '@/constants/theme';

// ── Safe ad mode flag ────────────────────────────────────────────────────────
// Fail-safe: defaults to REAL ads. Only the explicit string 'true' opts into
// Google test ads, so a missing/unset variable in a release build can never
// silently ship test ads (which always fill and always earn zero).
const USE_TEST_ADS = process.env.EXPO_PUBLIC_USE_TEST_ADS === 'true';

// Show AdMob error codes in the placeholder. Preview builds only.
const AD_DIAGNOSTICS = process.env.EXPO_PUBLIC_AD_DIAGNOSTICS === 'true';

// Official Google test native ad unit IDs (from react-native-google-mobile-ads TestIds)
const GOOGLE_TEST_NATIVE_ANDROID = 'ca-app-pub-3940256099942544/2247696110';
const GOOGLE_TEST_NATIVE_IOS = 'ca-app-pub-3940256099942544/3986624511';
const REAL_NATIVE_AD_UNIT_ID = Platform.OS === 'ios'
    ? 'ca-app-pub-6497331440034971/2944834861'   // iOS native ad unit
    : 'ca-app-pub-6497331440034971/1975616205';  // Android native ad unit

function getAdUnitId(): string {
    if (USE_TEST_ADS) {
        return Platform.OS === 'ios' ? GOOGLE_TEST_NATIVE_IOS : GOOGLE_TEST_NATIVE_ANDROID;
    }
    return REAL_NATIVE_AD_UNIT_ID;
}

export const NATIVE_AD_UNIT_ID = getAdUnitId();

// ── Media sizing ─────────────────────────────────────────────────────────────
// aspectRatio here is width / height, matching NativeMediaContent.aspectRatio.
const MEDIA_ASPECT_MIN = 4 / 5;        // 0.80 — tallest we allow (portrait 4:5)
const MEDIA_ASPECT_MAX = 1.91;         // widest we allow (landscape 1.91:1)
const MEDIA_ASPECT_FALLBACK = 16 / 9;  // ~1.78 when the ad reports no ratio
/** Media may never eat more than this share of the card, so text always fits. */
const MEDIA_MAX_CARD_FRACTION = 0.5;

function resolveMediaAspect(raw: number | undefined | null): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
        return MEDIA_ASPECT_FALLBACK;
    }
    return Math.min(Math.max(raw, MEDIA_ASPECT_MIN), MEDIA_ASPECT_MAX);
}

/** Trims a possibly-null ad string; returns '' when there is nothing to show. */
function assetText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}
// ────────────────────────────────────────────────────────────────────────────

interface NativeAdCardProps {
    /** Must match CARD_HEIGHT from the feed so pagingEnabled snap is not broken. */
    cardHeight: number;
    /** Bottom padding matching TAB_BAR_OFFSET, same as ArticleCard. */
    tabBarOffset: number;
}

interface AdPlaceholderProps extends NativeAdCardProps {
    /** AdMob error code, surfaced only when EXPO_PUBLIC_AD_DIAGNOSTICS === 'true'. */
    errorCode?: string | null;
}

/** Stable placeholder — same dimensions as a loaded ad, no native components. */
function AdPlaceholder({
    cardHeight,
    tabBarOffset,
    errorCode,
}: AdPlaceholderProps) {
    const { width } = useWindowDimensions();
    const mediaHeight = Math.round(
        Math.min(width / MEDIA_ASPECT_FALLBACK, cardHeight * MEDIA_MAX_CARD_FRACTION),
    );

    return (
        <View style={[styles.card, { height: cardHeight }]}>
            <View style={styles.adLabelRow}>
                <View style={styles.adBadge}>
                    <Text style={styles.adBadgeText}>Ad</Text>
                </View>
                <Text style={styles.adSponsored}>Sponsored</Text>
            </View>
            <View style={[styles.mediaPlaceholder, { height: mediaHeight }]} />
            <View style={[styles.contentArea, { paddingBottom: tabBarOffset }]}>
                <View style={styles.placeholderHeadline} />
                <View style={styles.placeholderBody} />
                <View style={styles.placeholderCta} />
                {AD_DIAGNOSTICS && errorCode ? (
                    <Text style={styles.diagnostic} numberOfLines={3}>
                        {errorCode}
                    </Text>
                ) : null}
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
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const adRef = useRef<any>(null);
    const mountedRef = useRef(true);
    const { width } = useWindowDimensions();

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
            .catch((e: any) => {
                // Ad load failure is non-fatal — placeholder remains visible —
                // but log the AdMob error code so no-fill can be told apart
                // from a bad unit ID / unapproved app.
                console.warn(`[AdMob] Native ad load failed unit=${NATIVE_AD_UNIT_ID} code=${e?.code} msg=${e?.message}`);
                if (!cancelled && mountedRef.current) {
                    setErrorCode(`${e?.code ?? 'unknown'} · ${e?.message ?? 'no message'}`);
                }
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
        return (
            <AdPlaceholder
                cardHeight={cardHeight}
                tabBarOffset={tabBarOffset}
                errorCode={errorCode}
            />
        );
    }

    // Only import/render NativeAdView after the ad object is loaded.
    const {
        NativeAdView,
        NativeMediaView,
        NativeAsset,
        NativeAssetType,
    } = require('react-native-google-mobile-ads');

    // NativeMediaView internally spreads `{ aspectRatio: mediaContent?.aspectRatio }`
    // BEFORE our style, so an unconstrained ratio fights any width/height we set.
    // We neutralise it (aspectRatio: undefined) and drive the box ourselves from a
    // clamped ratio, which keeps the media exactly one card wide every time.
    const aspect = resolveMediaAspect(nativeAd.mediaContent?.aspectRatio);
    const mediaHeight = Math.round(
        Math.min(width / aspect, cardHeight * MEDIA_MAX_CARD_FRACTION),
    );

    const headline = assetText(nativeAd.headline);
    const body = assetText(nativeAd.body);
    const advertiser = assetText(nativeAd.advertiser);
    const cta = assetText(nativeAd.callToAction) || 'Learn more';
    const iconUrl = assetText(nativeAd.icon?.url);

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

            <NativeMediaView
                style={[styles.mediaView, { height: mediaHeight, aspectRatio: undefined }]}
                resizeMode="cover"
            />

            <View style={[styles.contentArea, { paddingBottom: tabBarOffset }]}>
                <View style={styles.headlineRow}>
                    {iconUrl ? (
                        <NativeAsset assetType={NativeAssetType.ICON}>
                            <Image source={{ uri: iconUrl }} style={styles.icon} />
                        </NativeAsset>
                    ) : null}

                    {headline ? (
                        <NativeAsset assetType={NativeAssetType.HEADLINE}>
                            <Text style={styles.headline} numberOfLines={2}>
                                {headline}
                            </Text>
                        </NativeAsset>
                    ) : null}
                </View>

                {body ? (
                    <NativeAsset assetType={NativeAssetType.BODY}>
                        <Text style={styles.body} numberOfLines={3}>
                            {body}
                        </Text>
                    </NativeAsset>
                ) : null}

                {advertiser ? (
                    <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                        <Text style={styles.advertiser} numberOfLines={1}>
                            {advertiser}
                        </Text>
                    </NativeAsset>
                ) : null}

                <View style={styles.ctaRow}>
                    <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                        <Text style={styles.ctaButton} numberOfLines={1}>
                            {cta}
                        </Text>
                    </NativeAsset>
                </View>
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
        alignSelf: 'stretch',
        backgroundColor: Colors.surfaceHighlight,
    },
    mediaPlaceholder: {
        width: '100%',
        alignSelf: 'stretch',
        backgroundColor: Colors.surfaceHighlight,
    },
    contentArea: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 20,
        gap: 10,
    },
    headlineRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    icon: {
        width: 36,
        height: 36,
        borderRadius: Radius.sm,
        backgroundColor: Colors.surfaceHighlight,
    },
    headline: {
        flex: 1,
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
    ctaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 'auto',
    },
    ctaButton: {
        minWidth: 120,
        paddingHorizontal: 24,
        paddingVertical: 11,
        backgroundColor: Colors.primary,
        borderRadius: Radius.full,
        color: '#000',
        fontSize: FontSize.sm,
        fontWeight: '700',
        textAlign: 'center',
        overflow: 'hidden',
    },
    diagnostic: {
        marginTop: 6,
        color: Colors.textTertiary,
        fontSize: 10,
        lineHeight: 14,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
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
