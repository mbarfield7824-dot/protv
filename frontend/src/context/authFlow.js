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

// Verification email (creator sign-up). Firebase accepts one verification email per account about every minute, and
// keeps refusing for longer while requests keep arriving (measured 2026-11-20: immediate resends were refused; one
// minute after a send it was accepted again, and after repeated attempts it stayed refused for over three minutes).
// Sign-up already sends one, so pressing "Send" straight away used to show only a raw "auth/too-many-requests" error.
// An accepted request means Firebase queued the email; it does not prove the email reached the inbox, so the messages
// below say "sent" from PROtv's side and tell the creator where to look.
export const VERIFY_RESEND_COOLDOWN_MS = 60000;
export const VERIFY_SENDER = 'noreply@protv-2f48e.firebaseapp.com';
// After the creator opens the link, Firebase's confirmation page offers a "Continue" button back to the portal sign-in.
export const VERIFY_CONTINUE_URL = 'https://watchprotv.com/creators/portal';
export const verificationActionSettings = { url: VERIFY_CONTINUE_URL };

const sentKey = (uid) => `protv:verification-sent:${uid}`;
const memorySent = new Map();

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function recordVerificationSent(uid, at = Date.now()) {
  if (!uid) return;
  memorySent.set(uid, at);
  try {
    storage()?.setItem(sentKey(uid), String(at));
  } catch {
    // Storage can be blocked (private mode, in-app browsers); the in-memory copy still covers this page.
  }
}

export function lastVerificationSent(uid) {
  if (!uid) return 0;
  let stored;
  try {
    stored = Number(storage()?.getItem(sentKey(uid))) || 0;
  } catch {
    stored = 0;
  }
  return Math.max(memorySent.get(uid) || 0, stored);
}

// Milliseconds until another verification email can be requested (0 = now).
export function verificationCooldownLeft(uid, now = Date.now()) {
  const last = lastVerificationSent(uid);
  if (!last) return 0;
  return Math.max(0, last + VERIFY_RESEND_COOLDOWN_MS - now);
}

export function verificationSentMessage(email) {
  return `We sent a verification link to ${email}. It comes from ${VERIFY_SENDER} with the subject "Verify your email for PROtv" and usually arrives within a few minutes. If it is not in your inbox, check Spam or Junk (on Yahoo and AOL, the Spam folder). Open the link, then come back and press "I've verified — open dashboard".`;
}

export function verificationErrorMessage(error, email) {
  const code = error?.code || '';
  if (code === 'auth/too-many-requests') {
    return `A verification email was already sent to ${email} a moment ago, so another one cannot be sent yet. Check your inbox and Spam or Junk folder for an email from ${VERIFY_SENDER}. If it has not arrived, wait a few minutes before sending another — each extra try restarts the wait.`;
  }
  if (code === AUTH_TIMEOUT_CODE || code === 'auth/network-request-failed' || code === 'auth/timeout') {
    return 'We could not reach the email service, so we cannot confirm the email was sent. Check your internet connection and try again.';
  }
  if (code === 'auth/user-token-expired' || code === 'auth/requires-recent-login' || code === 'auth/invalid-user-token' || code === 'auth/user-not-found') {
    return 'Your sign-in has expired. Sign out, sign in again with the same email and password, then send the verification email.';
  }
  return `The verification email could not be sent. Please try again in a few minutes, or contact support@watchprotv.com.${code ? ` (Error code: ${code})` : ''}`;
}

export const NOT_VERIFIED_YET = 'Your email address is not confirmed yet. Open the link in the verification email (check Spam or Junk too), then press "I\'ve verified — open dashboard" again. You do not need to create another account.';

// Sends one verification email for an existing account. Never throws: returns { ok, message, cooldownMs }.
export async function requestVerificationEmail(user, { send, timeoutMs = FOLLOW_UP_TIMEOUT_MS, now = Date.now } = {}) {
  const left = verificationCooldownLeft(user.uid, now());
  if (left > 0) {
    return { ok: false, cooldownMs: left, message: `A verification email was sent to ${user.email} less than a minute ago. Check your inbox and Spam or Junk folder. You can send another in ${Math.ceil(left / 1000)} seconds.` };
  }
  try {
    await withTimeout(send(user), timeoutMs);
    recordVerificationSent(user.uid, now());
    return { ok: true, cooldownMs: VERIFY_RESEND_COOLDOWN_MS, message: verificationSentMessage(user.email) };
  } catch (error) {
    if (error?.code === 'auth/too-many-requests') recordVerificationSent(user.uid, now());
    return { ok: false, cooldownMs: error?.code === 'auth/too-many-requests' ? VERIFY_RESEND_COOLDOWN_MS : 0, message: verificationErrorMessage(error, user.email), code: error?.code || '' };
  }
}
