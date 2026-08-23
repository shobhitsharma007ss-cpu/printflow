import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { createSessionMiddleware } from "./lib/session";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Locked to first-party origins. Bare cors() allowed any site to make
// credentialed requests, and our session cookie is sameSite:none — that
// combination is unsafe once real client data is in the database.
function toOrigin(value: string): string | null {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).origin;
  } catch {
    return null;
  }
}

const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? "https://plant-manager.replit.app")
  .split(",")
  .map((origin) => toOrigin(origin.trim()))
  .filter((origin): origin is string => origin !== null);

const previewOrigins = [process.env.REPLIT_DEV_DOMAIN, process.env.REPLIT_DOMAINS]
  .filter((domains): domains is string => Boolean(domains))
  .flatMap((domains) => domains.split(","))
  .map((domain) => toOrigin(domain.trim()))
  .filter((origin): origin is string => origin !== null);

const ALLOWED_ORIGINS = new Set([...configuredOrigins, ...previewOrigins]);
const isAllowedOrigin = (origin: string) => ALLOWED_ORIGINS.has(origin);

app.use(
  cors({
    origin(origin, cb) {
      // Same-origin and server-to-server requests arrive with no Origin header.
      if (!origin) return cb(null, true);
      return cb(null, isAllowedOrigin(origin));
    },
    credentials: true,
  }),
);

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    res.status(403).json({ error: "This application origin is not allowed to access PrintFlow." });
    return;
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(createSessionMiddleware());

app.use("/api", router);

export default app;
