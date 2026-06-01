import cors from "cors";
import express from "express";
import pino from "pino";
import { ZodError } from "zod";
import { config } from "./config.js";
import { requireApiToken } from "./auth.js";
import { migrate } from "./db/migrate.js";
import { router } from "./routes/index.js";
import { startScheduler } from "./sync/scheduler.js";

const logger = pino({
  level: config.LOG_LEVEL,
  transport: { target: "pino-pretty", options: { colorize: true } },
});

const dbInfo = migrate();
logger.info(
  { schemaVersion: dbInfo.schemaVersion, tables: dbInfo.tables, indexes: dbInfo.indexes },
  "SQLite snapshot pronto",
);

startScheduler();

const app = express();

app.use(
  cors({
    origin: config.CORS_ORIGINS,
    credentials: true,
  }),
);
app.use(express.json());

app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, "request");
  next();
});

app.use("/api", requireApiToken, router);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      details: err.flatten(),
    });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  logger.error({ err: message }, "request error");

  const sankhyaMatch = message.match(/^Sankhya (\d{3}):/);
  if (sankhyaMatch) {
    const status = Number(sankhyaMatch[1]);
    res.status(status >= 400 && status < 600 ? status : 502).json({
      error: "sankhya_error",
      message,
    });
    return;
  }

  res.status(500).json({ error: "internal_error", message });
});

app.listen(config.PORT, () => {
  logger.info(`Backend rodando em http://localhost:${config.PORT}`);
});
