import { describe, it, expect, vi } from "vitest";
import { slidingWindow, clientIp, corsOrigin } from "../src/ratelimit.js";

describe("slidingWindow", () => {
  it("allows hits under the limit", () => {
    const w = slidingWindow({ limit: 3, windowMs: 1000 });
    expect(w.hit("a").allowed).toBe(true);
    expect(w.hit("a").allowed).toBe(true);
    expect(w.hit("a").allowed).toBe(true);
  });

  it("blocks and gives a retry time when full", () => {
    vi.useFakeTimers({ now: 10000 });
    const w = slidingWindow({ limit: 2, windowMs: 5000 });
    w.hit("a"); // 10000
    w.hit("a"); // 10000
    
    // Third hit at the same time is blocked
    const r1 = w.hit("a");
    expect(r1.allowed).toBe(false);
    expect(r1.retryAfterMs).toBe(5000); // 10000 + 5000 - 10000

    // Time advances. The old hits are still in the window.
    vi.setSystemTime(13000);
    const r2 = w.hit("a");
    expect(r2.allowed).toBe(false);
    expect(r2.retryAfterMs).toBe(2000); // 10000 + 5000 - 13000

    // Time advances past the window. The old hits drop off.
    vi.setSystemTime(15000);
    expect(w.hit("a").allowed).toBe(true);
    
    vi.useRealTimers();
  });

  it("isolates different keys", () => {
    const w = slidingWindow({ limit: 1, windowMs: 1000 });
    expect(w.hit("a").allowed).toBe(true);
    expect(w.hit("b").allowed).toBe(true); // b has its own bucket
    expect(w.hit("a").allowed).toBe(false);
  });

  it("forgets expired keys, so minting new IPs can't grow memory forever", () => {
    vi.useFakeTimers({ now: 0 });
    const w = slidingWindow({ limit: 5, windowMs: 1000 });
    for (let i = 0; i < 999; i++) w.hit(`old-${i}`);
    vi.setSystemTime(5000);
    w.hit("fresh"); // the 1000th write triggers the sweep
    expect(w.size()).toBe(1);
    vi.useRealTimers();
  });
});

describe("clientIp", () => {
  it("uses the first IP in x-forwarded-for by default", () => {
    // e.g. Heroku, AWS ELB, standard proxies
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }), "3.3.3.3")).toBe("1.1.1.1");
  });

  it("uses the last IP in x-forwarded-for when configured", () => {
    // e.g. Railway, where the rightmost IP is the one the ingress saw
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }), "3.3.3.3", "xff-last")).toBe("2.2.2.2");
  });

  it("uses x-real-ip when configured", () => {
    // e.g. some Nginx setups
    const headers = new Headers({ "x-real-ip": "4.4.4.4", "x-forwarded-for": "1.1.1.1" });
    expect(clientIp(headers, "3.3.3.3", "x-real-ip")).toBe("4.4.4.4");
  });

  it("falls back to the socket remote address", () => {
    expect(clientIp(new Headers(), "3.3.3.3")).toBe("3.3.3.3");
  });

  it("returns null if no IP is found", () => {
    expect(clientIp(new Headers())).toBe(null);
  });
});

describe("corsOrigin", () => {
  it("allows the extension natively", () => {
    // No origin (direct call)
    expect(corsOrigin(null, "https://api.example.com", false)).toBe("*");
    expect(corsOrigin(undefined, "https://api.example.com", false)).toBe("*");
    // Extension protocols
    expect(corsOrigin("chrome-extension://abc", "https://api.example.com", false)).toBe("chrome-extension://abc");
    expect(corsOrigin("moz-extension://def", "https://api.example.com", false)).toBe("moz-extension://def");
  });

  it("allows the API's own domain (e.g. for the landing page)", () => {
    expect(corsOrigin("https://api.example.com", "https://api.example.com", false)).toBe("https://api.example.com");
    // Mismatched domain
    expect(corsOrigin("https://evil.com", "https://api.example.com", false)).toBe(null);
  });

  it("allows localhost and 127.0.0.1 strictly in non-production", () => {
    expect(corsOrigin("http://localhost:3000", "https://api.example.com", true)).toBe("http://localhost:3000");
    expect(corsOrigin("http://127.0.0.1:8080", "https://api.example.com", true)).toBe("http://127.0.0.1:8080");
    
    // In production, these are blocked
    expect(corsOrigin("http://localhost:3000", "https://api.example.com", false)).toBe(null);
  });
});

