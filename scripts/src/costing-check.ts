/* Costing regression check — runs without vitest.
   Replit's package firewall blocks vitest, so this bundles the pure compute()
   function with esbuild (already present via vite) and asserts on the result.

   Run:  pnpm --filter @workspace/scripts costing-check

   THE REFERENCE CASE (DOMAIN-RULES.md): 25,000 cartons, 4/0 with one spot
   converted, aqueous coating, 8-up on 23x36 in, 300 GSM at Rs 85/kg
   -> Rs 93,639 pre-GST (Rs 3,746 per 1,000), tolerance +/- 1%.

   STATUS: the exact machine parameters behind that figure are not recorded.
   With machine = null the engine falls back to 12,000 sph / Rs 2,800 hr / 0.70 OEE
   and produces a different number. Set EXPECTED_PRE_GST once the real inputs are
   confirmed by reproducing the case in the UI. Until then this reports, it does
   not gate. DO NOT change the expected value to make it pass. */

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const EXPECTED_PRE_GST: number | null = null;   // set once inputs are confirmed
const TOLERANCE = 0.01;

const dir = mkdtempSync(path.join(tmpdir(), "pf-cost-"));
const stub = path.join(dir, "stub.js");
writeFileSync(stub, "module.exports = new Proxy(function(){}, { get: () => new Proxy(function(){}, { get: () => () => {} }) });");

const entry = path.join(dir, "entry.ts");
writeFileSync(entry, `
import { compute, DEFAULTS } from "@/pages/costing";
const c: any = compute({ ...DEFAULTS, upsPerSheet: "8" } as any, null, null, null);
console.log(JSON.stringify({ preGst: c.preGst, per1k: c.per1kRate, plates: c.plateCnt, passes: c.passes }));
`);

const out = path.join(dir, "out.cjs");
const root = path.resolve(import.meta.dirname, "..", "..");
const stubs = ["react","sonner","lucide-react","date-fns","wouter","clsx","tailwind-merge",
  "@tanstack/react-query","recharts","@workspace/api-client-react","@workspace/api-zod"];

execFileSync("npx", ["esbuild", entry, "--bundle", "--platform=node", "--format=cjs",
  `--alias:@=${path.join(root, "artifacts/printflow/src")}`,
  ...stubs.map((s) => `--alias:${s}=${stub}`),
  `--outfile=${out}`], { stdio: ["ignore", "ignore", "inherit"] });

const r = JSON.parse(execFileSync("node", [out], { encoding: "utf8" }).trim());

console.log("");
console.log("  COSTING REFERENCE CASE — 25,000 cartons, 4/0 + aqueous, 8-up on 23x36");
console.log("  ------------------------------------------------------------------");
console.log(`  pre-GST total      Rs ${Math.round(r.preGst).toLocaleString("en-IN")}`);
console.log(`  per 1,000 cartons  Rs ${Math.round(r.per1k).toLocaleString("en-IN")}`);
console.log(`  plates             ${r.plates}   (expect 5: 4 colours + 1 coating)`);
console.log(`  passes             ${r.passes}   (expect 1)`);
console.log("");

let bad = false;
if (r.plates !== 5) { console.error("  FAIL plates != 5 — plate formula has changed"); bad = true; }
if (r.passes !== 1) { console.error("  FAIL passes != 1"); bad = true; }

if (EXPECTED_PRE_GST == null) {
  console.log("  Total not gated: expected value unconfirmed. Reproduce the case in the");
  console.log("  UI with the real machine selected, then set EXPECTED_PRE_GST here.");
} else {
  const lo = EXPECTED_PRE_GST * (1 - TOLERANCE), hi = EXPECTED_PRE_GST * (1 + TOLERANCE);
  if (r.preGst < lo || r.preGst > hi) {
    console.error(`  FAIL total outside +/-1% of Rs ${EXPECTED_PRE_GST.toLocaleString("en-IN")}`);
    bad = true;
  } else console.log("  PASS total within tolerance");
}
process.exit(bad ? 1 : 0);
