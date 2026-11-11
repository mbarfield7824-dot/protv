// The approved Adsterra Native Banner (4:1). These two values are the only third-party code the Sponsored placement
// can load; the server-side switch can turn the placement on or off but can never change them.
export const NATIVE_BANNER = Object.freeze({
  scriptSrc: 'https://bancadeltempoidea.org/21/8dff71e28b526157552eaf451e0a4a21',
  containerId: 'container-8dff71e28b526157552eaf451e0a4a21',
});

export const SPONSORED_CONSENT_KEY = 'protv-sponsored-consent-v1';

// The viewer's own stored choice, if any. A browser sending Global Privacy Control is treated as a refusal and is
// never asked and never shown an ad, wherever it is.
export function readSponsoredConsent() {
  if (typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true) return 'declined';
  try {
    const value = window.localStorage.getItem(SPONSORED_CONSENT_KEY);
    return value === 'granted' || value === 'declined' ? value : null;
  } catch {
    return null;
  }
}

// The consent rule the server chose for this visitor's location. Anything unexpected means asking first.
export function consentModeFrom(settings) {
  return settings?.nativeBanner?.consent === 'notice' ? 'notice' : 'opt_in';
}

// Content that may be aimed at children never loads advertising automatically (COPPA); it keeps the opt-in prompt.
export function childDirectedContent(...labels) {
  return labels.flat().some((label) => typeof label === 'string' && /\b(cartoons?|kids?|children'?s?)\b/i.test(label));
}

// Whether the ad may load for this viewer now: an explicit choice always wins (Global Privacy Control counts as a
// refusal); without one, only a 'notice' location on content not aimed at children loads automatically.
export function sponsoredAllowed(choice, mode, automatic = true) {
  if (choice === 'granted') return true;
  if (choice === 'declined') return false;
  return mode === 'notice' && automatic === true;
}

export function writeSponsoredConsent(value) {
  try { window.localStorage.setItem(SPONSORED_CONSENT_KEY, value); } catch { /* the choice still applies to this page */ }
}
