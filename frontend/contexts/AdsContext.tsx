/**
 * AdsContext.tsx
 *
 * Provides a global flag that is only set to true AFTER mobileAds().initialize()
 * has resolved successfully. No native ad components are rendered until then.
 *
 * This prevents boot crashes caused by NativeAdView being instantiated before
 * the AdMob SDK is ready, or when initialization fails on a device/config.
 */
import React, { createContext, useContext } from 'react';

interface AdsContextValue {
    adsEnabled: boolean;
}

export const AdsContext = createContext<AdsContextValue>({ adsEnabled: false });

export function useAds() {
    return useContext(AdsContext);
}
