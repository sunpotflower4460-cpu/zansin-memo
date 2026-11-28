module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_KIZASHI_PLUS_COMPARISON !== '1') {
    return config;
  }

  return {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier: `${config.ios.bundleIdentifier}.comparison`,
      buildNumber: '7',
      infoPlist: { ...config.ios.infoPlist, CFBundleDisplayName: 'きざし比較' },
    },
    android: {
      ...config.android,
      package: `${config.android.package}.comparison`,
    },
  };
};
