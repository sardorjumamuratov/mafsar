// Auth client for the Mafsar backend. Tokens live in chrome.storage.local
// under `auth`; everything works without them (offline-first).

import { API_BASE } from "../config.js";

const KEY = "auth";
const LAST_USER_KEY = "lastUserId";
const SWITCH_KEY = "accountSwitchPending";

/** No request may block the panel forever; a stalled one has to become an error. */
export const REQUEST_TIMEOUT_MS = 30_000;
const POLL_TIMEOUT_MS = 10_000;
export const TIMEOUT_MESSAGE = "The server didn't answer. Check your connection and try again.";

/** fetch that gives up instead of hanging. Callers may pass their own signal. */
async function timedFetch(url, opts = {}, ms = REQUEST_TIMEOUT_MS) {
  const timeout = AbortSignal.timeout(ms);
  const signal = opts.signal && AbortSignal.any ? AbortSignal.any([opts.signal, timeout]) : opts.signal || timeout;
  try {
    return await fetch(url, { ...opts, signal });
  } catch (e) {
    // The caller's own abort (Cancel) must stay distinguishable from a timeout.
    if (opts.signal?.aborted) throw e;
    if (e?.name === "TimeoutError" || e?.name === "AbortError") throw new Error(TIMEOUT_MESSAGE);
    throw e;
  }
}

/** Sent on every request so the server can refuse a version it no longer supports. */
function versionHeader() {
  try {
    return { "x-mafsar-version": chrome.runtime.getManifest().version };
  } catch {
    return {}; // no runtime (tests): send nothing rather than a fake version
  }
}
const OUTDATED_FALLBACK = "Update required. Restart your browser to finish updating Mafsar.";

/**
 * A 426 means this build is below the server's MIN_CLIENT_VERSION. Record it for
 * the panel banner and ask the store for the update now (Firefox may not
 * support requestUpdateCheck; the regular daily check still runs there).
 * @param {Response} res
 */
async function noteIfOutdated(res) {
  if (res.status !== 426) return;
  const data = await res.clone().json().catch(() => ({}));
  await new Promise((resolve) => chrome.storage.local.set({ clientOutdated: data.message || OUTDATED_FALLBACK }, () => resolve()));
  try {
    /** @type {any} */ (chrome.runtime).requestUpdateCheck?.(() => {});
  } catch {
    /* not available in this browser */
  }
}

export function getAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(KEY, (obj) => resolve(obj[KEY] || null));
  });
}

export function setAuth(patch) {
  return new Promise((resolve) => {
    chrome.storage.local.get(KEY, (obj) => {
      const next = { ...(obj[KEY] || {}), ...patch };
      chrome.storage.local.set({ [KEY]: next }, () => resolve(next));
    });
  });
}

/** Whose study data is on this device, from the last resolved sign-in. */
export function getLastUserId() {
  return new Promise((resolve) => chrome.storage.local.get(LAST_USER_KEY, (obj) => resolve(obj[LAST_USER_KEY] || null)));
}

/** This device now belongs to `userId`, and may sync again. */
export function rememberAccount(userId) {
  return new Promise((resolve) =>
    chrome.storage.local.set({ [LAST_USER_KEY]: userId || null, [SWITCH_KEY]: false }, () => resolve())
  );
}

/**
 * Record who just signed in. "switched" means the sets on this device belong to
 * someone else: until the learner says what to do with them, syncing would
 * upload one account's library into another, so it is blocked.
 */
export async function noteSignedInUser(userId) {
  const last = await getLastUserId();
  if (last && userId && last !== userId) {
    await new Promise((resolve) => chrome.storage.local.set({ [SWITCH_KEY]: true }, () => resolve()));
    return "switched";
  }
  await rememberAccount(userId);
  return last ? "same" : "first";
}

export function accountSwitchPending() {
  return new Promise((resolve) => chrome.storage.local.get(SWITCH_KEY, (obj) => resolve(!!obj[SWITCH_KEY])));
}

/** Drop tokens (local study data is kept — logging out never deletes it). */
export async function logout() {
  await new Promise((resolve) => chrome.storage.local.remove(KEY, () => resolve()));
}

