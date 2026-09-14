import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

const API_BASE = Constants.expoConfig?.extra?.API_BASE || 'https://mafsar-production.up.railway.app';

export async function getTokens() {
  const access = await SecureStore.getItemAsync('accessToken');
  const refresh = await SecureStore.getItemAsync('refreshToken');
  return { access, refresh };
}

export async function setTokens(access: string, refresh: string) {
  await SecureStore.setItemAsync('accessToken', access);
  await SecureStore.setItemAsync('refreshToken', refresh);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync('accessToken');
  await SecureStore.deleteItemAsync('refreshToken');
}

export async function signOut() {
  await clearTokens();
  // We keep local study data, but clear lastSync so a new sign in fetches fresh
  const { setMeta } = await import('../db');
  await setMeta('lastSync', '');
  await setMeta('userId', '');
}

export async function authedFetch(path: string, options: RequestInit = {}) {
  let { access, refresh } = await getTokens();
  
  const headers = new Headers(options.headers);
  if (access) headers.set('Authorization', `Bearer ${access}`);
  
  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  
  if (res.status === 401 && refresh) {
    const refreshRes = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh })
    });
    
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      await setTokens(data.accessToken, data.refreshToken);
      headers.set('Authorization', `Bearer ${data.accessToken}`);
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } else {
      await signOut();
      throw new Error('Session expired');
    }
  }
  
  return res;
}

export async function loginWithEmail(email: string, pass: string) {
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, pass })
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function loginWithGoogle() {
  const startRes = await fetch(`${API_BASE}/v1/auth/google/start`, { method: 'POST' });
  if (!startRes.ok) throw new Error('Could not start Google auth');
  const { authUrl, pollToken } = await startRes.json();
  
  const browserResult = await WebBrowser.openAuthSessionAsync(authUrl);
  if (browserResult.type === 'cancel') {
    throw new Error('Cancelled');
  }

  // Poll
  const start = Date.now();
  while (Date.now() - start < 10 * 60 * 1000) {
    const pollRes = await fetch(`${API_BASE}/v1/auth/google/poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pollToken })
    });
    
    if (pollRes.ok) {
      const data = await pollRes.json();
      if (data.status === 'ready') {
        await setTokens(data.accessToken, data.refreshToken);
        return data;
      }
      if (data.status === 'expired' || data.status === 'error') {
        throw new Error(`Google auth ${data.status}`);
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Google auth timed out');
}
