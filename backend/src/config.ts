import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

for (const envPath of [resolve(process.cwd(), "../.env"), resolve(process.cwd(), ".env")]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: true });
  }
}

const schema = z.object({
  SANKHYA_BASE_URL: z.string().url(),
  SANKHYA_CLIENT_ID: z.string().min(1),
  SANKHYA_CLIENT_SECRET: z.string().min(1),
  SANKHYA_TOKEN: z.string().min(1),
  APP_ACCESS_TOKEN: z.string().min(12),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:8080,http://localhost:5173")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  DATABASE_PATH: z.string().default("./data/snapshot.db"),
  VIACERTA_ACTIVE_USERS_URL: z
    .string()
    .url()
    .default("http://18.228.91.135:1337/api/viacerta/usersActivedReport"),
  SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  SYNC_INTERVAL_SLOW_MS: z.coerce.number().int().positive().default(1_800_000),
  SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuração inválida:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
