export type Category = "paper" | "inks" | "coatings" | "chemicals";
export type Unit = "sheets" | "kg" | "L";
export type VendorKey = "bahl" | "khanna" | "satguru" | "todi" | "united" | "pamar";

export type Lot = {
  id: string;
  category: Category;
  vendor: string;
  vendorKey: string;
  brand: string;
  product: string;
  shortProduct: string;
  size?: string;
  qty: number;
  unit: Unit;
  full: number;
  ratePerDay?: number;
  heldFor?: string;
  heldShortBy?: number;
  receivedDate: string;
  price: number;
  invoice: string;
  colour?: string;
  jobs: string[];
};

export const vendorColours: Record<VendorKey, string> = {
  bahl: "#d4664d",
  khanna: "#3a8d8a",
  satguru: "#d5a642",
  todi: "#8b7254",
  united: "#687fb7",
  pamar: "#a26f98",
};

export const categories: { id: Category; label: string; hindi: string }[] = [
  { id: "paper", label: "Paper & Board", hindi: "कागज़" },
  { id: "inks", label: "Inks", hindi: "स्याही" },
  { id: "coatings", label: "Coatings", hindi: "कोटिंग" },
  { id: "chemicals", label: "Chemicals & Glue", hindi: "केमिकल व गोंद" },
];

