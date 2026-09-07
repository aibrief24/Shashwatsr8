/**
 * B case g (diagnostics ON) — separate file so it gets its own module registry.
 * NativeAdCard reads EXPO_PUBLIC_AD_DIAGNOSTICS at module scope, so it must be
 * set before the component is required.
 */

process.env.EXPO_PUBLIC_USE_TEST_ADS = 'false';
process.env.EXPO_PUBLIC_AD_DIAGNOSTICS = 'true';

const React = require('react');
const { render, act, cleanup } = require('@testing-library/react-native');
const {
  CARD_HEIGHT,
  collectByType,
  emptyTextNodes,
  allTexts,
  flatten,
} = require('./helpers/adTestUtils');

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

let mockAdBehavior: any = { ad: null, reject: null };

jest.mock('react-native-google-mobile-ads', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    NativeAd: {
      createForAdRequest: jest.fn(() =>
        mockAdBehavior.reject
          ? Promise.reject(mockAdBehavior.reject)
          : Promise.resolve(mockAdBehavior.ad),
      ),
    },
    NativeAdView: ({ children, style }: any) =>
      R.createElement(View, { testID: 'native-ad-view', style }, children),
    NativeMediaView: ({ style }: any) =>
      R.createElement(View, { testID: 'native-media-view', style }),
    NativeAsset: ({ children }: any) => children,
    NativeAssetType: {
      ADVERTISER: 'advertiser',
      BODY: 'body',
      CALL_TO_ACTION: 'callToAction',
      HEADLINE: 'headline',
      PRICE: 'price',
      STORE: 'store',
      STAR_RATING: 'starRating',
      ICON: 'icon',
      IMAGE: 'image',
    },
  };
});

const { AdsContext } = require('@/contexts/AdsContext');
const { NativeAdCard } = require('@/components/NativeAdCard');

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('B g2: diagnostics enabled', () => {
  it('shows the AdMob error code in the placeholder', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAdBehavior.ad = null;
    mockAdBehavior.reject = { code: 'googleMobileAds/no-fill', message: 'No fill' };

    const { toJSON } = render(
      React.createElement(
        AdsContext.Provider,
        { value: { adsEnabled: true } },
        React.createElement(NativeAdCard, { cardHeight: CARD_HEIGHT, tabBarOffset: 100 }),
      ),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const tree = toJSON();
    const texts = allTexts(tree);

    // placeholder still, with card height intact
    expect(
      collectByType(tree, 'View').filter((n: any) => n.props.testID === 'native-ad-view'),
    ).toHaveLength(0);
    expect(flatten(tree.props.style).height).toBe(CARD_HEIGHT);

    // attribution intact, nothing blank
    expect(texts).toContain('Ad');
    expect(texts).toContain('Sponsored');
    expect(emptyTextNodes(tree)).toEqual([]);

    // the diagnostic line is present and contains the error code
    const joined = texts.join(' | ');
    expect(joined).toContain('no-fill');

    // and it is rendered monospace (the diagnostic style), not as body copy
    const diagnostic = collectByType(tree, 'Text').find((n: any) =>
      (n.children || []).some(
        (c: any) => typeof c === 'string' && c.includes('no-fill'),
      ),
    );
    expect(diagnostic).toBeDefined();
    expect(flatten(diagnostic.props.style).fontFamily).toBeDefined();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
