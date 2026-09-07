/**
 * B — NativeAdCard render tests (cases a–f, plus g without diagnostics).
 *
 * CommonJS requires on purpose: NativeAdCard reads EXPO_PUBLIC_* at module
 * scope, so env must be settled before the module is required. Diagnostics-on
 * (case g) lives in NativeAdCard.diagnostics.test.tsx, which gets its own
 * module registry.
 */

// Settle env BEFORE requiring the component.
process.env.EXPO_PUBLIC_USE_TEST_ADS = 'false';
delete process.env.EXPO_PUBLIC_AD_DIAGNOSTICS;

const React = require('react');
const { render, act, cleanup } = require('@testing-library/react-native');

const {
  WINDOW_WIDTH,
  CARD_HEIGHT,
  collectByType,
  emptyTextNodes,
  allTexts,
  flatten,
  findCtaNode,
  directText,
} = require('./helpers/adTestUtils');

// ── window width = 390 ───────────────────────────────────────────────────────
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

// ── controllable fake ad SDK ─────────────────────────────────────────────────
// `mock` prefix so babel-plugin-jest-hoist allows the factory to close over it.
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
    // Plain Views, tagged so the tests can find them without touching app code.
    NativeAdView: ({ children, style }: any) =>
      R.createElement(View, { testID: 'native-ad-view', style }, children),
    NativeMediaView: ({ style }: any) =>
      R.createElement(View, { testID: 'native-media-view', style }),
    // Real NativeAsset returns cloneElement(children) — a passthrough.
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

function makeAd(overrides: any = {}) {
  return {
    headline: 'Test headline',
    body: 'Test body copy',
    advertiser: 'Test Advertiser',
    callToAction: 'Install',
    icon: { url: 'https://example.com/icon.png', scale: 1 },
    mediaContent: { aspectRatio: 1.777, hasVideoContent: false, duration: 0 },
    destroy: jest.fn(),
    ...overrides,
  };
}

async function renderCard({ ad = null, reject = null }: any = {}) {
  mockAdBehavior.ad = ad;
  mockAdBehavior.reject = reject;
  const utils = render(
    React.createElement(
      AdsContext.Provider,
      { value: { adsEnabled: true } },
      React.createElement(NativeAdCard, {
        cardHeight: CARD_HEIGHT,
        tabBarOffset: 100,
      }),
    ),
  );
  // flush the dynamic import + createForAdRequest promise chain
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return utils;
}

