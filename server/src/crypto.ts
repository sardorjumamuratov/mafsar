import crypto from "node:crypto";
import { secretKey } from "./auth.js"; // returns Uint8Array

// Derive a 32-byte key from the JWT_SECRET
function getEncryptionKey(): Buffer {
  const sk = secretKey();
  const hash = crypto.createHash("sha256");
  hash.update(sk);
  return hash.digest();
}

export function encryptState(payload: any): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const text = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Format: iv.authTag.encrypted
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptState(token: string): any {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid state token");
  
  const iv = Buffer.from(parts[0], "base64url");
  const authTag = Buffer.from(parts[1], "base64url");
  const encrypted = Buffer.from(parts[2], "base64url");
  
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}
