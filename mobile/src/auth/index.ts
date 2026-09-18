import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

export const API_BASE: string =
  Constants.expoConfig?.extra?.API_BASE || 'https://mafsar-production.up.railway.app';
const APP_VERSION: string = Constants.expoConfig?.version || '0.0.0';

// Tokens live in the OS keychain (SecureStore), never in SQLite.
const ACCESS = 'accessToken';
const REFRESH = 'refreshToken';
const EMAIL = 'userEmail';
const USER_ID = 'userId';

export interface AuthUser { id: string; email: string }

export async function isSignedIn(): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(REFRESH));
}

export async function getUser(): Promise<AuthUser | null> {
  const [id, email] = await Promise.all([SecureStore.getItemAsync(USER_ID), SecureStore.getItemAsync(EMAIL)]);
  return id ? { id, email: email || '' } : null;
}

/**
 * Store a fresh sign-in. Returns true when it's a different account from the
 * one whose data is on this phone, so the caller can clear the local library.
 */
async function saveSession(data: { accessToken: string; refreshToken: string; user: AuthUser }): Promise<boolean> {
  const previous = await SecureStore.getItemAsync(USER_ID);
  await SecureStore.setItemAsync(ACCESS, data.accessToken);
  await SecureStore.setItemAsync(REFRESH, data.refreshToken);
  await SecureStore.setItemAsync(USER_ID, data.user.id);
  await SecureStore.setItemAsync(EMAIL, data.user.email || '');
  return !!previous && previous !== data.user.id;
}

export async function signOut(): Promise<void> {
  await Promise.all([ACCESS, REFRESH].map((k) => SecureStore.deleteItemAsync(k)));
  // The local library and USER_ID stay: signing back in to the same account
  // keeps unsynced reviews. A different account clears it (saveSession).
  const { setMeta } = await import('../db');
  await setMeta('lastSync', '');
}

/** Forget everything, including which account this phone belonged to. */
export async function forgetAccount(): Promise<void> {
  await Promise.all([ACCESS, REFRESH, USER_ID, EMAIL].map((k) => SecureStore.deleteItemAsync(k)));
}

function baseHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set('x-mafsar-version', APP_VERSION);
  return h;
}

/** Server error body → a sentence a person can act on. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({} as any));
  if (res.status === 429) return data.message || 'Too many attempts. Wait a few minutes and try again.';
  if (data.error === 'invalid_credentials') return "That email and password don't match.";
  return data.message || fallback;
}

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session expired. Sign in again.');
  }
}

let refreshing: Promise<string> | null = null;

/** One refresh at a time; the server returns only a new access token. */
async function refreshAccess(): Promise<string> {
  if (!refreshing) {
    refreshing = (async () => {
      const refresh = await SecureStore.getItemAsync(REFRESH);
      if (!refresh) throw new SessionExpiredError();
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: 'POST',
        headers: baseHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (res.status === 401) {
        await signOut();
        throw new SessionExpiredError();
      }
      if (!res.ok) throw new Error(`Couldn't refresh your session (${res.status}).`);
      const data = await res.json();
      await SecureStore.setItemAsync(ACCESS, data.accessToken);
      return data.accessToken as string;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function authedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) => {
    const headers = baseHeaders(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${API_BASE}${path}`, { ...options, headers });
  };
  let res = await send(await SecureStore.getItemAsync(ACCESS));
  if (res.status === 401) res = await send(await refreshAccess());
  return res;
}

/** Returns true when the local library belongs to another account and must be cleared. */
export async function loginWithEmail(email: string, password: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: 'POST',
    headers: baseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't sign in. Check your connection and try again."));
  return saveSession(await res.json());
}

export class CancelledError extends Error {
  constructor() {
    super('Sign-in cancelled');
  }
}

/**
 * Google sign-in through the server's device flow: open the consent page in a
 * browser, poll until the server has the tokens, then close the browser.
 *
 * Polling runs while the browser is open because on iOS the user closes it
 * with "Done", which reports "cancel" even after a successful sign-in.
 */
export async function loginWithGoogle(): Promise<boolean> {
  const startRes = await fetch(`${API_BASE}/v1/auth/google/start`, { method: 'POST', headers: baseHeaders() });
  if (startRes.status === 501) throw new Error('Google sign-in is not available right now.');
  if (!startRes.ok) throw new Error(await errorMessage(startRes, "Couldn't start Google sign-in."));
  const { authUrl, pollToken } = await startRes.json();

  let browserClosed = false;
  let closedAt = 0;
  WebBrowser.openBrowserAsync(authUrl)
    .catch(() => undefined)
    .finally(() => {
      browserClosed = true;
      closedAt = Date.now();
    });

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const pollRes = await fetch(`${API_BASE}/v1/auth/google/poll`, {
      method: 'POST',
      headers: baseHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ pollToken }),
    }).catch(() => null);
    const data = pollRes ? await pollRes.json().catch(() => ({})) : {};
    if (data.status === 'ready') {
      WebBrowser.dismissBrowser();
      return saveSession(data);
    }
    if (data.status === 'expired') throw new Error('The sign-in link expired. Try again.');
    if (data.status === 'error') throw new Error(data.error || 'Google sign-in failed.');
    // Browser closed and still nothing after a short grace period: cancelled.
    if (browserClosed && Date.now() - closedAt > 4000) throw new CancelledError();
  }
  throw new Error('Google sign-in timed out. Try again.');
}

/** { hasPassword, plan } for the delete-account screen. */
export async function fetchMe(): Promise<{ hasPassword: boolean; plan: string } | null> {
  const res = await authedFetch('/v1/me');
  if (!res.ok) return null;
  const data = await res.json();
  return { hasPassword: !!data.hasPassword, plan: data.usage?.plan || 'free' };
}

/** Permanently delete the account on the server. Throws a readable message. */
export async function deleteAccount(password?: string): Promise<void> {
  const res = await authedFetch('/v1/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'DELETE', password: password || undefined }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({} as any));
  if (data.error === 'wrong_password') throw new Error("That password isn't right.");
  if (data.error === 'billing_cancel_failed') {
    throw new Error("We couldn't cancel your subscription, so nothing was deleted. Try again in a minute.");
  }
  throw new Error(data.message || `Couldn't delete your account (${res.status}).`);
}
