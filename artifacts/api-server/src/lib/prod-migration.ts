import { eq, sql, inArray } from "drizzle-orm";
import {
  db,
  vendorsTable,
  materialsTable,
  materialVendorsTable,
  machinesTable,
  jobTemplatesTable,
  jobRoutingTable,
} from "@workspace/db";
import { logger } from "./logger";

export async function runProdMigration(): Promise<void> {

  // ─── MIGRATION 9: Add coating_type + finish_requirements to jobs ────────
  try {
    await db.execute(sql`
      ALTER TABLE jobs
        ADD COLUMN IF NOT EXISTS coating_type        TEXT,
        ADD COLUMN IF NOT EXISTS finish_requirements TEXT[] NOT NULL DEFAULT '{}';
    `);
    logger.info("Migration 9: coating_type + finish_requirements columns ensured on jobs.");
  } catch (err) {
    logger.error("Migration 9 failed:", err);
  }

  // ─── MIGRATION 8: Add description to machines ─────────────────────────
  try {
    await db.execute(sql`
      ALTER TABLE machines
        ADD COLUMN IF NOT EXISTS description TEXT;
    `);
    // Backfill descriptions for known machines
    await db.execute(sql`
      UPDATE machines SET description = CASE
        WHEN machine_name = 'Komori LA37'          THEN 'Prints and applies UV coating, texture, or drip-off in a single pass. 12 000 sph. Best for UV/special finish jobs.'
        WHEN machine_name = 'Komori GL37'          THEN 'Prints and applies varnish in a single pass. 13 000 sph. Primary machine for varnish jobs.'
        WHEN machine_name = 'Planeta Super Variant' THEN 'Legacy press. 5 000 sph. Non-woven fabric and basic print only.'
        WHEN machine_name = 'Single Coater'        THEN 'Standalone coating unit. UV or varnish on already-printed sheets.'
        WHEN machine_name = 'Bobst Die Cutter 1'   THEN 'High-speed die cutting for folding cartons and packaging.'
        WHEN machine_name = 'Bobst Die Cutter 2'   THEN 'Secondary die cutter — currently under maintenance.'
        WHEN machine_name = 'Bobst Folder Gluer'   THEN 'High-speed folder gluer for carton boxes.'
        WHEN machine_name = 'DGM Folder Gluer'     THEN 'Mid-speed folder gluer, used for smaller runs.'
        WHEN machine_name = 'Hyong Jung Folder Gluer' THEN 'Compact folder gluer for short-run jobs.'
        WHEN machine_name = 'Wohlenberg Cutter'    THEN 'Pre-press guillotine cutter for sheet preparation.'
        ELSE description
      END
      WHERE description IS NULL;
    `);
    logger.info("Migration 8: description column ensured on machines.");
  } catch (err) {
    logger.error("Migration 8 description on machines failed:", err);
  }

  // ─── MIGRATION 7: Add step_estimates_minutes to job_templates ────────
  try {
    await db.execute(sql`
      ALTER TABLE job_templates
        ADD COLUMN IF NOT EXISTS step_estimates_minutes INTEGER[] NOT NULL DEFAULT '{}';
    `);
    // Backfill known templates by name
    await db.execute(sql`
      UPDATE job_templates SET step_estimates_minutes = CASE
        WHEN template_name = 'Full Finish Box (UV)'      THEN ARRAY[30,120,60,90]
        WHEN template_name = 'Full Finish Box (Varnish)' THEN ARRAY[30,120,60,90]
        WHEN template_name = 'Print Only'                THEN ARRAY[120]
        WHEN template_name = 'Print + Standalone Coat'   THEN ARRAY[90,60]
        WHEN template_name = 'Non Woven'                 THEN ARRAY[120,60]
        ELSE step_estimates_minutes
      END
      WHERE array_length(step_estimates_minutes, 1) IS NULL;
    `);
    logger.info("Migration 7: step_estimates_minutes column ensured on job_templates.");
  } catch (err) {
    logger.error("Migration 7 step_estimates_minutes failed:", err);
  }

  // ─── MIGRATION 6: Add estimated_minutes to job_routing ──────────────
  try {
    await db.execute(sql`
      ALTER TABLE job_routing
        ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER NOT NULL DEFAULT 0;
    `);
    // Backfill existing rows based on machine type
    await db.execute(sql`
      UPDATE job_routing jr
      SET estimated_minutes = CASE
        WHEN m.machine_type = 'printing'  THEN 120
        WHEN m.machine_type = 'cutting'   THEN 60
        WHEN m.machine_type = 'coating'   THEN 90
        WHEN m.machine_type = 'gluing'    THEN 90
        ELSE 30
      END
      FROM machines m
      WHERE jr.machine_id = m.id
        AND jr.estimated_minutes = 0;
    `);
    logger.info("Migration 6: estimated_minutes column ensured on job_routing.");
  } catch (err) {
    logger.error("Migration 6 estimated_minutes failed:", err);
  }

  // ─── MIGRATION 5: Add pause columns to job_routing ───────────────────
  try {
    await db.execute(sql`
      ALTER TABLE job_routing
        ADD COLUMN IF NOT EXISTS paused_at            TEXT,
        ADD COLUMN IF NOT EXISTS total_paused_seconds INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS pause_reason         TEXT;
    `);
    logger.info("Migration 5: pause columns ensured on job_routing.");
  } catch (err) {
    logger.error("Migration 5 pause columns failed:", err);
  }

  // ─── MIGRATION 2: Add rate/wastage/reserved columns to materials ──────
  try {
    await db.execute(sql`
      ALTER TABLE materials
        ADD COLUMN IF NOT EXISTS rate_per_unit     NUMERIC(10,2),
        ADD COLUMN IF NOT EXISTS rate_updated_at   TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS wastage_percent   NUMERIC(5,2)  NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS reserved_qty      NUMERIC(10,2) NOT NULL DEFAULT 0;
    `);
    logger.info("Migration 2: materials rate/wastage/reserved columns ensured.");
  } catch (err) {
    logger.error("Migration 2 failed:", err);
  }

  // ─── MIGRATION 3: Add rate + createdAt to stock_inward ───────────────
  try {
    await db.execute(sql`
      ALTER TABLE stock_inward
        ADD COLUMN IF NOT EXISTS rate_per_unit  NUMERIC(10,2),
        ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);
    await db.execute(sql`
      ALTER TABLE stock_inward
        ALTER COLUMN vendor_id DROP NOT NULL,
        ALTER COLUMN batch_ref SET DEFAULT '';
    `);
    logger.info("Migration 3: stock_inward columns ensured.");
  } catch (err) {
    logger.error("Migration 3 failed:", err);
  }

  // ─── MIGRATION 4: Clean up ghost/duplicate materials ─────────────────
  try {
    const oldCmyk = await db
      .select()
      .from(materialsTable)
      .where(eq(materialsTable.subType, "cmyk-set"));

    if (oldCmyk.length > 0) {
      const ids = oldCmyk.map(m => m.id);
      await db.delete(materialVendorsTable).where(inArray(materialVendorsTable.materialId, ids));
      await db.delete(materialsTable).where(inArray(materialsTable.id, ids));
      logger.info(`Migration 4: Deleted ${ids.length} old CMYK ghost record(s).`);
    }

    const dupeCheck = await db.execute(sql`
      SELECT material_name, COUNT(*) as cnt
      FROM materials
      GROUP BY material_name
      HAVING COUNT(*) > 1
    `);

    for (const row of dupeCheck.rows as { material_name: string; cnt: string }[]) {
      const dupes = await db
        .select()
        .from(materialsTable)
        .where(eq(materialsTable.materialName, row.material_name))
        .orderBy(materialsTable.currentQty);
      const toDelete = dupes.slice(0, -1).map(d => d.id);
      if (toDelete.length > 0) {
        await db.delete(materialVendorsTable).where(inArray(materialVendorsTable.materialId, toDelete));
        await db.delete(materialsTable).where(inArray(materialsTable.id, toDelete));
        logger.info(`Migration 4: Removed ${toDelete.length} duplicate(s) of "${row.material_name}".`);
      }
    }
    logger.info("Migration 4: Ghost/duplicate cleanup complete.");
  } catch (err) {
    logger.error("Migration 4 failed:", err);
  }

  // ─── MIGRATION 5: Add pause tracking to job_routing ──────────────────
  try {
    await db.execute(sql`
      ALTER TABLE job_routing
        ADD COLUMN IF NOT EXISTS paused_at             TEXT,
        ADD COLUMN IF NOT EXISTS total_paused_seconds  INTEGER NOT NULL DEFAULT 0;
    `);
    logger.info("Migration 5: job_routing pause columns ensured.");
  } catch (err) {
    logger.error("Migration 5 failed:", err);
  }

  // ─── MIGRATION 6: Create job_interruptions table ─────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_interruptions (
        id                SERIAL PRIMARY KEY,
        job_routing_id    INTEGER NOT NULL REFERENCES job_routing(id),
        job_id            INTEGER NOT NULL REFERENCES jobs(id),
        machine_id        INTEGER NOT NULL REFERENCES machines(id),
        reason            TEXT NOT NULL,
        started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at          TIMESTAMPTZ,
        duration_seconds  INTEGER,
        notes             TEXT
      );
    `);
    logger.info("Migration 6: job_interruptions table ensured.");
  } catch (err) {
    logger.error("Migration 6 failed:", err);
  }

  // ─── MIGRATION 1 guard (original) ─────────────────────────────────────
  const [testMachine] = await db
    .select({ capabilities: machinesTable.capabilities })
    .from(machinesTable)
    .where(eq(machinesTable.machineName, "Komori LA37"))
    .limit(1);

  if (testMachine && testMachine.capabilities.includes("print")) {
    logger.info("Production migration 1 already applied — skipping.");
    return;
  }

  if (!testMachine) {
    logger.info("No Komori LA37 found — skipping prod migration.");
    return;
  }

  logger.info("Running production migration 1...");

  await db.transaction(async (tx) => {
    await tx.update(machinesTable).set({
      capabilities: ["print", "uv-single-pass", "texture", "drip-off"],
      notes: "Prints and applies UV coating, texture, drip-off in single pass. 12000 sheets/hour.",
    }).where(eq(machinesTable.machineName, "Komori LA37"));

    await tx.update(machinesTable).set({
      capabilities: ["print", "varnish-single-pass"],
      notes: "Prints and applies varnish coating in a single pass. 13000 sheets/hour.",
    }).where(eq(machinesTable.machineName, "Komori GL37"));

    await tx.update(machinesTable).set({
      capabilities: ["uv-standalone", "varnish-standalone"],
      notes: "Standalone coating only.",
    }).where(eq(machinesTable.machineName, "Single Coater"));

    await tx.update(machinesTable).set({
      capabilities: ["print", "non-woven"],
      notes: "Legacy machine. 5000 sheets/hour. Only for non-woven fabric jobs.",
    }).where(eq(machinesTable.machineName, "Planeta Super Variant"));

    await tx.update(machinesTable).set({ capabilities: ["die-cutting"] }).where(eq(machinesTable.machineName, "Bobst Die Cutter 1"));
    await tx.update(machinesTable).set({ capabilities: ["die-cutting"] }).where(eq(machinesTable.machineName, "Bobst Die Cutter 2"));
    await tx.update(machinesTable).set({ capabilities: ["folder-gluing"] }).where(eq(machinesTable.machineName, "Bobst Folder Gluer"));
    await tx.update(machinesTable).set({ capabilities: ["folder-gluing"] }).where(eq(machinesTable.machineName, "DGM Folder Gluer"));
    await tx.update(machinesTable).set({ capabilities: ["folder-gluing"] }).where(eq(machinesTable.machineName, "Hyong Jung Folder Gluer"));
    await tx.update(machinesTable).set({ capabilities: ["pre-press-cutting"], notes: "Pre-press cutter" }).where(eq(machinesTable.machineName, "Wohlenberg Cutter"));

    const oldCmyk = await tx.select().from(materialsTable).where(eq(materialsTable.materialName, "CMYK Ink Set")).limit(1);
    if (oldCmyk.length > 0) {
      const [saini] = await tx.select().from(vendorsTable).where(eq(vendorsTable.vendorName, "Saini Traders")).limit(1);
      let vendorId: number;
      if (saini) {
        vendorId = saini.id;
      } else {
        const [newVendor] = await tx.insert(vendorsTable).values({ vendorName: "Saini Traders", contactPerson: "Manoj Saini", phone: "9876543214", city: "Delhi" }).returning();
        vendorId = newVendor.id;
      }
      const cmykQty = parseFloat(String(oldCmyk[0].currentQty));
      const perInk = (cmykQty / 4).toFixed(2);
      await tx.delete(materialVendorsTable).where(eq(materialVendorsTable.materialId, oldCmyk[0].id));
      await tx.delete(materialsTable).where(eq(materialsTable.id, oldCmyk[0].id));
      const newInks = await tx.insert(materialsTable).values([
        { materialName: "Cyan Ink", materialType: "consumable", subType: "cyan-ink", unit: "kg", currentQty: perInk, minReorderQty: "4" },
        { materialName: "Magenta Ink", materialType: "consumable", subType: "magenta-ink", unit: "kg", currentQty: perInk, minReorderQty: "4" },
        { materialName: "Yellow Ink", materialType: "consumable", subType: "yellow-ink", unit: "kg", currentQty: perInk, minReorderQty: "4" },
        { materialName: "Black Ink (K)", materialType: "consumable", subType: "black-ink", unit: "kg", currentQty: perInk, minReorderQty: "4" },
      ]).returning();
      for (const ink of newInks) {
        await tx.insert(materialVendorsTable).values({ materialId: ink.id, vendorId });
      }
    }

    const consumablesToAdd = [
      { name: "Cyan Ink", subType: "cyan-ink", unit: "kg", qty: 12, reorder: 4 },
      { name: "Magenta Ink", subType: "magenta-ink", unit: "kg", qty: 10, reorder: 4 },
      { name: "Yellow Ink", subType: "yellow-ink", unit: "kg", qty: 8, reorder: 4 },
      { name: "Black Ink (K)", subType: "black-ink", unit: "kg", qty: 15, reorder: 4 },
      { name: "UV Ink", subType: "uv-ink", unit: "kg", qty: 15, reorder: 5 },
      { name: "LED UV Ink", subType: "led-uv-ink", unit: "kg", qty: 10, reorder: 5 },
      { name: "Varnish", subType: "varnish", unit: "litre", qty: 20, reorder: 8 },
      { name: "Aqueous Coating", subType: "aqueous-coating", unit: "litre", qty: 25, reorder: 10 },
      { name: "Gum/Adhesive", subType: "gum", unit: "kg", qty: 30, reorder: 10 },
      { name: "Lubricant Oil", subType: "lubricant", unit: "litre", qty: 10, reorder: 3 },
      { name: "Blanket Wash", subType: "blanket-wash", unit: "litre", qty: 15, reorder: 5 },
      { name: "Fountain Solution", subType: "fountain-solution", unit: "litre", qty: 20, reorder: 8 },
      { name: "Spray Powder", subType: "spray-powder", unit: "kg", qty: 8, reorder: 3 },
      { name: "Storage Gum (Plate Gum)", subType: "plate-gum", unit: "litre", qty: 5, reorder: 2 },
    ];

    for (const c of consumablesToAdd) {
      const existing = await tx.select().from(materialsTable).where(eq(materialsTable.materialName, c.name)).limit(1);
      if (existing.length === 0) {
        await tx.insert(materialsTable).values({
          materialName: c.name,
          materialType: "consumable",
          subType: c.subType,
          unit: c.unit,
          currentQty: String(c.qty),
          minReorderQty: String(c.reorder),
        });
      }
    }

    const komoriLA = await tx.select().from(machinesTable).where(eq(machinesTable.machineName, "Komori LA37")).limit(1);
    const komoriGL = await tx.select().from(machinesTable).where(eq(machinesTable.machineName, "Komori GL37")).limit(1);
    const wohlenberg = await tx.select().from(machinesTable).where(eq(machinesTable.machineName, "Wohlenberg Cutter")).limit(1);
    const bobstDC1 = await tx.select().from(machinesTable).where(eq(machinesTable.machineName, "Bobst Die Cutter 1")).limit(1);
    const bobstGluer = await tx.select().from(machinesTable).where(eq(machinesTable.machineName, "Bobst Folder Gluer")).limit(1);
    const singleCoater = await tx.select().from(machinesTable).where(eq(machinesTable.machineName, "Single Coater")).limit(1);
    const planeta = await tx.select().from(machinesTable).where(eq(machinesTable.machineName, "Planeta Super Variant")).limit(1);

    if (komoriLA[0] && komoriGL[0] && wohlenberg[0] && bobstDC1[0] && bobstGluer[0] && singleCoater[0] && planeta[0]) {
      await tx.delete(jobTemplatesTable);
      await tx.insert(jobTemplatesTable).values([
        {
          templateName: "Full Finish Box (UV)",
          description: "Full finish with UV: Wohlenberg → Komori LA37 → Bobst DC1 → Bobst Gluer",
          routingSteps: [wohlenberg[0].id, komoriLA[0].id, bobstDC1[0].id, bobstGluer[0].id],
        },
        {
          templateName: "Full Finish Box (Varnish)",
          description: "Full finish with Varnish: Wohlenberg → Komori GL37 → Bobst DC1 → Bobst Gluer",
          routingSteps: [wohlenberg[0].id, komoriGL[0].id, bobstDC1[0].id, bobstGluer[0].id],
        },
        {
          templateName: "Print Only",
          description: "Print only: Komori GL37 or LA37",
          routingSteps: [komoriGL[0].id],
        },
        {
          templateName: "Print + Standalone Coat",
          description: "For already printed sheets: Single Coater → Bobst DC1",
          routingSteps: [singleCoater[0].id, bobstDC1[0].id],
        },
        {
          templateName: "Non Woven",
          description: "Non-woven: Planeta → Bobst DC1",
          routingSteps: [planeta[0].id, bobstDC1[0].id],
        },
      ]);
    }
  });

  logger.info("Production migration 1 complete.");
}
