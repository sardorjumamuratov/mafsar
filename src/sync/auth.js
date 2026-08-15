// Auth client for the Mafsar backend. Tokens live in chrome.storage.local
// under `auth`; everything works without them (offline-first).

import { API_BASE } from "../config.js";

const KEY = "auth";

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

/** Drop tokens (local study data is kept — logging out never deletes it). */
export async function logout() {
  await new Promise((resolve) => chrome.storage.local.remove(KEY, () => resolve()));
}

async function postJson(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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
  const res = await fetch(API_BASE + "/v1/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
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
    fetch(API_BASE + path, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
    });
  let res = await doFetch(auth.accessToken);
  if (res.status === 401) {
    const token = await refreshAccessToken();
    res = await doFetch(token);
  }
  return res;
}
