import { useEffect, useMemo, useState } from "react";
import { categories, lots as demoLots, vendorColours, type Category, type Lot } from "./printflow-store.data";
import "./printflow-store.css";
// Real vendors won't match the demo palette, so fall back to a stable colour
// hashed from the vendor key — same vendor always gets the same colour.
const PALETTE = ["#d4664d","#3a8d8a","#d5a642","#8b7254","#687fb7","#a26f98","#5b9e6f","#c15b7f"];
function vColour(key: string): string {
  if ((vendorColours as Record<string,string>)[key]) return (vendorColours as Record<string,string>)[key];
  let h = 0; for (let i=0;i<key.length;i++) h = (h*31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}


const formatNumber = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const formatMoney = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function getDays(lot: Lot) {
  if (lot.heldFor || !lot.ratePerDay) return null;
  return Math.max(0, Math.floor(lot.qty / lot.ratePerDay));
}

function getUrgency(lot: Lot) {
  if (lot.heldFor) return "held";
  const days = getDays(lot);
  if (days === null) return "unknown";
  if (days <= 7) return "red";
  if (days <= 21) return "amber";
  return "green";
}

function lotSort(a: Lot, b: Lot) {
  if (a.heldFor && !b.heldFor) return 1;
  if (!a.heldFor && b.heldFor) return -1;
  const aDays = getDays(a);
  const bDays = getDays(b);
  if (aDays === null && bDays !== null) return 1;
  if (aDays !== null && bDays === null) return -1;
  return (aDays ?? 9999) - (bDays ?? 9999);
}

function LotVisual({ lot, maxFull }: { lot: Lot; maxFull: number }) {
  const ghostHeight = Math.round(118 + Math.sqrt(lot.full / maxFull) * 98);
  const ratio = Math.min(1, Math.max(0.05, lot.qty / lot.full));
  const solidHeight = Math.max(lot.category === "paper" ? 14 : 34, Math.round(ghostHeight * ratio));

  return (
    <div className={`lot-visual lot-visual--${lot.category}`} style={{ height: ghostHeight + 27 }} aria-hidden="true">
      <div className={`full-ghost full-ghost--${lot.category}`} style={{ height: ghostHeight }}><span>FULL</span></div>
      <div
        className={`stock-shape stock-shape--${lot.category} ${lot.heldFor ? "stock-shape--held" : ""}`}
        style={{
          height: solidHeight,
          ["--vendor-colour" as string]: vColour(lot.vendorKey),
          ["--product-colour" as string]: lot.colour ?? "#ece2c8",
        }}
      >
        {lot.category === "paper" ? (
          <>
            <div className="mill-band"><span>{lot.brand}</span></div>
            {lot.heldFor && <i className="reserve-strap reserve-strap--one" />}
            {lot.heldFor && <i className="reserve-strap reserve-strap--two" />}
          </>
        ) : (
          <>
            <div className="container-lid" />
            <div className="container-label"><strong>{lot.brand}</strong><span>{lot.shortProduct}</span></div>
            {lot.heldFor && <i className="reserve-seal">HELD</i>}
          </>
        )}
      </div>
      <div className={`base base--${lot.category}`}>
        {lot.category === "paper" ? <><span /><span /><span /></> : <span />}
      </div>
    </div>
  );
}

function LotCard({ lot, maxFull, onSelect }: { lot: Lot; maxFull: number; onSelect: (lot: Lot) => void }) {
  const days = getDays(lot);
  const urgency = getUrgency(lot);
  const percent = Math.round((lot.qty / lot.full) * 100);
  const ariaLabel = [
    lot.product,
    lot.vendor,
    `${formatNumber.format(lot.qty)} of ${formatNumber.format(lot.full)} ${lot.unit}`,
    lot.heldFor ? `held for ${lot.heldFor}` : days === null ? "consumption history building" : `${days} days left`,
  ].join(", ");

  return (
    <button className={`lot-card lot-card--${urgency}`} onClick={() => onSelect(lot)} aria-label={ariaLabel}>
      <div className={`days-tag days-tag--${urgency}`}>
        <span className="status-dot" />
        {lot.heldFor ? "HELD" : days === null ? "HISTORY BUILDING" : `${days} DAYS LEFT`}
      </div>
      <LotVisual lot={lot} maxFull={maxFull} />
      <div className="lot-caption">
        <div className="quantity-line"><strong>{formatNumber.format(lot.qty)}</strong><span>{lot.unit}</span></div>
        <div className="product-line" title={lot.product}>{lot.product}</div>
        <div className="vendor-line"><i style={{ background: vColour(lot.vendorKey) }} />{lot.vendor} · {lot.brand}</div>
        <div className="detail-line">
          <span>{lot.size ?? lot.id}</span>
          <span>₹{formatMoney.format(lot.price)}/{lot.unit === "sheets" ? "kg" : lot.unit}</span>
        </div>
        <div className="fill-line"><b>{percent}%</b> of {formatNumber.format(lot.full)} full</div>
        {lot.heldFor && <div className="held-line"><span className="lock-mark" />Held for {lot.heldFor}</div>}
      </div>
    </button>
  );
}

function LotDialog({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const [step, setStep] = useState<"detail" | "confirm" | "done">("detail");
  const days = getDays(lot);
  const urgency = getUrgency(lot);
  const percent = Math.round((lot.qty / lot.full) * 100);
  const issued = Math.max(0, lot.full - lot.qty);
  /* Only facts. The demo build invented dated movements ("Today, 11:20") which
     would show the owner history that never happened. Show the receipt, and the
     issued total as one honest line, until the movement ledger is wired. */
  const movementRows: string[][] = [];
  if (issued > 0) {
    movementRows.push(["—", "Issued to production", `−${formatNumber.format(issued)}`, formatNumber.format(lot.qty)]);
  }
  movementRows.push([
    lot.receivedDate || "—",
    lot.invoice ? `Received · ${lot.invoice}` : "Received",
    `+${formatNumber.format(lot.full)}`,
    formatNumber.format(lot.full),
  ]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="lot-dialog-title">
        <header className="dialog-header">
          <div>
            <div className="eyebrow">LOT {lot.id} · {lot.vendor} → {lot.brand}</div>
            <h2 id="lot-dialog-title">{lot.product}</h2>
            <p>{lot.size ? `${lot.size} · ` : ""}Received {lot.receivedDate} on {lot.invoice}</p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close lot detail">×</button>
        </header>

        {step === "detail" && (
          <div className="dialog-body">
            <div className="lot-summary">
              <div className="summary-gauge" style={{ ["--gauge" as string]: `${percent}%`, ["--vendor-colour" as string]: vColour(lot.vendorKey) }}><span>{percent}%</span></div>
              <div><span>Available</span><strong>{formatNumber.format(lot.qty)} {lot.unit}</strong></div>
              <div><span>Received full</span><strong>{formatNumber.format(lot.full)} {lot.unit}</strong></div>
              <div><span>Lot rate</span><strong>₹{formatMoney.format(lot.price)}/{lot.unit === "sheets" ? "kg" : lot.unit}</strong></div>
              <div><span>Cover</span><strong className={`summary-status summary-status--${urgency}`}>{lot.heldFor ? "Held" : days === null ? "Learning" : `${days} days`}</strong></div>
            </div>

            {lot.heldFor && (
              <div className="reservation-note">
                <div className="reservation-icon"><span className="lock-mark" /></div>
                <div><strong>Reserved for {lot.heldFor}</strong><span>This lot is usable, but the consequence must be acknowledged.</span></div>
              </div>
            )}

            <div className="dialog-columns">
              <div className="movement-panel">
                <div className="section-title"><span>Movement history</span><small>Newest first</small></div>
                <div className="movement-list">
                  {movementRows.map((movement, index) => (
                    <div className="movement-row" key={`${movement[0]}-${index}`}>
                      <time>{movement[0]}</time><span>{movement[1]}</span><b>{movement[2]}</b><strong>{movement[3]}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <aside className="jobs-panel">
                <div className="section-title"><span>Consumed by</span></div>
                {(lot.jobs ?? []).map((job) => <div className="job-chip" key={job}>{job}</div>)}
                <div className="cost-note"><span>Costing uses this lot’s rate</span><strong>₹{formatMoney.format(lot.price)}</strong><small>Not the blended material average</small></div>
              </aside>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="consequence-panel">
            <div className="consequence-mark">!</div>
            <div className="eyebrow">VISIBLE CONSEQUENCE · NOT A HARD BLOCK</div>
            <h3>{lot.heldFor} will go short.</h3>
            <p>If you take from this lot, the reserved job will be short by approximately <strong>{formatNumber.format(lot.heldShortBy ?? 0)} {lot.unit}</strong>. Continue only if its stock has been moved or the plan has changed.</p>
            <div className="consequence-facts"><span>Available now <b>{formatNumber.format(lot.qty)} {lot.unit}</b></span><span>Protected job <b>{lot.heldFor}</b></span></div>
          </div>
        )}

        {step === "done" && (
          <div className="done-panel">
            <div className="done-check">✓</div><div className="eyebrow">DECISION RECORDED</div>
            <h3>{lot.heldFor ? "Reserved stock released with consequence." : "This lot is ready to issue."}</h3>
            <p>{lot.heldFor ? `${lot.heldFor} is now flagged for the supervisor before planning.` : `Lot ${lot.id} remains selected for the issue entry.`}</p>
          </div>
        )}

        <footer className="dialog-footer">
          {step === "detail" && <><button className="button button--quiet" onClick={onClose}>Close</button><button className={`button ${lot.heldFor ? "button--warning" : "button--primary"}`} onClick={() => setStep(lot.heldFor ? "confirm" : "done")}>{lot.heldFor ? "Use held stock" : "Issue from this lot"}</button></>}
          {step === "confirm" && <><button className="button button--quiet" onClick={() => setStep("detail")}>Go back</button><button className="button button--danger" onClick={() => setStep("done")}>Use anyway · record consequence</button></>}
          {step === "done" && <button className="button button--primary" onClick={onClose}>Done</button>}
        </footer>
      </section>
    </div>
  );
}

export default function PrintFlowStore({ lots: lotsProp, onRecordInward }: { lots?: Lot[]; onRecordInward?: () => void } = {}) {
  const lots = lotsProp ?? demoLots;
  const [category, setCategory] = useState<Category>("paper");
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const activeLots = useMemo(() => lots.filter((lot) => lot.category === category).sort(lotSort), [category]);
  const maxFull = Math.max(...activeLots.map((lot) => lot.full));
  const runningLow = activeLots.filter((lot) => { const days = getDays(lot); return days !== null && days < 7; });
  const activeCategory = categories.find((item) => item.id === category)!;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block"><div className="brand-mark"><span>P</span><span>F</span></div><div><strong>PRINTFLOW</strong><small>Prakash Industries · Kanpur</small></div></div>
        <div className="screen-title"><span>STORE / स्टोर</span><h1>Choose the lot you’ll actually take.</h1></div>
        <div className={`low-stock-banner ${runningLow.length ? "low-stock-banner--active" : ""}`}>
          <span className="beacon" /><div><small>{runningLow.length ? "RUNNING OUT FIRST" : "NO LOT UNDER 7 DAYS"}</small><strong>{runningLow.length ? runningLow.map((lot) => `${lot.shortProduct} · ${getDays(lot)} days`).join("  ·  ") : "Store cover is stable"}</strong></div>
        </div>
        {/* Was a hardcoded fake user. The pilot needs a way to RECORD stock,
            not a decorative avatar — this is the primary action on this screen. */}
        <button className="user-block" onClick={onRecordInward} aria-label="Record stock inward">
          <span>+</span><div><strong>Record</strong><small>stock inward</small></div>
        </button>
      </header>

      <nav className="category-tabs" role="tablist" aria-label="Material categories">
        {categories.map((item) => (
          <button role="tab" aria-selected={category === item.id} className={category === item.id ? "category-tab category-tab--active" : "category-tab"} key={item.id} onClick={() => setCategory(item.id)}>
            <span>{item.label}</span><small>{item.hindi}</small>
          </button>
        ))}
        <div className="tab-context"><span className="outline-key" /><span>Dashed line = full delivery</span><b>{activeLots.length} physical lots</b></div>
      </nav>

      <section className={`store-floor store-floor--${category}`} role="tabpanel" aria-label={`${activeCategory.label} lots`}>
        <div className="overhead overhead--left" /><div className="overhead overhead--right" />
        <div className="floor-heading">
          <div><span className="floor-kicker">{activeCategory.hindi} · MOST URGENT ON THE LEFT</span><h2>{activeCategory.label}</h2></div>
          <p><span className="solid-key" />What is left <i /> <span className="outline-key" />What arrived</p>
        </div>
        <div className={`lots-row lots-row--${activeLots.length}`}>
          {activeLots.map((lot) => <LotCard key={lot.id} lot={lot} maxFull={maxFull} onSelect={setSelectedLot} />)}
        </div>
        <div className="floor-line"><span>STORE FLOOR · LOTS SORTED BY DAYS OF COVER</span></div>
      </section>

      <footer className="statusbar"><span>Stock ledger synced 2 min ago</span><span><b>Tip:</b> tap a physical lot to see its invoice, jobs and movement trail</span><span>21 Aug 2026 · Shift A</span></footer>
      {selectedLot && <LotDialog lot={selectedLot} onClose={() => setSelectedLot(null)} />}
    </main>
  );
}
