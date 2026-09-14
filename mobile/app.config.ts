import { ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext) => ({
  ...config,
  name: 'Mafsar',
  slug: 'mafsar-mobile',
  version: '1.0.0',
  orientation: 'portrait',
  icon: '../icons/icon512.png',
  scheme: 'mafsar',
  userInterfaceStyle: 'automatic',
  splash: {
    image: '../icons/logo-master.png',
    resizeMode: 'contain',
    backgroundColor: '#0b6e77'
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.mafsar.app'
  },
  android: {
    adaptiveIcon: {
      foregroundImage: '../icons/icon512.png',
      backgroundColor: '#0b6e77'
    },
    package: 'com.mafsar.app'
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    'expo-web-browser'
  ],
  extra: {
    API_BASE: process.env.EXPO_PUBLIC_API_BASE || 'https://mafsar-production.up.railway.app'
  }
});
