import React from "react";
import { cn } from "@/lib/utils";
import { DIM_UNITS, type DimUnit } from "@/lib/units";

/* Compact cm / mm / in switcher that sits beside a dimension group.
   Purely a display-layer control — the form keeps canonical values. */
export function UnitSelect({
  value,
  onChange,
  className,
}: {
  value: DimUnit;
  onChange: (u: DimUnit) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-border overflow-hidden shrink-0", className)}>
      {DIM_UNITS.map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          aria-pressed={value === u}
          className={cn(
            "px-2 py-0.5 text-[11px] font-bold transition-colors",
            value === u
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {u}
        </button>
      ))}
    </div>
  );
}
