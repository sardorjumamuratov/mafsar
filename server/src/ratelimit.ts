/**
 * Abuse limits and header extraction.
 *
 * This guards against two distinct types of abuse.
 * 1. Bulk enumeration attacks: credential stuffing, trying random share codes,
 *    registering thousands of trash accounts to overwhelm the DB. We limit
 *    these strictly by IP.
 * 2. Spend abuse: using the unmetered LLM endpoints aggressively to burn through
 *    our OpenRouter balance. We limit this by user ID.
 *
 * These run in-memory. Hono Cloudflare Workers often have no state across
 * requests and use external stores, but Railway gives us long-lived Node processes
 * where Map is the cheapest and simplest store imaginable. If Railway reboots
 * the container, the limits reset. If we scale to multiple instances, they
 * each have independent buckets. Both are acceptable tradeoffs for the simplicity.
 */

export const DEFAULT_LIMITS = {
  // PDF extraction: CPU only, no model call, but big uploads.
  extractPerUser: { limit: 10, windowMs: 60_000 },

  // Sign-in attempts from one IP. Tight to stop credential stuffing.
  loginPerIp: { limit: 10, windowMs: 15 * 60 * 1000 },
  
  // Specific-email locks. An attacker with millions of IPs could still stuff
  // one target account. 10 wrong guesses per 15m locks that email everywhere.
  loginFailuresPerEmail: { limit: 10, windowMs: 15 * 60 * 1000 },

  // Sign-up attempts. Moderate to allow classrooms.
  registerPerIp: { limit: 20, windowMs: 60 * 60 * 1000 },
  
  // Hard cap on new accounts per IP per DAY.
  accountsPerIp: { limit: 50, windowMs: 24 * 60 * 60 * 1000 },

  // Background token refreshes. Generous to avoid breaking the app.
  refreshPerIp: { limit: 120, windowMs: 60 * 60 * 1000 },
  
  // Google sign-in attempts.
  googleStartPerIp: { limit: 20, windowMs: 60 * 60 * 1000 },
  googlePollPerIp: { limit: 500, windowMs: 60 * 60 * 1000 },

  // LLM calls per user ID (approx 2 hours). High enough for heavy legitimate
  // use (e.g. 100 short practice sessions), but caps the blast radius if
  // someone scripts the endpoint.
  llmPerUser: { limit: 150, windowMs: 2 * 60 * 60 * 1000 },
};

/** A simple sliding window rate limiter. */
export function slidingWindow({ limit, windowMs }: { limit: number; windowMs: number }) {
  const store = new Map<string, number[]>();

  const cleanup = (now: number, hits: number[]) => {
    const valid = hits.filter((t) => now - t < windowMs);
    return valid;
  };

  // Keys are IPs and emails, which an attacker can mint without limit. Every
  // 1000 writes, drop keys whose hits have all expired, or the map grows forever.
  let writes = 0;
  const save = (key: string, hits: number[]) => {
    store.set(key, hits);
    if (++writes % 1000 !== 0) return;
    const now = Date.now();
    for (const [k, v] of store) {
      if (!v.length || now - v[v.length - 1] >= windowMs) store.delete(k);
    }
  };

  return {
    hit: (key: string) => {
      const now = Date.now();
      const hits = cleanup(now, store.get(key) || []);
      
      if (hits.length >= limit) {
        // Find the oldest hit in the window to know when one will fall off
        const oldest = hits[0];
        const retryAfterMs = oldest + windowMs - now;
        return { allowed: false, retryAfterMs };
      }

      hits.push(now);
      save(key, hits);
      return { allowed: true, retryAfterMs: 0 };
    },
    
    // Check without recording a hit
    blocked: (key: string) => {
      const now = Date.now();
      const hits = cleanup(now, store.get(key) || []);
      return hits.length >= limit;
    },

    // Record a hit bypassing the limit check (useful for delayed recording)
    record: (key: string) => {
      const now = Date.now();
      const hits = cleanup(now, store.get(key) || []);
      hits.push(now);
      save(key, hits);
    },

    retryAfter: (key: string) => {
      const now = Date.now();
      const hits = cleanup(now, store.get(key) || []);
      if (hits.length === 0) return 0;
      return hits[0] + windowMs - now;
    },

    clear: (key: string) => {
      store.delete(key);
    },

    size: () => store.size,
  };
}

export type IpSource = "xff-first" | "xff-last" | "x-real-ip";

/**
 * Extracts the real client IP, bypassing proxy hops.
 *
 * Railway/Heroku/AWS terminate TLS and proxy the request to our Node app.
 * By default they append the client's IP to X-Forwarded-For.
 * - xff-first: typical when trusting standard proxies (AWS, Heroku).
 * - xff-last: typical when the ingress guarantees the last IP is the client
 *   it saw (e.g. Railway), dropping user-supplied spoofed IPs from the left.
 */
export function clientIp(headers: Headers, remoteAddress?: string, source: IpSource = "xff-first"): string | null {
  if (source === "x-real-ip") {
    const real = headers.get("x-real-ip");
    if (real) return real.trim();
  }

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      return source === "xff-last" ? parts[parts.length - 1] : parts[0];
    }
  }

  return remoteAddress || null;
}

/**
 * Validates CORS Origin against our exact deployment base.
 */
export function corsOrigin(origin: string | undefined | null, publicBaseUrl: string | undefined, isDev: boolean): string | null {
  if (!origin) return "*"; // Direct server-to-server curl
  
  if (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")) {
    return origin;
  }

  if (publicBaseUrl && origin === publicBaseUrl) {
    return origin;
  }

  if (isDev && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))) {
    return origin;
  }

  return null;
}

/** Middleware: Limits requests by IP. */
export function limitByIp(
  limiter: ReturnType<typeof slidingWindow>,
  getIp: (c: any) => string | null
) {
  return async (c: any, next: () => Promise<void>) => {
    const ip = getIp(c);
    if (!ip) return next(); // No IP found, can't limit

    const res = limiter.hit(ip);
    if (!res.allowed) {
      return tooMany(c, res.retryAfterMs);
    }
    await next();
  };
}

/** Middleware: Limits requests by authenticated user ID. */
export function limitByUser(limiter: ReturnType<typeof slidingWindow>) {
  return async (c: any, next: () => Promise<void>) => {
    // Requires auth middleware to have run first
    const userId = c.get("userId");
    if (!userId) return next();

    const res = limiter.hit(userId);
    if (!res.allowed) {
      return tooMany(c, res.retryAfterMs);
    }
    await next();
  };
}

/** Helper to format 429 Too Many Requests */
export function tooMany(c: any, retryAfterMs: number, message = "Too many requests. Please try again later.", code = "rate_limited") {
  const seconds = Math.ceil(retryAfterMs / 1000);
  c.header("Retry-After", seconds.toString());
  return c.json({ error: code, message }, 429);
}

