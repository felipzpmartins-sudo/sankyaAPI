import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";

const PUBLIC_ROUTES = new Set(["/health", "/auth/login"]);
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const TOTP_STEP_SECONDS = 30;
const TOTP_WINDOW = 4;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type AppUser = {
  email: string;
  role: "executive" | "viacerta";
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function extractBearerToken(req: Request): string {
  const header = req.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function decodeBase32(secret: string): Buffer {
  const cleanSecret = secret.replace(/[\s=-]/g, "").toUpperCase();
  let bits = "";

  for (const char of cleanSecret) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) throw new Error("APP_TOTP_SECRET deve estar em Base32.");
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac("sha1", secret).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

export function isValidTotpCode(code: string): boolean {
  const cleanCode = code.replace(/\D/g, "");
  if (!/^\d{6}$/.test(cleanCode)) return false;

  const secret = decodeBase32(config.APP_TOTP_SECRET);
  const currentCounter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);

  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const expected = Buffer.from(hotp(secret, currentCounter + offset));
    const received = Buffer.from(cleanCode);
    if (expected.length === received.length && timingSafeEqual(expected, received)) {
      return true;
    }
  }

  return false;
}

export function getTotpSetup() {
  const issuer = "sankyaAPI";
  const account = "Maker.OS";
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: config.APP_TOTP_SECRET.replace(/[\s=-]/g, "").toUpperCase(),
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: String(TOTP_STEP_SECONDS),
  });
  const otpauthUrl = `otpauth://totp/${label}?${params.toString()}`;
  const qrCodeUrl = `https://quickchart.io/qr?size=240&margin=2&text=${encodeURIComponent(otpauthUrl)}`;

  return {
    account,
    issuer,
    manualKey: config.APP_TOTP_SECRET.replace(/[\s=-]/g, "").toUpperCase(),
    otpauthUrl,
    qrCodeUrl,
  };
}

export function createSessionToken(user: AppUser): { accessToken: string; expiresAt: string } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = base64url(
    JSON.stringify({
      exp: expiresAt,
      nonce: randomBytes(16).toString("hex"),
      user,
    }),
  );
  const signature = createHmac("sha256", config.APP_SESSION_SECRET).update(payload).digest("base64url");

  return {
    accessToken: `${payload}.${signature}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

function credentialsMatch(expectedEmailValue: string, expectedPasswordValue: string, email: string, password: string): boolean {
  const expectedEmail = Buffer.from(expectedEmailValue.trim().toLowerCase());
  const receivedEmail = Buffer.from(email.trim().toLowerCase());
  const expectedPassword = Buffer.from(expectedPasswordValue);
  const receivedPassword = Buffer.from(password);

  const emailMatches =
    expectedEmail.length === receivedEmail.length && timingSafeEqual(expectedEmail, receivedEmail);
  const passwordMatches =
    expectedPassword.length === receivedPassword.length &&
    timingSafeEqual(expectedPassword, receivedPassword);

  return emailMatches && passwordMatches;
}

export function authenticateLogin(email: string, password: string): AppUser | null {
  if (credentialsMatch(config.APP_LOGIN_EMAIL, config.APP_LOGIN_PASSWORD, email, password)) {
    return { email: config.APP_LOGIN_EMAIL.trim().toLowerCase(), role: "executive" };
  }

  if (
    config.JULIANA_LOGIN_EMAIL &&
    config.JULIANA_LOGIN_PASSWORD &&
    credentialsMatch(config.JULIANA_LOGIN_EMAIL, config.JULIANA_LOGIN_PASSWORD, email, password)
  ) {
    return { email: config.JULIANA_LOGIN_EMAIL.trim().toLowerCase(), role: "viacerta" };
  }

  return null;
}

export function isValidSessionToken(token: string): boolean {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = createHmac("sha256", config.APP_SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof decoded.exp === "number" && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export function getSessionUser(token: string): AppUser | null {
  if (!isValidSessionToken(token)) return null;

  try {
    const [payload] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user?: AppUser };
    if (
      typeof decoded.user?.email !== "string" ||
      (decoded.user.role !== "executive" && decoded.user.role !== "viacerta")
    ) {
      return null;
    }
    return decoded.user;
  } catch {
    return null;
  }
}

export function getRequestUser(req: Request): AppUser | null {
  return getSessionUser(extractBearerToken(req));
}

export function requireApiToken(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC_ROUTES.has(req.path)) {
    next();
    return;
  }

  if (!isValidSessionToken(extractBearerToken(req))) {
    res.status(401).json({
      error: "unauthorized",
      message: "Sessao invalida ou expirada.",
    });
    return;
  }

  next();
}
