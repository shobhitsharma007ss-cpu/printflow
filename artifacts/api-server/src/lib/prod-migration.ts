import { eq, sql, inArray } from "drizzle-orm";
import {
  db,
  vendorsTable,
  materialsTable,
  materialVendorsTable,
  machinesTable,
  jobTemplatesTable,
} from "@workspace/db";
import { logger } from "./logger";

export async function runProdMigration(): Promise<void> {

  // ─── MIGRATION 2: Add rate/wastage/reserved columns to materials ──────
  try {
    await db.execute(sql`
      ALTER TABLE materials
        ADD COLUMN IF NOT EXISTS rate_per_unit     NUMERIC(10,2),
        ADD COLUMN IF NOT EXISTS rate_updated_at   TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS wastage_percent   NUMERIC(5,2)  NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS reserved_qty      NUMERIC(10,2) NOT NULL DEFAULT 0;
    `);
    logger.info("Migration 2: rate/wastage/reserved columns ensured on materials.");
  } catch (err) {
    logger.error("Migration 2 materials columns failed:", err);
  }

  // ─── MIGRATION 3: Add rate + createdAt to stock_inward, vendorId optional ──
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
    logger.info("Migration 3: stock_inward rate/createdAt columns ensured.");
  } catch (err) {
    logger.error("Migration 3 stock_inward columns failed:", err);
  }

  // ─── MIGRATION 4: Clean up ghost/duplicate materials ─────────────────
  try {
    // Delete the old CMYK Ink Set (was split into 4 individual inks)
    const oldCmyk = await db
      .select()
      .from(materialsTable)
      .where(eq(materialsTable.subType, "cmyk-set"));

    if (oldCmyk.length > 0) {
      const ids = oldCmyk.map(m => m.id);
      await db.delete(materialVendorsTable).where(inArray(materialVendorsTable.materialId, ids));
      await db.delete(materialsTable).where(inArray(materialsTable.id, ids));
      logger.info(`Migration 4: Deleted ${ids.length} old CMYK Ink Set ghost record(s).`);
    }

    // Deduplicate: if same materialName exists more than once, keep the one
    // with highest currentQty and delete the rest
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

      // Keep last (highest qty), delete the rest
      const toDelete = dupes.slice(0, -1).map(d => d.id);
      if (toDelete.length > 0) {
        await db.delete(materialVendorsTable).where(inArray(materialVendorsTable.materialId, toDelete));
        await db.delete(materialsTable).where(inArray(materialsTable.id, toDelete));
        logger.info(`Migration 4: Removed ${toDelete.length} duplicate(s) of "${row.material_name}".`);
      }
    }

    logger.info("Migration 4: Ghost/duplicate material cleanup complete.");
  } catch (err) {
    logger.error("Migration 4 cleanup failed:", err);
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
    logger.info("No Komori LA37 found — skipping prod migration (auto-seed handles fresh DBs).");
    return;
  }

  logger.info("Running production migration 1 inside transaction...");

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
      notes: "Standalone coating only. Used as standby or for already-printed sheets.",
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

    const existingGB285 = await tx.select().from(materialsTable).where(eq(materialsTable.materialName, "Grey Back Duplex 285gsm"));
    if (existingGB285.length === 1) {
      const [khanna] = await tx.select().from(vendorsTable).where(eq(vendorsTable.vendorName, "Khanna Paper")).limit(1);
      const [emami] = await tx.select().from(vendorsTable).where(eq(vendorsTable.vendorName, "Emami Paper")).limit(1);
      const khannaId = khanna ? khanna.id : (await tx.insert(vendorsTable).values({ vendorName: "Khanna Paper", contactPerson: "Rajesh Khanna", phone: "9876543210", city: "Delhi" }).returning())[0].id;
      const emamiId = emami ? emami.id : (await tx.insert(vendorsTable).values({ vendorName: "Emami Paper", contactPerson: "Arun Emami", phone: "9876543211", city: "Kolkata" }).returning())[0].id;
      await tx.update(materialsTable).set({ currentQty: "300" }).where(eq(materialsTable.id, existingGB285[0].id));
      await tx.insert(materialVendorsTable).values({ materialId: existingGB285[0].id, vendorId: khannaId }).onConflictDoNothing();
      const [newGB285] = await tx.insert(materialsTable).values({ materialName: "Grey Back Duplex 285gsm", materialType: "board", subType: "grey-back", gsm: 285, unit: "sheets", currentQty: "200", minReorderQty: "100" }).returning();
      await tx.insert(materialVendorsTable).values({ materialId: newGB285.id, vendorId: emamiId });
    }

    const existingGB350 = await tx.select().from(materialsTable).where(eq(materialsTable.materialName, "Grey Back Duplex 350gsm"));
    if (existingGB350.length === 1) {
      const [khanna] = await tx.select().from(vendorsTable).where(eq(vendorsTable.vendorName, "Khanna Paper")).limit(1);
      const [bilt] = await tx.select().from(vendorsTable).where(eq(vendorsTable.vendorName, "BILT")).limit(1);
      const khannaId = khanna ? khanna.id : (await tx.insert(vendorsTable).values({ vendorName: "Khanna Paper", contactPerson: "Rajesh Khanna", phone: "9876543210", city: "Delhi" }).returning())[0].id;
      const biltId = bilt ? bilt.id : (await tx.insert(vendorsTable).values({ vendorName: "BILT", contactPerson: "Suresh BILT", phone: "9876543212", city: "Mumbai" }).returning())[0].id;
      await tx.update(materialsTable).set({ currentQty: "200" }).where(eq(materialsTable.id, existingGB350[0].id));
      await tx.insert(materialVendorsTable).values({ materialId: existingGB350[0].id, vendorId: khannaId }).onConflictDoNothing();
      const [newGB350] = await tx.insert(materialsTable).values({ materialName: "Grey Back Duplex 350gsm", materialType: "board", subType: "grey-back", gsm: 350, unit: "sheets", currentQty: "100", minReorderQty: "50" }).returning();
      await tx.insert(materialVendorsTable).values({ materialId: newGB350.id, vendorId: biltId });
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
```

---

**Commit message:**
```
feat: migration 3 stock_inward rate column, migration 4 ghost material cleanup
