import { describe, it, expect, beforeEach } from "vitest";
import { openDB, migrate, type DB } from "../src/db.js";
import {
  register, login, requireAuth, signAccessToken, signRefreshToken,
} from "../src/auth.js";

let db: DB;
const EMAIL = "auth@mafsar.dev";
const PW = "password123";

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
});

function fakeCtx(authHeader?: string) {
  const store: Record<string, unknown> = {};
  const c = {
    req: { header: () => authHeader },
    set: (k: string, v: unknown) => { store[k] = v; },
    get: (k: string) => store[k],
    json: (body: unknown, status: number) => ({ body, status }),
  } as any;
  return { c, next: async () => ({ done: true } as const) };
}

describe("register", () => {
  it("creates a user with a hashed password", async () => {
    const user = (await register(db, EMAIL, PW))!;
    expect(user.id).toBeTruthy();
    expect(user.email).toBe(EMAIL);
    expect(user.password_hash).not.toContain(PW);
    expect(user.password_hash.length).toBeGreaterThan(20);
  });

  it("normalizes the email (trim + lowercase)", async () => {
    const user = await register(db, "  Mixed@Case.COM ", PW);
    expect(user!.email).toBe("mixed@case.com");
  });

  it("rejects duplicate emails", async () => {
    await register(db, EMAIL, PW);
    expect(await register(db, EMAIL, "different123")).toBeNull();
  });
});

describe("login", () => {
  it("succeeds with correct credentials", async () => {
    const created = (await register(db, EMAIL, PW))!;
    const user = await login(db, EMAIL, PW);
    expect(user?.id).toBe(created.id);
  });

  it("is case-insensitive on email", async () => {
    await register(db, EMAIL, PW);
    expect(await login(db, "AUTH@mafsar.dev", PW)).toBeTruthy();
  });

  it("fails with wrong password and unknown email", async () => {
    await register(db, EMAIL, PW);
    expect(await login(db, EMAIL, "wrongpass")).toBeNull();
    expect(await login(db, "nobody@mafsar.dev", PW)).toBeNull();
  });
});

describe("requireAuth middleware", () => {
  it("passes with a valid access token and sets userId", async () => {
    const user = (await register(db, EMAIL, PW))!;
    const token = await signAccessToken(user.id);
    const { c, next } = fakeCtx(`Bearer ${token}`);
    const res = await requireAuth()(c, next);
    expect(res).toBeUndefined(); // fell through to next()
    expect(c.get("userId")).toBe(user.id);
  });

  it("rejects missing Authorization header", async () => {
    const { c } = fakeCtx(undefined);
    const res: any = await requireAuth()(c, async () => {});
    expect(res.status).toBe(401);
  });

  it("rejects a non-Bearer header", async () => {
    const user = (await register(db, EMAIL, PW))!;
    const token = await signAccessToken(user.id);
    const { c } = fakeCtx(`Basic ${token}`);
    const res: any = await requireAuth()(c, async () => {});
    expect(res.status).toBe(401);
  });

  it("rejects garbage tokens", async () => {
    const { c } = fakeCtx("Bearer not-a-jwt");
    const res: any = await requireAuth()(c, async () => {});
    expect(res.status).toBe(401);
  });

  it("rejects a refresh token used as an access token", async () => {
    const user = (await register(db, EMAIL, PW))!;
    const refresh = await signRefreshToken(user.id);
    const { c } = fakeCtx(`Bearer ${refresh}`);
    const res: any = await requireAuth()(c, async () => {});
    expect(res.status).toBe(401);
  });
});

describe("token types differ", () => {
  it("access and refresh tokens carry a typ claim", async () => {
    const { jwtVerify } = await import("jose");
    const { secretKey } = await import("../src/auth.js");
    const user = (await register(db, EMAIL, PW))!;
    const access = await jwtVerify(await signAccessToken(user.id), secretKey());
    const refresh = await jwtVerify(await signRefreshToken(user.id), secretKey());
    expect(access.payload.typ).toBe("access");
    expect(refresh.payload.typ).toBe("refresh");
  });
});
