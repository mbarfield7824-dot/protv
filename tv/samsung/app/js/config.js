/*
 * PROtv Samsung - runtime configuration. tools/build.mjs rewrites this file inside the
 * package only: the Firebase public web client key is injected at build time and never
 * committed. previewAllowlist is empty in release builds (the server policy is required).
 */
window.PROTV_CONFIG = {
  apiBase: 'https://watchprotv.com/api',
  webBase: 'https://watchprotv.com',
  firebaseApiKey: '',
  version: '0.0.0-source',
  build: 'source',
  previewAllowlist: [],
  supportEmail: 'support@watchprotv.com',
};
