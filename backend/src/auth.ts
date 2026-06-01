import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";

const PUBLIC_ROUTES = new Set(["/health", "/auth/validate"]);

function extractBearerToken(req: Request): string {
  const header = req.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export function isValidAccessToken(token: string): boolean {
  const expected = Buffer.from(config.APP_ACCESS_TOKEN);
  const received = Buffer.from(token);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function requireApiToken(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC_ROUTES.has(req.path)) {
    next();
    return;
  }

  if (!isValidAccessToken(extractBearerToken(req))) {
    res.status(401).json({
      error: "unauthorized",
      message: "Token de acesso invalido ou ausente.",
    });
    return;
  }

  next();
}
