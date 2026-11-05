// The approved Adsterra Native Banner (4:1). These two values are the only third-party code the Sponsored placement
// can load; the server-side switch can turn the placement on or off but can never change them.
export const NATIVE_BANNER = Object.freeze({
  scriptSrc: 'https://bancadeltempoidea.org/21/8dff71e28b526157552eaf451e0a4a21',
  containerId: 'container-8dff71e28b526157552eaf451e0a4a21',
});

export const SPONSORED_CONSENT_KEY = 'protv-sponsored-consent-v1';

// Opt-in for every viewer. A browser sending Global Privacy Control is treated as a refusal and is never asked.
export function readSponsoredConsent() {
  if (typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true) return 'declined';
  try {
    const value = window.localStorage.getItem(SPONSORED_CONSENT_KEY);
    return value === 'granted' || value === 'declined' ? value : null;
  } catch {
    return null;
  }
}

export function writeSponsoredConsent(value) {
  try { window.localStorage.setItem(SPONSORED_CONSENT_KEY, value); } catch { /* the choice still applies to this page */ }
}
