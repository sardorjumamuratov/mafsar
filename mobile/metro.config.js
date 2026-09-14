// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Watch the shared/ directory so React Native can import from it
config.watchFolders = [path.resolve(__dirname, '../shared')];

module.exports = config;
