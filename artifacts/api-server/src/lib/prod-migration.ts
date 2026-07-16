import { eq, sql, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  db,
  vendorsTable,
  materialsTable,
  materialVendorsTable,
  machinesTable,
  jobTemplatesTable,
  jobRoutingTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger";

export async function runProdMigration(): Promise<void> {

  // ─── MIGRATION 17: costing_settings table ─────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS costing_settings (
        key        TEXT PRIMARY KEY,
        value      JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      INSERT INTO costing_settings (key, value) VALUES
        ('ink_coverage',              '{"preset":"medium","light":{"cmykKg":0.28,"spotKg":0.48},"medium":{"cmykKg":0.35,"spotKg":0.60},"heavy":{"cmykKg":0.45,"spotKg":0.75}}'::jsonb),
        ('makeready_bases',           '{"lt5c":400,"ge5c":500}'::jsonb),
        ('die_setup_waste_sheets',    '{"existing":50,"new_die":150}'::jsonb),
        ('gluer_setup_waste_cartons', '{"value":100}'::jsonb),
        ('glue_grams',                '{"straight_tuck":0.4,"reverse_tuck":0.5,"auto_bottom":0.7,"crash_lock":0.6}'::jsonb),
        ('glue_rate_per_kg',          '{"value":150}'::jsonb),
        ('finishing_rates',           '{"lamination_bopp_gloss":{"rate":18,"unit":"sqm"},"lamination_bopp_matt":{"rate":16,"unit":"sqm"},"foil_stamping":{"rate":8,"unit":"sqm"},"embossing":{"rate":12,"unit":"sqm"},"spot_uv":{"rate":14,"unit":"sqm"},"window_patching":{"rate":0.80,"unit":"per_carton"}}'::jsonb),
        ('freight_packing_default',   '{"value":0}'::jsonb)
      ON CONFLICT (key) DO NOTHING;
    `);
    logger.info("Migration 17 complete — costing_settings table ready");
  } catch (err) {
    logger.error({ err }, "Migration 17 error");
  }

  // ─── MIGRATION 16: external alert tables ──────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS alert_config (
        id               SERIAL PRIMARY KEY,
        event_type       TEXT NOT NULL UNIQUE,
        whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
        email_enabled    BOOLEAN NOT NULL DEFAULT false,
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS alert_providers (
        id           SERIAL PRIMARY KEY,
        channel      TEXT NOT NULL UNIQUE,
        provider     TEXT,
        api_key      TEXT,
        api_sid      TEXT,
        from_address TEXT,
        enabled      BOOLEAN NOT NULL DEFAULT false,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS alert_recipients (
        id         SERIAL PRIMARY KEY,
        channel    TEXT NOT NULL,
        address    TEXT NOT NULL,
        label      TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS alert_log (
        id            SERIAL PRIMARY KEY,
        event_type    TEXT NOT NULL,
        channel       TEXT NOT NULL,
        recipient     TEXT NOT NULL,
        status        TEXT NOT NULL,
        error_message TEXT,
        message_body  TEXT,
        sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS alert_suppression (
        key             TEXT PRIMARY KEY,
        last_alerted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    logger.info("Migration 16 complete — alert tables ready");
  } catch (err) {
    logger.error({ err }, "Migration 16 error");
  }

  // ─── MIGRATION 15: stock_movements ledger + materials_deducted flag ───────
  try {
    await db.execute(sql`
      ALTER TABLE jobs
        ADD COLUMN IF NOT EXISTS materials_deducted BOOLEAN NOT NULL DEFAULT false;
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id            SERIAL PRIMARY KEY,
        material_id   INTEGER NOT NULL REFERENCES materials(id),
        movement_type TEXT NOT NULL,
        qty           DECIMAL(12,3) NOT NULL,
        job_id        INTEGER,
        source_ref    TEXT,
        reason        TEXT,
        performed_by  TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS stock_movements_material_id_idx ON stock_movements (material_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS stock_movements_job_id_idx ON stock_movements (job_id) WHERE job_id IS NOT NULL;
    `);
    // Seed opening-balance movements for existing materials that have stock but no ledger entries yet.
    // This ensures SUM(stock_movements.qty) == materials.current_qty from the moment the ledger is activated.
    await db.execute(sql`
      INSERT INTO stock_movements (material_id, movement_type, qty, source_ref, reason, performed_by)
      SELECT
        m.id,
        'opening',
        m.current_qty::DECIMAL,
        'migration-15',
        'Opening stock balance at ledger activation',
        'system'
      FROM materials m
      WHERE m.current_qty IS NOT NULL
        AND m.current_qty::DECIMAL > 0
        AND NOT EXISTS (
          SELECT 1 FROM stock_movements sm WHERE sm.material_id = m.id
        );
    `);
    logger.info("Migration 15: stock_movements ledger + materials_deducted flag ensured.");
  } catch (err) {
    logger.error("Migration 15 failed:", err);
  }

  // ─── MIGRATION 14: users table, session store table + seed owner account ─
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'operator',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Session store table for connect-pg-simple (its runtime createTableIfMissing
    // reads a sibling table.sql that does not survive esbuild bundling).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_sessions (
        sid    VARCHAR NOT NULL COLLATE "default",
        sess   JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        CONSTRAINT user_sessions_pkey PRIMARY KEY (sid)
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON user_sessions (expire);
    `);

    const ownerEmail = "owner@printflow.in";
    const existingOwner = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, ownerEmail))
      .limit(1);

    if (existingOwner.length === 0) {
      const passwordHash = await bcrypt.hash("printflow123", 10);
      await db.insert(usersTable).values({
        name: "Owner",
        email: ownerEmail,
        passwordHash,
        role: "owner",
      });
      logger.info("Migration 14: users table created + owner account seeded.");
    } else {
      logger.info("Migration 14: users table ensured (owner already present).");
    }
  } catch (err) {
    logger.error("Migration 14 failed:", err);
  }

  // ─── MIGRATION 13: Inventory dimension columns + material_batches table ──
  try {
    await db.execute(sql`
      ALTER TABLE materials
        ADD COLUMN IF NOT EXISTS length_cm                DECIMAL(8,2),
        ADD COLUMN IF NOT EXISTS width_cm                 DECIMAL(8,2),
        ADD COLUMN IF NOT EXISTS dimensions_display_unit  VARCHAR(10) DEFAULT 'inches',
        ADD COLUMN IF NOT EXISTS current_stock_kg         DECIMAL(12,3) DEFAULT 0;
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS material_batches (
        id             SERIAL PRIMARY KEY,
        material_id    INTEGER NOT NULL REFERENCES materials(id),
        vendor_id      INTEGER REFERENCES vendors(id),
        brand          VARCHAR(100),
        batch_code     VARCHAR(50),
        invoice_number VARCHAR(50),
        invoice_date   DATE,
        qty_kg         DECIMAL(12,3),
        qty_sheets     DECIMAL(12,2),
        qty_remaining  DECIMAL(12,2),
        rate_per_kg    DECIMAL(10,3),
        rate_per_sheet DECIMAL(10,3),
        received_date  DATE,
        notes          TEXT,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    logger.info("Migration 13: costing columns + job_quotes table ensured.");
  } catch (err) {
    logger.error("Migration 13 failed:", err);
  }

  // ─── MIGRATION 12: Costing columns on machines/jobs + job_quotes table ───
  try {
    await db.execute(sql`
      ALTER TABLE machines
        ADD COLUMN IF NOT EXISTS rated_sph               INTEGER,
        ADD COLUMN IF NOT EXISTS peak_running_sph        INTEGER,
        ADD COLUMN IF NOT EXISTS rated_speed_m_per_min   INTEGER,
        ADD COLUMN IF NOT EXISTS setup_min_repeat        INTEGER,
        ADD COLUMN IF NOT EXISTS setup_min_new           INTEGER,
        ADD COLUMN IF NOT EXISTS oee_default             DECIMAL(3,2),
        ADD COLUMN IF NOT EXISTS hour_rate               DECIMAL(10,2);
    `);
    await db.execute(sql`
      ALTER TABLE jobs
        ADD COLUMN IF NOT EXISTS carton_style        VARCHAR(20) DEFAULT 'straight_tuck',
        ADD COLUMN IF NOT EXISTS is_new_die          BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS die_cost            DECIMAL(10,2),
        ADD COLUMN IF NOT EXISTS ups_per_sheet       INTEGER,
        ADD COLUMN IF NOT EXISTS coating_application VARCHAR(20) DEFAULT 'inline';
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_quotes (
        id            SERIAL PRIMARY KEY,
        job_id        INTEGER REFERENCES jobs(id),
        version       INTEGER NOT NULL,
        costing_snapshot JSONB NOT NULL,
        pre_gst_total DECIMAL(12,2),
        final_total   DECIMAL(12,2),
        per_1000_rate DECIMAL(10,2),
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (job_id, version)
      );
    `);
    logger.info("Migration 12: costing columns + job_quotes table ensured.");
  } catch (err) {
    logger.error("Migration 12 failed:", err);
  }

  // ─── MIGRATION 12 SEED: machine costing defaults ─────────────────────────
  try {
    await db.execute(sql`
      UPDATE machines SET rated_sph=12000, oee_default=0.70, setup_min_repeat=30, setup_min_new=45, hour_rate=2800
        WHERE machine_name='Komori LA37'            AND hour_rate IS NULL;
      UPDATE machines SET rated_sph=13000, oee_default=0.70, setup_min_repeat=30, setup_min_new=45, hour_rate=2500
        WHERE machine_name='Komori GL37'            AND hour_rate IS NULL;
      UPDATE machines SET rated_sph=5000,  oee_default=0.65, setup_min_repeat=35, setup_min_new=50,  hour_rate=1800
        WHERE machine_name='Planeta Super Variant'  AND hour_rate IS NULL;
      UPDATE machines SET rated_sph=8000,  peak_running_sph=5200, setup_min_repeat=10, setup_min_new=105, hour_rate=1500
        WHERE machine_name='Bobst Die Cutter 1'     AND hour_rate IS NULL;
      UPDATE machines SET rated_sph=8000,  peak_running_sph=5200, setup_min_repeat=10, setup_min_new=105, hour_rate=1500
        WHERE machine_name='Bobst Die Cutter 2'     AND hour_rate IS NULL;
      UPDATE machines SET rated_speed_m_per_min=350, oee_default=0.65, setup_min_repeat=25, setup_min_new=75, hour_rate=1200
        WHERE machine_name='Bobst Folder Gluer'     AND hour_rate IS NULL;
      UPDATE machines SET rated_speed_m_per_min=400, oee_default=0.55, setup_min_repeat=25, setup_min_new=75, hour_rate=1000
        WHERE machine_name='Hyong Jung Folder Gluer' AND hour_rate IS NULL;
      UPDATE machines SET rated_speed_m_per_min=400, oee_default=0.50, setup_min_repeat=30, setup_min_new=90, hour_rate=800
        WHERE machine_name='DGM Folder Gluer'       AND hour_rate IS NULL;
      UPDATE machines SET setup_min_repeat=6, hour_rate=550
        WHERE machine_name='Wohlenberg Cutter'      AND hour_rate IS NULL;
    `);
    logger.info("Migration 12 seed: machine costing defaults applied.");
  } catch (err) {
    logger.error("Migration 12 seed failed:", err);
  }

  // ─── MIGRATION 11: Add rate_per_sheet to materials ───────────────────────
  try {
    await db.execute(sql`
      ALTER TABLE materials
        ADD COLUMN IF NOT EXISTS rate_per_sheet NUMERIC(12,6);
    `);
    logger.info("Migration 11: rate_per_sheet column ensured on materials.");
  } catch (err) {
    logger.error("Migration 11 failed:", err);
  }

  // ─── MIGRATION 10: Add needs_paper_trim, coating_method to jobs + step_code, prerequisite_codes to job_routing ───
  try {
    await db.execute(sql`
      ALTER TABLE jobs
        ADD COLUMN IF NOT EXISTS needs_paper_trim BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS coating_method   TEXT    NOT NULL DEFAULT 'inline';
    `);
    await db.execute(sql`
      ALTER TABLE job_routing
        ADD COLUMN IF NOT EXISTS step_code           TEXT     NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS prerequisite_codes  TEXT[]   NOT NULL DEFAULT '{}';
    `);
    logger.info("Migration 10: needs_paper_trim, coating_method, step_code, prerequisite_codes columns ensured.");
  } catch (err) {
    logger.error("Migration 10 failed:", err);
  }

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
    logger.info("Migration 2: materials columns ensured.");
  } catch (err) {
    logger.error("Migration 2 failed:", err);
  }

  // ─── MIGRATION 3: stock_inward rate column ────────────────────────────
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

  // ─── MIGRATION 4: clean up ghost/duplicate materials ─────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS material_vendors (
        id           SERIAL PRIMARY KEY,
        material_id  INTEGER NOT NULL REFERENCES materials(id),
        vendor_id    INTEGER NOT NULL
      );
    `);

    const oldCmyk = await db
      .select()
      .from(materialsTable)
      .where(eq(materialsTable.subType, "cmyk-set"));

    if (oldCmyk.length > 0) {
      const ids = oldCmyk.map(m => m.id);
      await db.delete(materialVendorsTable).where(inArray(materialVendorsTable.materialId, ids));
      await db.delete(materialsTable).where(inArray(materialsTable.id, ids));
      logger.info(`Migration 4: Deleted ${ids.length} CMYK ghost record(s).`);
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
      const survivorId = dupes[dupes.length - 1].id;
      const toDelete = dupes.slice(0, -1).map(d => d.id);
      if (toDelete.length > 0) {
        for (const dupeId of toDelete) {
          await db.execute(sql`UPDATE job_materials    SET material_id = ${survivorId} WHERE material_id = ${dupeId}`);
          await db.execute(sql`UPDATE wastage_log      SET material_id = ${survivorId} WHERE material_id = ${dupeId}`);
          await db.execute(sql`UPDATE stock_inward     SET material_id = ${survivorId} WHERE material_id = ${dupeId}`);
          await db.execute(sql`UPDATE material_batches SET material_id = ${survivorId} WHERE material_id = ${dupeId}`);
          await db.execute(sql`UPDATE jobs             SET material_id = ${survivorId} WHERE material_id = ${dupeId}`);
        }
        await db.delete(materialVendorsTable).where(inArray(materialVendorsTable.materialId, toDelete));
        await db.delete(materialsTable).where(inArray(materialsTable.id, toDelete));
        logger.info(`Migration 4: Removed ${toDelete.length} duplicate(s) of "${row.material_name}" (references repointed to #${survivorId}).`);
      }
    }
    logger.info("Migration 4: Ghost/duplicate cleanup complete.");
  } catch (err) {
    logger.error({ err }, "Migration 4 failed");
  }

  // ─── MIGRATION 5: job_routing pause columns ───────────────────────────
  try {
    await db.execute(sql`
      ALTER TABLE job_routing
        ADD COLUMN IF NOT EXISTS paused_at             TEXT,
        ADD COLUMN IF NOT EXISTS total_paused_seconds  INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS estimated_minutes     INTEGER NOT NULL DEFAULT 0;
    `);
    logger.info("Migration 5: job_routing pause columns ensured.");
  } catch (err) {
    logger.error("Migration 5 failed:", err);
  }

  // ─── MIGRATION 6: job_interruptions table ────────────────────────────
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

  // ─── MIGRATION 7: step_estimates_minutes on job_templates ────────────
  try {
    await db.execute(sql`
      ALTER TABLE job_templates
        ADD COLUMN IF NOT EXISTS step_estimates_minutes INTEGER[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS description TEXT;
    `);
    logger.info("Migration 7: job_templates columns ensured.");
  } catch (err) {
    logger.error("Migration 7 failed:", err);
  }

  // ─── MIGRATION 8: machines description ───────────────────────────────
  try {
    await db.execute(sql`
      ALTER TABLE machines
        ADD COLUMN IF NOT EXISTS description TEXT;
    `);
    logger.info("Migration 8: machines description column ensured.");
  } catch (err) {
    logger.error("Migration 8 failed:", err);
  }

  // ─── MIGRATION 9: jobs routing control fields ─────────────────────────
  try {
    await db.execute(sql`
      ALTER TABLE jobs
        ADD COLUMN IF NOT EXISTS needs_paper_trim  BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS coating_method    TEXT NOT NULL DEFAULT 'inline';
    `);
    logger.info("Migration 9: jobs routing control fields ensured.");
  } catch (err) {
    logger.error("Migration 9 failed:", err);
  }

  // ─── MIGRATION 10: job_routing DAG columns ────────────────────────────
  try {
    await db.execute(sql`
      ALTER TABLE job_routing
        ADD COLUMN IF NOT EXISTS step_code           TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS prerequisite_codes  TEXT[] NOT NULL DEFAULT '{}';
    `);
    logger.info("Migration 10: job_routing DAG columns ensured.");
  } catch (err) {
    logger.error("Migration 10 failed:", err);
  }

  // ─── MIGRATION 1 guard (original machines/templates seed) ────────────
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
          description: "Wohlenberg → Komori LA37 (print + UV) → Bobst DC1 → Bobst Gluer",
          routingSteps: [wohlenberg[0].id, komoriLA[0].id, bobstDC1[0].id, bobstGluer[0].id],
          stepEstimatesMinutes: [30, 120, 60, 90],
        },
        {
          templateName: "Full Finish Box (Varnish)",
          description: "Wohlenberg → Komori GL37 (print + varnish) → Bobst DC1 → Bobst Gluer",
          routingSteps: [wohlenberg[0].id, komoriGL[0].id, bobstDC1[0].id, bobstGluer[0].id],
          stepEstimatesMinutes: [30, 120, 60, 90],
        },
        {
          templateName: "Print Only",
          description: "Print only: Komori GL37 or LA37",
          routingSteps: [komoriGL[0].id],
          stepEstimatesMinutes: [120],
        },
        {
          templateName: "Print + Standalone Coat",
          description: "Single Coater → Bobst DC1",
          routingSteps: [singleCoater[0].id, bobstDC1[0].id],
          stepEstimatesMinutes: [90, 60],
        },
        {
          templateName: "Non Woven",
          description: "Planeta → Bobst DC1",
          routingSteps: [planeta[0].id, bobstDC1[0].id],
          stepEstimatesMinutes: [120, 60],
        },
      ]);
    }
  });

  logger.info("Production migration 1 complete.");
}
