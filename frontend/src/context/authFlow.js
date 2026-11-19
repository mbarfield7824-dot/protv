// Shared sign-in and registration helpers. Every visitor-facing auth step has a time limit and a plain-English
// error, so the sign-in box can never sit on "Please wait..." indefinitely or show a raw Firebase error.

// How long the sign-in box waits for Firebase before telling the visitor and letting them try again.
// Firebase's own network timeout is 30 seconds per request, so this is the earlier, friendlier limit.
export const AUTH_TIMEOUT_MS = 20000;
// After this long, the box tells the visitor it is still working.
export const AUTH_SLOW_MS = 6000;
// Time limit for the follow-up steps after the account exists (display name, verification email).
export const FOLLOW_UP_TIMEOUT_MS = 15000;

export const AUTH_TIMEOUT_CODE = 'protv/timeout';

export function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('The sign-in service did not respond in time.'), { code: AUTH_TIMEOUT_CODE })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// In-app browsers (Instagram, Facebook, TikTok and similar) are where sign-in most often fails:
// Google blocks its sign-in inside them, and some limit storage and pop-ups.
export function isInAppBrowser(userAgent = '') {
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|BytedanceWebview|Snapchat|LinkedInApp|Twitter|Pinterest/i.test(userAgent);
}

const OPEN_IN_BROWSER = 'If you opened PROtv from Instagram, Facebook or another app, open watchprotv.com in Safari or Chrome instead.';

export function authErrorMessage(error, { inAppBrowser = false } = {}) {
  const code = error?.code || '';
  const browserHint = inAppBrowser ? ` ${OPEN_IN_BROWSER}` : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'An account already exists for this email address. Sign in instead, or reset your password.';
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
    case 'auth/missing-password':
      return 'Choose a stronger password with at least 6 characters.';
    case AUTH_TIMEOUT_CODE:
    case 'auth/network-request-failed':
    case 'auth/timeout':
      return `We could not reach the PROtv sign-in service. Check your internet connection and try again.${browserHint}`;
    case 'auth/too-many-requests':
      return 'Too many attempts from this device. Wait a few minutes, then try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return 'Google sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Allow pop-ups for watchprotv.com, or sign in with email.';
    case 'auth/web-storage-unsupported':
    case 'auth/operation-not-supported-in-this-environment':
      return `This browser is blocking the storage PROtv needs to keep you signed in. Turn off private browsing, or open watchprotv.com in Safari or Chrome.${browserHint}`;
    case 'auth/unauthorized-domain':
      return 'Sign-in is not available on this web address. Go to https://watchprotv.com and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support@watchprotv.com for help.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'This sign-in method is not available right now. Contact support@watchprotv.com for help.';
    default:
      return `Something went wrong. Please try again, or contact support@watchprotv.com.${browserHint}${code ? ` (Error code: ${code})` : ''}`;
  }
}

// Creates the account, then sets the display name and sends the verification email.
// Only account creation decides success: once the account exists the visitor is signed in, so a slow or failed
// follow-up step must not be reported as a failed registration (retrying would then say the email is taken).
// Follow-ups run in the background; a missed verification email can be re-sent from the Creator Portal entry.
export async function createAccount({
  create, setDisplayName, sendVerification, onFollowUpError = () => {}, followUpTimeoutMs = FOLLOW_UP_TIMEOUT_MS,
}) {
  const user = await create();
  const followUps = (async () => {
    try {
      await withTimeout(setDisplayName(user), followUpTimeoutMs);
    } catch (error) {
      onFollowUpError('display name', error);
    }
    try {
      await withTimeout(sendVerification(user), followUpTimeoutMs);
      return { verificationSent: true };
    } catch (error) {
      onFollowUpError('verification email', error);
      return { verificationSent: false };
    }
  })();
  return { user, followUps };
}