export const lots: Lot[] = [
  {
    id: "PB-2411-07", category: "paper", vendor: "Bahl Paper", vendorKey: "bahl", brand: "ITC",
    product: "Cyber XL 300gsm", shortProduct: "Cyber XL", size: "22×28 in", qty: 450, unit: "sheets",
    full: 2800, ratePerDay: 82, receivedDate: "14 Aug 2026", price: 88.4, invoice: "BP/26-27/1184",
    jobs: ["Rajkamal Monocartons · RK-822", "Kanha Foods · KF-330"],
  },
  {
    id: "PB-2407-12", category: "paper", vendor: "Khanna Paper", vendorKey: "khanna", brand: "JK",
    product: "White Back 285gsm", shortProduct: "White Back", size: "23×36 in", qty: 820, unit: "sheets",
    full: 3200, ratePerDay: 62, receivedDate: "29 Jul 2026", price: 86.2, invoice: "KP/4481/26",
    jobs: ["Sacred Select · SS-092", "Tiranga Regular · TR-190"],
  },
  {
    id: "PB-2410-03", category: "paper", vendor: "Satguru Papers", vendorKey: "satguru", brand: "JK",
    product: "Folding Box 250gsm", shortProduct: "Folding Box", size: "23×36 in", qty: 980, unit: "sheets",
    full: 3000, ratePerDay: 47, receivedDate: "08 Aug 2026", price: 82.75, invoice: "SP/9088/26",
    jobs: ["Prabhu Darshan · PD-411", "Loose issue · Store"],
  },
  {
    id: "PB-2414-06", category: "paper", vendor: "Bahl Paper", vendorKey: "bahl", brand: "ITC",
    product: "Safire Graphik 250gsm", shortProduct: "Safire", size: "20×30 in", qty: 1640, unit: "sheets",
    full: 2600, ratePerDay: 48, receivedDate: "16 Aug 2026", price: 91.1, invoice: "BP/26-27/1211",
    jobs: ["Aayna Jewellery · AY-014", "Rajkamal Monocartons · RK-816"],
  },
  {
    id: "PB-2418-02", category: "paper", vendor: "Todi Paper", vendorKey: "todi", brand: "Century",
    product: "Grey Back 350gsm", shortProduct: "Grey Back", size: "23×36 in", qty: 1720, unit: "sheets",
    full: 2200, ratePerDay: 27, receivedDate: "19 Aug 2026", price: 74.6, invoice: "TP/611/26",
    jobs: ["General stock", "VKC Pharma · VK-221"],
  },
  {
    id: "PB-2420-01", category: "paper", vendor: "Khanna Paper", vendorKey: "khanna", brand: "West Coast",
    product: "White Back 285gsm", shortProduct: "White Back", size: "25×36 in", qty: 2000, unit: "sheets",
    full: 2000, receivedDate: "20 Aug 2026", price: 84.9, invoice: "KP/4620/26", jobs: ["No issues yet"],
  },
  {
    id: "PB-2305-09", category: "paper", vendor: "Khanna Paper", vendorKey: "khanna", brand: "JK",
    product: "White Back 285gsm", shortProduct: "White Back", size: "23×36 in", qty: 2400, unit: "sheets",
    full: 2400, heldFor: "Tiranga PF-0142", heldShortBy: 620, receivedDate: "24 May 2026", price: 86.2,
    invoice: "KP/3902/26", jobs: ["Tiranga PF-0142 · reserved in full"],
  },
  {
    id: "IN-2412-03", category: "inks", vendor: "Satguru", vendorKey: "satguru", brand: "Huber",
    product: "Turbo Chrome Black", shortProduct: "Turbo Black", qty: 12, unit: "kg", full: 60, ratePerDay: 4,
    receivedDate: "11 Aug 2026", price: 415, invoice: "SG/INK/901", colour: "#191a1a",
    jobs: ["Non-woven run · NW-119", "General low-value work"],
  },
  {
    id: "IN-2409-11", category: "inks", vendor: "Satguru", vendorKey: "satguru", brand: "Huber",
    product: "Prime Plus Cyan", shortProduct: "Prime Cyan", qty: 18, unit: "kg", full: 60, ratePerDay: 1.7,
    receivedDate: "09 Aug 2026", price: 640, invoice: "SG/INK/877", colour: "#1896b5",
    jobs: ["Sacred Select · SS-092", "Aayna Jewellery · AY-014"],
  },
  {
    id: "IN-2410-02", category: "inks", vendor: "Satguru", vendorKey: "satguru", brand: "Huber",
    product: "Prime Plus Magenta", shortProduct: "Prime Magenta", qty: 28, unit: "kg", full: 60, ratePerDay: 1.2,
    receivedDate: "10 Aug 2026", price: 640, invoice: "SG/INK/881", colour: "#c03468",
    jobs: ["Sacred Select · SS-092", "Rocco’s Gelato · RG-031"],
  },
  {
    id: "IN-2416-08", category: "inks", vendor: "United Inks", vendorKey: "united", brand: "DIC",
    product: "Sheetfed Process Yellow", shortProduct: "Process Yellow", qty: 44, unit: "kg", full: 60,
    ratePerDay: 1.1, receivedDate: "17 Aug 2026", price: 598, invoice: "UI/DIC/2608", colour: "#e8be34",
    jobs: ["General quality work", "Sacred Select · SS-092"],
  },
  {
    id: "IN-2420-04", category: "inks", vendor: "Pamar", vendorKey: "pamar", brand: "Toyo",
    product: "Opaque White Extra", shortProduct: "Opaque White", qty: 50, unit: "kg", full: 50,
    receivedDate: "20 Aug 2026", price: 720, invoice: "PM/TOYO/331", colour: "#e9e6db", jobs: ["No issues yet"],
  },
  {
    id: "IN-2318-01", category: "inks", vendor: "Satguru", vendorKey: "satguru", brand: "Huber",
    product: "Pantone 7621 C", shortProduct: "Pantone 7621", qty: 22, unit: "kg", full: 25,
    heldFor: "Aayna AY-014", heldShortBy: 8, receivedDate: "18 Jul 2026", price: 875, invoice: "SG/SPOT/819",
    colour: "#8c2735", jobs: ["Aayna Jewellery · AY-014 · reserved"],
  },
  {
    id: "CO-2410-05", category: "coatings", vendor: "United Inks", vendorKey: "united", brand: "Sakata",
    product: "Gloss AQ Coating", shortProduct: "Gloss AQ", qty: 38, unit: "kg", full: 120, ratePerDay: 7,
    receivedDate: "10 Aug 2026", price: 182, invoice: "UI/SAK/2588", colour: "#e9e1bd",
    jobs: ["Sacred Select · SS-092", "Rajkamal · RK-822"],
  },
  {
    id: "CO-2413-04", category: "coatings", vendor: "Satguru", vendorKey: "satguru", brand: "Huber",
    product: "Matt AQ Coating", shortProduct: "Matt AQ", qty: 64, unit: "kg", full: 120, ratePerDay: 5.2,
    receivedDate: "13 Aug 2026", price: 198, invoice: "SG/COAT/899", colour: "#c9c7bf", jobs: ["Rocco’s Gelato · RG-031"],
  },
  {
    id: "CO-2419-02", category: "coatings", vendor: "Pamar", vendorKey: "pamar", brand: "Actega",
    product: "High Rub Gloss", shortProduct: "High Rub", qty: 96, unit: "kg", full: 120, ratePerDay: 3.1,
    receivedDate: "19 Aug 2026", price: 236, invoice: "PM/ACT/339", colour: "#dbcda4", jobs: ["Premium cartons"],
  },
  {
    id: "CO-2420-01", category: "coatings", vendor: "United Inks", vendorKey: "united", brand: "Sakata",
    product: "Food-Safe Barrier Coat", shortProduct: "Barrier Coat", qty: 80, unit: "kg", full: 80,
    receivedDate: "20 Aug 2026", price: 310, invoice: "UI/SAK/2612", colour: "#dfe7df", jobs: ["No issues yet"],
  },
  {
    id: "CO-2302-06", category: "coatings", vendor: "Pamar", vendorKey: "pamar", brand: "Actega",
    product: "Soft Touch Coating", shortProduct: "Soft Touch", qty: 74, unit: "kg", full: 80,
    heldFor: "Rocco’s RG-031", heldShortBy: 20, receivedDate: "02 Jun 2026", price: 425, invoice: "PM/ACT/281",
    colour: "#e6d4c4", jobs: ["Rocco’s Gelato · RG-031 · reserved"],
  },
  {
    id: "CH-2408-03", category: "chemicals", vendor: "Todi Paper", vendorKey: "todi", brand: "Varn",
    product: "Press Wash 40", shortProduct: "Press Wash", qty: 18, unit: "L", full: 100, ratePerDay: 4.4,
    receivedDate: "08 Aug 2026", price: 168, invoice: "TP/CH/590", colour: "#7f9eaa", jobs: ["General press consumption"],
  },
  {
    id: "CH-2411-08", category: "chemicals", vendor: "Satguru", vendorKey: "satguru", brand: "Technova",
    product: "Fountain Solution AF", shortProduct: "Fountain AF", qty: 32, unit: "L", full: 100, ratePerDay: 3.2,
    receivedDate: "11 Aug 2026", price: 225, invoice: "SG/CH/903", colour: "#6ca5a0", jobs: ["General press consumption"],
  },
  {
    id: "CH-2415-05", category: "chemicals", vendor: "United Inks", vendorKey: "united", brand: "Henkel",
    product: "Lamination Adhesive 728", shortProduct: "Lam. Adhesive", qty: 68, unit: "kg", full: 150, ratePerDay: 3.8,
    receivedDate: "15 Aug 2026", price: 198, invoice: "UI/HEN/2598", colour: "#d1b676",
    jobs: ["Rajkamal · RK-822", "Kanha Foods · KF-330"],
  },
  {
    id: "CH-2419-10", category: "chemicals", vendor: "Pamar", vendorKey: "pamar", brand: "Fujifilm",
    product: "Plate Cleaner Plus", shortProduct: "Plate Cleaner", qty: 40, unit: "L", full: 50, ratePerDay: 1.1,
    receivedDate: "19 Aug 2026", price: 340, invoice: "PM/FJ/342", colour: "#7896a8", jobs: ["CTP and press floor"],
  },
  {
    id: "CH-2420-09", category: "chemicals", vendor: "Khanna Paper", vendorKey: "khanna", brand: "Pidilite",
    product: "Carton Side-Seam Glue", shortProduct: "Side-Seam Glue", qty: 100, unit: "kg", full: 100,
    receivedDate: "20 Aug 2026", price: 156, invoice: "KP/ADH/4633", colour: "#e0c895", jobs: ["No issues yet"],
  },
  {
    id: "CH-2308-02", category: "chemicals", vendor: "United Inks", vendorKey: "united", brand: "Henkel",
    product: "Food-Grade Lamination Adhesive", shortProduct: "Food-Grade Glue", qty: 92, unit: "kg", full: 100,
    heldFor: "Kanha Foods KF-330", heldShortBy: 24, receivedDate: "08 Jul 2026", price: 265, invoice: "UI/HEN/2410",
    colour: "#d9c788", jobs: ["Kanha Foods · KF-330 · reserved"],
  },
];
