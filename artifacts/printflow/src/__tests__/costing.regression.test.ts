import { describe, it, expect } from "vitest";
import { compute } from "@/pages/costing";
import type { CostForm } from "@/pages/costing";

/* THE REGRESSION CASE.
   This is the number the plant owner judges the software by. It was validated
   against a real quote from Prakash Industries and is recorded in DOMAIN-RULES.md.

   Job: 25,000 mono cartons · 4 colour CMYK (1 spot converted, no extra plate)
        · aqueous coating · 8-up on a 23x36 in sheet · 300 GSM at Rs 85/kg
   Expected: Rs 93,639 pre-GST  (= Rs 3,746 per 1,000 cartons)
   Tolerance: +/- 1%

   If this test fails, do not adjust the expected value to make it pass.
   Find out what changed. Costing drift is invisible in the UI and expensive
   in the market — every quote leaves the building with this number in it. */

const PHARMA_PRE_GST = 93639;
const TOLERANCE = 0.01;

const pharmaForm: CostForm = {
  jobName: "Pharma carton — regression case",
  clientName: "REGRESSION",
  linkedJobId: "",
  jobKind: "carton_dims",
  qtyBasis: "pieces",
  qtyRequired: "25000",
  cartonUnit: "cm",
  sheetUnit: "cm",
  cartonLengthMm: "10",
  cartonWidthMm: "8",
  cartonHeightMm: "4",
  cartonStyle: "straight_tuck",
  upsPerSheet: "8",
  materialId: "",
  sheetLengthIn: "58.42",   // 23 in
  sheetBreadthIn: "91.44",  // 36 in
  gsm: "300",
  ratePerKg: "85",
  processColors: "4",
  spotColors: "1",
  spotHandling: "convert_cmyk",
  printPassCount: "1",
  printsBothSides: false,
  backColors: "0",
  coatingType: "aqueous",
  isNewDie: false,
  dieFabCost: "0",
  selectedMachineId: "",
  selectedDieCutterId: "",
  selectedGluerId: "",
  handworkPer1000: "250",
  runningWastePct: "3",
} as CostForm;

describe("costing — pharma regression case", () => {
  const c = compute(pharmaForm, null, null, null);

  it("lands within 1% of the validated Rs 93,639 pre-GST", () => {
    const low = PHARMA_PRE_GST * (1 - TOLERANCE);
    const high = PHARMA_PRE_GST * (1 + TOLERANCE);
    expect(c.preGst).toBeGreaterThanOrEqual(low);
    expect(c.preGst).toBeLessThanOrEqual(high);
  });

  it("charges one plate per colour per side plus one for coating, not colours x passes", () => {
    // 4 process (1 spot converted into CMYK) + 0 back + 1 aqueous = 5.
    // The old formula was colours x passes, which over-billed every multi-pass job.
    expect(c.plateCnt).toBe(5);
  });

  it("treats a converted spot colour as needing no extra plate or pass", () => {
    expect(c.spotConverted).toBe(true);
    expect(c.effTotalC).toBe(4);
    expect(c.passes).toBe(1);
  });

  it("reports a per-1000 rate consistent with the total", () => {
    expect(c.per1kRate).toBeCloseTo((c.preGst / 25000) * 1000, 2);
  });
});

describe("costing — double-sided work", () => {
  it("adds a pass and back-side plates, since neither Komori perfects", () => {
    const bothSides = { ...pharmaForm, printsBothSides: true, backColors: "1" } as CostForm;
    const c = compute(bothSides, null, null, null);
    expect(c.passes).toBe(2);          // front pass + back pass
    expect(c.plateCnt).toBe(6);        // 4 front + 1 back + 1 coating
    expect(c.preGst).toBeGreaterThan(PHARMA_PRE_GST);
  });
});
