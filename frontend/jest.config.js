// Test-only config. Added to verify the ads config + NativeAdCard layout commits.
// Does not affect Metro/EAS builds.
//
// Why the root `jest-expo` preset and not `jest-expo/ios`:
//   the platform sub-presets expect a project babel.config.js (this project has
//   none — Metro applies babel-preset-expo implicitly), while the root preset
//   points babel-jest at expo/internal/babel-preset.js itself. It already
//   defaults to Platform.OS === 'ios', which is what these tests need since
//   they gate an EAS iOS build.
//
// Why the transform override:
//   NativeAdCard lazily loads the ads SDK with `import('react-native-google-mobile-ads')`.
//   Metro handles that natively, but Jest's CommonJS VM throws
//   ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG. babel-plugin-dynamic-import-node
//   rewrites import() to Promise.resolve().then(() => require()), which keeps the
//   call asynchronous (so the placeholder-then-ad sequence is still exercised)
//   and lets jest.mock intercept it. Test-environment only.
const expoPreset = require('jest-expo/jest-preset');

const JS_TRANSFORM_KEY = '\\.[jt]sx?$';
const [transformer, transformOptions] = expoPreset.transform[JS_TRANSFORM_KEY];

module.exports = {
  ...expoPreset,
  transform: {
    ...expoPreset.transform,
    [JS_TRANSFORM_KEY]: [
      transformer,
      {
        ...transformOptions,
        plugins: [
          ...(transformOptions.plugins || []),
          require.resolve('babel-plugin-dynamic-import-node'),
        ],
      },
    ],
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    ...(expoPreset.moduleNameMapper || {}),
    '^@/(.*)$': '<rootDir>/$1',
  },
};
