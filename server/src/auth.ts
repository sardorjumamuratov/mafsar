import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Context, Next } from "hono";
import type { DB } from "./db.js";
import { uid, nowISO, one, run } from "./db.js";

const ACCESS_TTL = "15m";
const REFRESH_TTL = "30d";

export function secretKey(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production" && (!s || s === "change-me")) {
    throw new Error("JWT_SECRET must be set to a real secret in production");
  }
  if (!s || s === "change-me") return new TextEncoder().encode("mafsar-dev-secret");
  return new TextEncoder().encode(s);
}

async function sign(payload: Record<string, unknown>, ttl: string) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secretKey());
}

export const signAccessToken = (userId: string) =>
  sign({ sub: userId, typ: "access" }, ACCESS_TTL);

export const signRefreshToken = (userId: string) =>
  sign({ sub: userId, typ: "refresh" }, REFRESH_TTL);

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export const verifyPassword = bcrypt.compare;

// Bearer-token middleware; sets c.set("userId", ...).
export function requireAuth() {
  return async (c: Context, next: Next) => {
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return c.json({ error: "unauthorized" }, 401);
    try {
      const { payload } = await jwtVerify(token, secretKey());
      if (payload.typ !== "access") throw new Error("wrong token type");
      c.set("userId", payload.sub as string);
    } catch {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}

// POST /v1/auth/register
export async function register(db: DB, email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (await one(db, "SELECT 1 AS x FROM users WHERE email = ?", [normalized])) {
    return null; // already registered
  }
  const user = {
    id: uid(),
    email: normalized,
    password_hash: await hashPassword(password),
    created_at: nowISO(),
  };
  await run(
    db,
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [user.id, user.email, user.password_hash, user.created_at]
  );
  return user;
}

// POST /v1/auth/login
export async function login(db: DB, email: string, password: string) {
  const user = await one<{ id: string; email: string; password_hash: string }>(
    db,
    "SELECT * FROM users WHERE email = ?",
    [email.trim().toLowerCase()]
  );
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return null;
  }
  return user;
}