async function postJson(path, body) {
  const res = await timedFetch(API_BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...versionHeader() },
    body: JSON.stringify(body),
  });
  await noteIfOutdated(res);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function register(email, password) {
  const data = await postJson("/v1/auth/register", { email, password });
  await setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
  return data.user;
}

export async function login(email, password) {
  const data = await postJson("/v1/auth/login", { email, password });
  await setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
  return data.user;
}

async function refreshAccessToken() {
  const auth = await getAuth();
  if (!auth?.refreshToken) throw new Error("signed out");
  const res = await timedFetch(API_BASE + "/v1/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json", ...versionHeader() },
    body: JSON.stringify({ refreshToken: auth.refreshToken }),
  });
  if (!res.ok) {
    await logout();
    throw new Error("Session expired — signed out");
  }
  const data = await res.json();
  await setAuth({ accessToken: data.accessToken });
  return data.accessToken;
}

/** fetch with the bearer token attached; refreshes once on 401 and retries. */
export async function authedFetch(path, opts = {}) {
  const auth = await getAuth();
  if (!auth?.accessToken) throw new Error("not signed in");
  const doFetch = (token) =>
    timedFetch(API_BASE + path, {
      ...opts,
      headers: {
        // A default, not a rule: the PDF upload sends raw bytes as application/pdf.
        "content-type": "application/json",
        ...(opts.headers || {}),
        authorization: `Bearer ${token}`,
        ...versionHeader(),
      },
    });
  let res = await doFetch(auth.accessToken);
  if (res.status === 401) {
    const token = await refreshAccessToken();
    res = await doFetch(token);
  }
  await noteIfOutdated(res);
  return res;
}

export async function googleSignIn({ onTab, cancelSignal }) {
  const res = await timedFetch(API_BASE + '/v1/auth/google/start', {
    method: 'POST',
    headers: versionHeader()
  });
  if (res.status === 501) throw new Error('google_unavailable');
  if (!res.ok) throw new Error('Could not start Google sign in');
  
  const { authUrl, pollId, pollToken } = await res.json();
  onTab(authUrl);

  let delay = 1500;
  const start = Date.now();
  let attempts = 0;
  while (Date.now() - start < 10 * 60 * 1000 && attempts < 150) {
    if (cancelSignal?.aborted) throw new Error('cancelled');
    await new Promise(r => setTimeout(r, delay));
    if (cancelSignal?.aborted) throw new Error('cancelled');
    
    delay = Math.min(5000, delay * 1.2);
    attempts++;
    let pollRes;
    try {
      pollRes = await timedFetch(API_BASE + '/v1/auth/google/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...versionHeader() },
        body: JSON.stringify({ pollId, pollToken })
      }, POLL_TIMEOUT_MS);
    } catch (e) {
      continue;
    }
    
    if (pollRes.status === 410) throw new Error('Sign-in expired');
    if (!pollRes.ok) {
      if (pollRes.status === 429) throw new Error('Too many requests.');
      continue;
    }
    
    const data = await pollRes.json();
    if (data.status === 'pending') continue;
    if (data.status === 'error') throw new Error(data.error);
    if (data.status === 'ready') {
      await setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
      return data.user;
    }
  }
  throw new Error('Sign-in timed out');
}

export async function pollBilling({ cancelSignal, fromPlan = "free" } = /** @type {any} */ ({})) {
  let attempts = 0;
  while (attempts < 200) {
    if (cancelSignal?.aborted) throw new Error('cancelled');
    await new Promise(r => setTimeout(r, 1500));
    if (cancelSignal?.aborted) throw new Error('cancelled');
    
    attempts++;
    let pollRes;
    try {
      pollRes = await authedFetch('/v1/me');
    } catch (e) {
      // authedFetch throws these two specific messages when the session is
      // actually gone (not a transient network blip) — retrying for up to 5
      // minutes and then reporting "Checkout timed out" would hide the real
      // cause from the user.
      if (e.message === 'not signed in' || e.message === 'Session expired — signed out') throw e;
      continue;
    }
    
    if (!pollRes.ok) continue;
    
    const data = await pollRes.json();
    if (data.usage?.plan && data.usage.plan !== fromPlan) {
      return true;
    }
  }
  throw new Error('Checkout timed out');
}
