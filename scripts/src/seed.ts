import { eq } from "drizzle-orm";
import { db, vendorsTable, materialsTable, materialVendorsTable, machinesTable, jobTemplatesTable, jobsTable, jobRoutingTable, jobMaterialsTable, wastageLogTable } from "@workspace/db";

async function seed() {
  console.log("Seeding database...");

  // Clear existing data
  await db.delete(jobMaterialsTable);
  await db.delete(jobRoutingTable);
  await db.delete(jobsTable);
  await db.delete(jobTemplatesTable);
  await db.delete(materialVendorsTable);
  await db.delete(machinesTable);
  await db.delete(materialsTable);
  await db.delete(vendorsTable);

  // Vendors
  const [khanna, emami, bilt, star, saini] = await db.insert(vendorsTable).values([
    { vendorName: "Khanna Paper", contactPerson: "Rajesh Khanna", phone: "9876543210", city: "Delhi" },
    { vendorName: "Emami Paper", contactPerson: "Arun Emami", phone: "9876543211", city: "Kolkata" },
    { vendorName: "BILT", contactPerson: "Suresh BILT", phone: "9876543212", city: "Mumbai" },
    { vendorName: "Star Paper", contactPerson: "Vinod Star", phone: "9876543213", city: "Ahmedabad" },
    { vendorName: "Saini Traders", contactPerson: "Manoj Saini", phone: "9876543214", city: "Delhi" },
  ]).returning();

  // Materials
  const [
    greyBack285, greyBack350, whiteBack300, fbbBoard350, artCard285,
    maplitho70, cmykInk, uvInk, ledUvInk, varnish, aqueousCoating, gumAdhesive, lubricant,
  ] = await db.insert(materialsTable).values([
    { materialName: "Grey Back Duplex 285gsm", materialType: "board", subType: "grey-back", gsm: 285, unit: "sheets", currentQty: "500", minReorderQty: "100" },
    { materialName: "Grey Back Duplex 350gsm", materialType: "board", subType: "grey-back", gsm: 350, unit: "sheets", currentQty: "300", minReorderQty: "100" },
    { materialName: "White Back Duplex 300gsm", materialType: "board", subType: "white-back", gsm: 300, unit: "sheets", currentQty: "200", minReorderQty: "80" },
    { materialName: "FBB Board 350gsm", materialType: "board", subType: "fbb", gsm: 350, unit: "sheets", currentQty: "150", minReorderQty: "50" },
    { materialName: "Art Card 285gsm", materialType: "paper", subType: "art-card", gsm: 285, unit: "sheets", currentQty: "400", minReorderQty: "100" },
    { materialName: "Maplitho 70gsm", materialType: "paper", subType: "maplitho", gsm: 70, unit: "reams", currentQty: "800", minReorderQty: "200" },
    { materialName: "CMYK Ink Set", materialType: "consumable", subType: "cmyk-ink", unit: "kg", currentQty: "40", minReorderQty: "10" },
    { materialName: "UV Ink", materialType: "consumable", subType: "uv-ink", unit: "kg", currentQty: "15", minReorderQty: "5" },
    { materialName: "LED UV Ink", materialType: "consumable", subType: "led-uv-ink", unit: "kg", currentQty: "10", minReorderQty: "5" },
    { materialName: "Varnish", materialType: "consumable", subType: "varnish", unit: "litre", currentQty: "20", minReorderQty: "8" },
    { materialName: "Aqueous Coating", materialType: "consumable", subType: "aqueous-coating", unit: "litre", currentQty: "25", minReorderQty: "10" },
    { materialName: "Gum/Adhesive", materialType: "consumable", subType: "gum", unit: "kg", currentQty: "30", minReorderQty: "10" },
    { materialName: "Lubricant Oil", materialType: "consumable", subType: "lubricant", unit: "litre", currentQty: "10", minReorderQty: "3" },
  ]).returning();

  // Material-vendor relationships
  await db.insert(materialVendorsTable).values([
    { materialId: greyBack285.id, vendorId: khanna.id },
    { materialId: greyBack285.id, vendorId: emami.id },
    { materialId: greyBack350.id, vendorId: khanna.id },
    { materialId: greyBack350.id, vendorId: bilt.id },
    { materialId: whiteBack300.id, vendorId: emami.id },
    { materialId: fbbBoard350.id, vendorId: bilt.id },
    { materialId: artCard285.id, vendorId: star.id },
    { materialId: maplitho70.id, vendorId: star.id },
    { materialId: cmykInk.id, vendorId: saini.id },
    { materialId: uvInk.id, vendorId: saini.id },
    { materialId: ledUvInk.id, vendorId: saini.id },
    { materialId: varnish.id, vendorId: saini.id },
    { materialId: aqueousCoating.id, vendorId: saini.id },
    { materialId: gumAdhesive.id, vendorId: saini.id },
    { materialId: lubricant.id, vendorId: saini.id },
  ]);

  // Machines
  const [
    komoriLA37, komoriGL37, planetaVariant,
    bobstDC1, bobstDC2, bobstGluer, dgmGluer, hyongJungGluer,
    singleCoater, wohlenberg,
  ] = await db.insert(machinesTable).values([
    { machineName: "Komori LA37", machineCode: "KOM-LA37", machineType: "printing", maxPaperWidth: "25in", maxPaperLength: "37in", speedPerHour: 12000, capabilities: ["uv", "varnish"], status: "idle", operatorName: "Operator 1" },
    { machineName: "Komori GL37", machineCode: "KOM-GL37", machineType: "printing", maxPaperWidth: "25in", maxPaperLength: "37in", speedPerHour: 13000, capabilities: ["uv", "varnish"], status: "running", operatorName: "Operator 2" },
    { machineName: "Planeta Super Variant", machineCode: "PLAN-SV", machineType: "printing", maxPaperWidth: "28in", maxPaperLength: "40in", speedPerHour: 5000, capabilities: ["non-woven"], status: "idle", operatorName: "Operator 3", notes: "Legacy machine" },
    { machineName: "Bobst Die Cutter 1", machineCode: "BOB-DC1", machineType: "cutting", capabilities: [], status: "idle", operatorName: "Operator 4" },
    { machineName: "Bobst Die Cutter 2", machineCode: "BOB-DC2", machineType: "cutting", capabilities: [], status: "maintenance", operatorName: "Operator 5" },
    { machineName: "Bobst Folder Gluer", machineCode: "BOB-FG", machineType: "gluing", capabilities: [], status: "idle", operatorName: "Operator 6" },
    { machineName: "DGM Folder Gluer", machineCode: "DGM-FG", machineType: "gluing", capabilities: [], status: "idle", operatorName: "Operator 7" },
    { machineName: "Hyong Jung Folder Gluer", machineCode: "HJ-FG", machineType: "gluing", capabilities: [], status: "idle", operatorName: "Operator 8" },
    { machineName: "Single Coater", machineCode: "COAT-01", machineType: "coating", capabilities: ["uv", "varnish"], status: "idle", operatorName: "Operator 9" },
    { machineName: "Wohlenberg Cutter", machineCode: "WOHL-01", machineType: "cutting", capabilities: [], status: "idle", operatorName: "Operator 10", notes: "Pre-press cutter" },
  ]).returning();

  // Job Templates
  const [fullFinish, printOnly, printDieCut, printCoatCut, nonWoven] = await db.insert(jobTemplatesTable).values([
    {
      templateName: "Full Finish Box",
      description: "Full finish: Wohlenberg → Komori LA37 → Single Coater → Bobst DC1 → Bobst Gluer",
      routingSteps: [wohlenberg.id, komoriLA37.id, singleCoater.id, bobstDC1.id, bobstGluer.id],
    },
    {
      templateName: "Print Only",
      description: "Print only: Komori GL37",
      routingSteps: [komoriGL37.id],
    },
    {
      templateName: "Print + Die Cut",
      description: "Print and die cut: Komori LA37 → Bobst DC1",
      routingSteps: [komoriLA37.id, bobstDC1.id],
    },
    {
      templateName: "Print + Coat + Cut",
      description: "Print, coat and cut: Komori GL37 → Single Coater → Bobst DC2",
      routingSteps: [komoriGL37.id, singleCoater.id, bobstDC2.id],
    },
    {
      templateName: "Non Woven Job",
      description: "Non-woven: Planeta → Bobst DC1",
      routingSteps: [planetaVariant.id, bobstDC1.id],
    },
  ]).returning();

  // Sample Jobs
  const [job1] = await db.insert(jobsTable).values({
    jobCode: "PF-001",
    jobName: "Tiranga T10 Box",
    clientName: "Tiranga Packaging",
    materialId: greyBack350.id,
    materialGsm: 350,
    qtySheets: 5000,
    plannedSheets: 5200,
    status: "completed",
    templateId: fullFinish.id,
    scheduledDate: "2026-03-20",
  }).returning();

  const [job2] = await db.insert(jobsTable).values({
    jobCode: "PF-002",
    jobName: "Nova Pharma Leaflet",
    clientName: "Nova Pharmaceuticals",
    materialId: maplitho70.id,
    materialGsm: 70,
    qtySheets: 10000,
    plannedSheets: 10200,
    status: "in-progress",
    templateId: printOnly.id,
    scheduledDate: "2026-03-25",
  }).returning();

  const [job3] = await db.insert(jobsTable).values({
    jobCode: "PF-003",
    jobName: "Gupta Packaging Box",
    clientName: "Gupta Industries",
    materialId: artCard285.id,
    materialGsm: 285,
    qtySheets: 3000,
    plannedSheets: 3100,
    status: "pending",
    templateId: printDieCut.id,
    scheduledDate: "2026-03-28",
  }).returning();

  // Job Routing for PF-001
  await db.insert(jobRoutingTable).values([
    { jobId: job1.id, stepNumber: 1, machineId: wohlenberg.id, operatorName: "Operator 10", status: "completed", startedAt: "2026-03-20T08:00:00Z", completedAt: "2026-03-20T10:00:00Z" },
    { jobId: job1.id, stepNumber: 2, machineId: komoriLA37.id, operatorName: "Operator 1", status: "completed", startedAt: "2026-03-20T10:30:00Z", completedAt: "2026-03-20T14:00:00Z" },
    { jobId: job1.id, stepNumber: 3, machineId: singleCoater.id, operatorName: "Operator 9", status: "completed", startedAt: "2026-03-20T14:30:00Z", completedAt: "2026-03-20T16:00:00Z" },
    { jobId: job1.id, stepNumber: 4, machineId: bobstDC1.id, operatorName: "Operator 4", status: "completed", startedAt: "2026-03-20T16:30:00Z", completedAt: "2026-03-20T18:00:00Z" },
    { jobId: job1.id, stepNumber: 5, machineId: bobstGluer.id, operatorName: "Operator 6", status: "completed", startedAt: "2026-03-21T08:00:00Z", completedAt: "2026-03-21T11:00:00Z" },
  ]);

  // Job Routing for PF-002
  await db.insert(jobRoutingTable).values([
    { jobId: job2.id, stepNumber: 1, machineId: komoriGL37.id, operatorName: "Operator 2", status: "in-progress", startedAt: "2026-03-25T08:00:00Z" },
  ]);

  // Job Routing for PF-003
  await db.insert(jobRoutingTable).values([
    { jobId: job3.id, stepNumber: 1, machineId: komoriLA37.id, operatorName: "Operator 1", status: "pending" },
    { jobId: job3.id, stepNumber: 2, machineId: bobstDC1.id, operatorName: "Operator 4", status: "pending" },
  ]);

  // Job Materials
  await db.insert(jobMaterialsTable).values([
    { jobId: job1.id, materialId: greyBack350.id, plannedQty: "5200", actualQty: "5100", unit: "sheets", costPerUnit: "2.50" },
    { jobId: job1.id, materialId: cmykInk.id, plannedQty: "5", actualQty: "4.8", unit: "kg", costPerUnit: "150" },
    { jobId: job1.id, materialId: varnish.id, plannedQty: "3", actualQty: "3.1", unit: "litre", costPerUnit: "80" },
    { jobId: job2.id, materialId: maplitho70.id, plannedQty: "55", actualQty: null, unit: "reams", costPerUnit: "350" },
    { jobId: job2.id, materialId: cmykInk.id, plannedQty: "2", actualQty: null, unit: "kg", costPerUnit: "150" },
    { jobId: job3.id, materialId: artCard285.id, plannedQty: "3100", actualQty: null, unit: "sheets", costPerUnit: "1.80" },
    { jobId: job3.id, materialId: cmykInk.id, plannedQty: "3", actualQty: null, unit: "kg", costPerUnit: "150" },
    { jobId: job3.id, materialId: uvInk.id, plannedQty: "1.5", actualQty: null, unit: "kg", costPerUnit: "280" },
  ]);

  // Wastage Logs for PF-001 (completed job)
  await db.delete(wastageLogTable);
  await db.insert(wastageLogTable).values([
    {
      jobId: job1.id,
      materialId: greyBack350.id,
      plannedQty: "5200",
      actualQty: "5100",
      wastageQty: "100",
      wastagePct: "1.92",
      reason: "setup",
      loggedAt: new Date("2026-03-20T18:00:00Z"),
    },
    {
      jobId: job1.id,
      materialId: cmykInk.id,
      plannedQty: "5.00",
      actualQty: "5.30",
      wastageQty: "0.30",
      wastagePct: "5.66",
      reason: "mis-registration",
      loggedAt: new Date("2026-03-20T18:00:00Z"),
    },
    {
      jobId: job1.id,
      materialId: varnish.id,
      plannedQty: "3.00",
      actualQty: "3.10",
      wastageQty: "0.10",
      wastagePct: "3.23",
      reason: "plate-change",
      loggedAt: new Date("2026-03-21T11:00:00Z"),
    },
    {
      jobId: job2.id,
      materialId: maplitho70.id,
      plannedQty: "55.00",
      actualQty: "60.00",
      wastageQty: "5.00",
      wastagePct: "8.33",
      reason: "client-correction",
      loggedAt: new Date("2026-03-25T12:00:00Z"),
    },
    {
      jobId: job2.id,
      materialId: cmykInk.id,
      plannedQty: "2.00",
      actualQty: "2.50",
      wastageQty: "0.50",
      wastagePct: "20.00",
      reason: "other",
      loggedAt: new Date("2026-03-25T12:00:00Z"),
    },
  ]);

  // Update machine status to running for PF-002 active
  await db.update(machinesTable).set({ status: "running" }).where(
    eq(machinesTable.id, komoriGL37.id)
  );

  console.log("✅ Seed complete!");
  console.log(`  - ${5} vendors`);
  console.log(`  - ${13} materials`);
  console.log(`  - ${10} machines`);
  console.log(`  - ${5} job templates`);
  console.log(`  - 3 sample jobs`);
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
