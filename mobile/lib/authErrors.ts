const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'That email or password is incorrect.',
  'auth/wrong-password': 'That email or password is incorrect.',
  'auth/user-not-found': 'That email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'An account already exists for this email. Sign in instead.',
  'auth/weak-password': 'Choose a stronger password of at least six characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Check your connection and try again.',
  'auth/user-disabled': 'This account is unavailable. Contact support@watchprotv.com.',
  'auth/requires-recent-login': 'Sign in again to continue.',
};

export function authErrorMessage(error: unknown, fallback = 'Your account request could not be completed.'): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string') return MESSAGES[code] ?? fallback;
  return error instanceof Error ? error.message : fallback;
}
