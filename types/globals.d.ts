// Globals defined by vendored scripts. src/vendor/ is excluded from type
// checking (it's minified third-party code), so the parts our code touches are
// declared here. This file lives outside src/ because tools/build.mjs packages
// everything under src/ into the extension.
interface Window {
  flatpickr?: (element: Element | string, options?: Record<string, unknown>) => unknown;
}

