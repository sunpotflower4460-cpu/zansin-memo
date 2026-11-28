const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const comparison = process.env.EXPO_PUBLIC_KIZASHI_PLUS_COMPARISON === '1';

// Metro がインライン化した比較用フラグを、通常ビルドで使い回さない。
config.cacheVersion = `${config.cacheVersion ?? ''}:${comparison ? 'comparison' : 'standard'}`;

module.exports = config;
