import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomBytes, createHash } from "node:crypto";

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildAuthUrl({ state, codeChallenge }: { state: string; codeChallenge: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI || "https://mafsar-production.up.railway.app/v1/auth/google/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  fetcher: typeof fetch = fetch
): Promise<{ id_token: string }> {
  const res = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      code_verifier: codeVerifier,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || "https://mafsar-production.up.railway.app/v1/auth/google/callback",
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ id_token: string }>;
}

export async function verifyIdToken(
  idToken: string,
  jwksUrl = "https://www.googleapis.com/oauth2/v3/certs"
): Promise<{ sub: string; email: string; emailVerified: boolean; name?: string }> {
  const JWKS = createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jwtVerify(idToken, JWKS, {
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
    throw new Error("Invalid issuer");
  }

  if (payload.email_verified !== true) {
    throw new Error("Email not verified by Google");
  }

  if (!payload.sub || !payload.email) {
    throw new Error("Missing sub or email in ID token");
  }

  return {
    sub: payload.sub,
    email: payload.email as string,
    emailVerified: payload.email_verified as boolean,
    name: payload.name as string | undefined,
  };
}
