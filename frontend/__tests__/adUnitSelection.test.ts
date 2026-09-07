/**
 * A3 — ad unit ID selection.
 *
 * Two independent checks:
 *  1. The real module is imported (jest preset = ios) and its exported
 *     NATIVE_AD_UNIT_ID is asserted for both flag states.
 *  2. The ternary is extracted verbatim from the source and evaluated with a
 *     stubbed Platform, so the Android branch is covered too without needing a
 *     second jest project.
 */
import fs from 'fs';
import path from 'path';

const IOS_REAL = 'ca-app-pub-6497331440034971/2944834861';
const ANDROID_REAL = 'ca-app-pub-6497331440034971/1975616205';
const IOS_TEST = 'ca-app-pub-3940256099942544/3986624511';
const ANDROID_TEST = 'ca-app-pub-3940256099942544/2247696110';

function loadUnitId(env: Record<string, string | undefined>): string {
  jest.resetModules();
  const prev = process.env.EXPO_PUBLIC_USE_TEST_ADS;
  if (env.EXPO_PUBLIC_USE_TEST_ADS === undefined) {
    delete process.env.EXPO_PUBLIC_USE_TEST_ADS;
  } else {
    process.env.EXPO_PUBLIC_USE_TEST_ADS = env.EXPO_PUBLIC_USE_TEST_ADS;
  }
  try {
    return require('@/components/NativeAdCard').NATIVE_AD_UNIT_ID;
  } finally {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_USE_TEST_ADS;
    else process.env.EXPO_PUBLIC_USE_TEST_ADS = prev;
  }
}

describe('A3: real module, Platform.OS === ios', () => {
  it('USE_TEST_ADS=false selects the iOS real native unit', () => {
    expect(loadUnitId({ EXPO_PUBLIC_USE_TEST_ADS: 'false' })).toBe(IOS_REAL);
  });

  it('unset selects the iOS real native unit (fail-safe)', () => {
    expect(loadUnitId({ EXPO_PUBLIC_USE_TEST_ADS: undefined })).toBe(IOS_REAL);
  });

  it('USE_TEST_ADS=true selects the Google iOS test unit', () => {
    expect(loadUnitId({ EXPO_PUBLIC_USE_TEST_ADS: 'true' })).toBe(IOS_TEST);
  });
});

describe('A3: source-extracted ternary, both platforms', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'NativeAdCard.tsx'),
    'utf8',
  );

  function evaluateFor(osName: 'ios' | 'android', useTestAds: boolean): string {
    // Pull the two real expressions out of the shipped source.
    // Stop at the first `;` — the statement terminator. (Matching `;\n` instead
    // over-runs, because the declaration ends with a trailing line comment.)
    const realMatch = src.match(/const REAL_NATIVE_AD_UNIT_ID =([\s\S]*?);/);
    const testIosMatch = src.match(/const GOOGLE_TEST_NATIVE_IOS = '([^']+)'/);
    const testAndroidMatch = src.match(/const GOOGLE_TEST_NATIVE_ANDROID = '([^']+)'/);
    expect(realMatch).toBeTruthy();
    expect(testIosMatch).toBeTruthy();
    expect(testAndroidMatch).toBeTruthy();

    const Platform = { OS: osName };
    // eslint-disable-next-line no-eval
    const realId = eval(`(function(){ const P = Platform; return ${realMatch![1]
      .replace(/Platform\.OS/g, 'P.OS')}; })()`);

    if (useTestAds) {
      return osName === 'ios' ? testIosMatch![1] : testAndroidMatch![1];
    }
    return realId;
  }

  it('iOS + real ads -> iOS native unit', () => {
    expect(evaluateFor('ios', false)).toBe(IOS_REAL);
  });

  it('Android + real ads -> Android native unit', () => {
    expect(evaluateFor('android', false)).toBe(ANDROID_REAL);
  });

  it('iOS + test ads -> Google iOS test unit', () => {
    expect(evaluateFor('ios', true)).toBe(IOS_TEST);
  });

  it('Android + test ads -> Google Android test unit', () => {
    expect(evaluateFor('android', true)).toBe(ANDROID_TEST);
  });

  it('real and test unit IDs never collide', () => {
    const all = [IOS_REAL, ANDROID_REAL, IOS_TEST, ANDROID_TEST];
    expect(new Set(all).size).toBe(4);
  });
});
