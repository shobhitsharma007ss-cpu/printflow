import app from "./app";
import { logger } from "./lib/logger";
import { autoSeedIfEmpty } from "./lib/auto-seed";
import { runProdMigration } from "./lib/prod-migration";
import { checkAndAlertOverdueJobs } from "./lib/alert-engine";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  try {
    await runProdMigration();
    await autoSeedIfEmpty();
  } catch (err) {
    logger.error({ err }, "Auto-seed/migration error — server will start anyway");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });

  // Check for overdue jobs every 5 minutes and send external alerts if configured.
  setInterval(() => {
    checkAndAlertOverdueJobs().catch(err =>
      logger.warn({ err }, "Overdue job alert check failed")
    );
  }, 5 * 60 * 1000);
}

start();
