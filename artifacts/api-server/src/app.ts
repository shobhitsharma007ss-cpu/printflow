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
// Locked to our own origin. Bare cors() allowed any site to make credentialed
// requests, and our session cookie is sameSite:none — that combination is unsafe
// once real client data is in the database.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "https://plant-manager.replit.app")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Same-origin and server-to-server requests arrive with no Origin header.
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Origin not allowed"));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(createSessionMiddleware());

app.use("/api", router);

export default app;
