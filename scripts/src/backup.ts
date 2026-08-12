/**
 * PrintFlow — database backup
 *
 *   pnpm --filter @workspace/scripts backup
 *
 * Dumps whatever DATABASE_URL points at to ./backups/printflow_<db>_<stamp>.sql.gz
 * Run it from the Replit Shell. To back up PRODUCTION, make sure the Shell's
 * DATABASE_URL is the production one (Database panel → Production), not dev.
 *
 * A pilot client's data must never be losable. Take a dump before every
 * migration and once a week during the pilot, and DOWNLOAD it off Replit —
 * a backup that only exists on the same machine is not a backup.
 */
import { spawn } from "node:child_process";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL is not set. Run this from the Replit Shell.");
  process.exit(1);
}

// Identify which database we're pointed at, so prod/dev dumps never get confused.
let dbName = "unknown";
let host = "unknown";
try {
  const u = new URL(url);
  dbName = u.pathname.replace(/^\//, "") || "unknown";
  host = u.hostname;
} catch {
  /* keep defaults */
}

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "_")
  .slice(0, 19);

const outDir = path.resolve(process.cwd(), "backups");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `printflow_${dbName}_${stamp}.sql.gz`);

console.log(`→ database : ${dbName} @ ${host}`);
console.log(`→ writing  : ${outFile}`);

// --no-owner / --no-privileges keep the dump portable to a fresh database.
const dump = spawn("pg_dump", ["--no-owner", "--no-privileges", url], {
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
dump.stderr.on("data", (d) => {
  stderr += String(d);
});

const gzip = createGzip();
const out = createWriteStream(outFile);
dump.stdout.pipe(gzip).pipe(out);

dump.on("error", (err) => {
  console.error("✗ could not run pg_dump —", err.message);
  console.error("  Is postgresql-client installed in this environment?");
  process.exit(1);
});

out.on("finish", () => {
  const size = statSync(outFile).size;
  if (size < 1024) {
    console.error(`✗ backup looks empty (${size} bytes). Something went wrong:`);
    console.error(stderr.trim() || "  (no output from pg_dump)");
    process.exit(1);
  }
  const mb = (size / 1024 / 1024).toFixed(2);
  console.log(`✓ backup complete — ${mb} MB`);

  // A schema-only dump compresses to roughly 10-30 KB. If we're under ~60 KB
  // there is almost certainly no real data in here — which on Replit usually
  // means the Shell is pointed at the DEV database, not production.
  if (size < 60 * 1024) {
    console.log("");
    console.log("⚠  WARNING — this dump is tiny, so it holds little or no data.");
    console.log(`   Database dumped: "${dbName}" @ ${host}`);
    console.log("   On Replit the Shell defaults to the DEV database.");
    console.log("   To back up PRODUCTION, copy its URL from the Database panel");
    console.log("   (toggle Development → Production) and run:");
    console.log("");
    console.log('     DATABASE_URL="<production-url>" pnpm --filter @workspace/scripts backup');
    console.log("");
  }
  console.log("");
  console.log("NEXT: download this file off Replit (Files panel → backups → ⋮ → Download).");
  console.log("A backup that lives only on the server is not a backup.");
  console.log("");
  console.log("To restore into an empty database:");
  console.log(`  gunzip -c ${path.basename(outFile)} | psql "$TARGET_DATABASE_URL"`);
});

dump.on("close", (code) => {
  if (code !== 0) {
    console.error(`✗ pg_dump exited with code ${code}`);
    console.error(stderr.trim());
    process.exit(code ?? 1);
  }
});