/** Invariants that must hold for every loaded-ad case. */
function assertLoadedInvariants(tree: any, expected: { mediaHeight: number; cta: string }) {
  // outer container height == cardHeight
  expect(flatten(tree.props.style).height).toBe(CARD_HEIGHT);

  // Ad / Sponsored attribution present
  const texts = allTexts(tree);
  expect(texts).toContain('Ad');
  expect(texts).toContain('Sponsored');

  // no Text renders empty/whitespace
  const empties = emptyTextNodes(tree);
  expect(empties.map((n: any) => JSON.stringify(n.props.style))).toEqual([]);

  // media: exact height, and NO aspectRatio (library injection neutralised)
  const media = collectByType(tree, 'View').filter(
    (n: any) => n.props.testID === 'native-media-view',
  );
  expect(media).toHaveLength(1);
  const mediaStyle = flatten(media[0].props.style);
  expect(mediaStyle.height).toBe(expected.mediaHeight);
  expect(mediaStyle.aspectRatio).toBeUndefined();

  // CTA: right label, cannot collapse
  const cta = findCtaNode(tree);
  expect(cta).toBeDefined();
  expect(directText(cta)).toBe(expected.cta);
  expect(flatten(cta.props.style).minWidth).toBeGreaterThanOrEqual(120);
}

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('B: NativeAdCard layout', () => {
  it('sanity: window width is mocked to 390 and cardHeight is 700', () => {
    expect(WINDOW_WIDTH).toBe(390);
    expect(CARD_HEIGHT).toBe(700);
  });

  it('a. full assets (headline/body/advertiser/icon/CTA "Install", ar 1.777)', async () => {
    const { toJSON } = await renderCard({ ad: makeAd() });
    const tree = toJSON();
    assertLoadedInvariants(tree, { mediaHeight: 219, cta: 'Install' });

    const texts = allTexts(tree);
    expect(texts).toContain('Test headline');
    expect(texts).toContain('Test body copy');
    expect(texts).toContain('Test Advertiser');
    // icon rendered
    expect(collectByType(tree, 'Image')).toHaveLength(1);
  });

  it('b. no headline, no body, no icon, empty CTA "" -> "Learn more"', async () => {
    const { toJSON } = await renderCard({
      ad: makeAd({
        headline: '',
        body: '',
        icon: null,
        callToAction: '',
        mediaContent: null,
      }),
    });
    const tree = toJSON();
    assertLoadedInvariants(tree, { mediaHeight: 219, cta: 'Learn more' });

    // omitted assets render nothing at all
    expect(collectByType(tree, 'Image')).toHaveLength(0);
    const texts = allTexts(tree);
    expect(texts).toContain('Test Advertiser'); // advertiser still present
    expect(texts).not.toContain('');
  });

  it('c. whitespace-only headline "   ", CTA undefined -> "Learn more"', async () => {
    const { toJSON } = await renderCard({
      ad: makeAd({
        headline: '   ',
        callToAction: undefined,
        mediaContent: null,
      }),
    });
    const tree = toJSON();
    assertLoadedInvariants(tree, { mediaHeight: 219, cta: 'Learn more' });

    // whitespace headline treated as absent, not rendered as a blank Text
    expect(allTexts(tree)).not.toContain('   ');
  });

  it('d. aspectRatio 0.5 (very tall) -> clamped to min(390/0.8, 700*0.5) = 350', async () => {
    const { toJSON } = await renderCard({
      ad: makeAd({ mediaContent: { aspectRatio: 0.5 } }),
    });
    assertLoadedInvariants(toJSON(), { mediaHeight: 350, cta: 'Install' });
  });

  it('e. aspectRatio 3.0 (very wide) -> 390/1.91 ~= 204', async () => {
    const { toJSON } = await renderCard({
      ad: makeAd({ mediaContent: { aspectRatio: 3.0 } }),
    });
    assertLoadedInvariants(toJSON(), { mediaHeight: 204, cta: 'Install' });
  });

  describe('f. invalid aspect ratios fall back to 16:9 -> 219', () => {
    const bad: [string, any][] = [
      ['NaN', NaN],
      ['0', 0],
      ['undefined', undefined],
      ['negative', -2],
      ['Infinity', Infinity],
      ['null mediaContent', 'NO_MEDIA'],
    ];
    it.each(bad)('%s', async (_label, value) => {
      const mediaContent = value === 'NO_MEDIA' ? null : { aspectRatio: value };
      const { toJSON } = await renderCard({ ad: makeAd({ mediaContent }) });
      assertLoadedInvariants(toJSON(), { mediaHeight: 219, cta: 'Install' });
    });
  });

  it('g1. load rejects -> placeholder renders, NO diagnostic text (flag unset)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { toJSON } = await renderCard({
      reject: { code: 'googleMobileAds/no-fill', message: 'No fill' },
    });
    const tree = toJSON();

    // placeholder, not the ad view
    expect(
      collectByType(tree, 'View').filter((n: any) => n.props.testID === 'native-ad-view'),
    ).toHaveLength(0);

    // outer height preserved so FlatList paging still snaps
    expect(flatten(tree.props.style).height).toBe(CARD_HEIGHT);

    // attribution still present, no empty Text
    const texts = allTexts(tree);
    expect(texts).toContain('Ad');
    expect(texts).toContain('Sponsored');
    expect(emptyTextNodes(tree)).toEqual([]);

    // diagnostics OFF: the error code must not leak into the UI
    expect(texts.join(' | ')).not.toContain('no-fill');
    expect(texts.join(' | ')).not.toContain('No fill');

    // but it IS logged
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('googleMobileAds/no-fill'),
    );
    warn.mockRestore();
  });
});
