import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface InkCoveragePreset {
  cmykKg: number;
  spotKg: number;
}

export interface InkCoverage {
  preset: string;
  light: InkCoveragePreset;
  medium: InkCoveragePreset;
  heavy: InkCoveragePreset;
}

export interface FinishingRate {
  rate: number;
  unit: string;
}

export interface CostingSettingsMap {
  ink_coverage: InkCoverage;
  makeready_bases: { lt5c: number; ge5c: number };
  die_setup_waste_sheets: { existing: number; new_die: number };
  gluer_setup_waste_cartons: { value: number };
  glue_grams: Record<string, number>;
  glue_rate_per_kg: { value: number };
  finishing_rates: Record<string, FinishingRate>;
  freight_packing_default: { value: number };
}

export const COSTING_SETTINGS_DEFAULTS: CostingSettingsMap = {
  ink_coverage: {
    preset: "medium",
    light:  { cmykKg: 0.28, spotKg: 0.48 },
    medium: { cmykKg: 0.35, spotKg: 0.60 },
    heavy:  { cmykKg: 0.45, spotKg: 0.75 },
  },
  makeready_bases: { lt5c: 400, ge5c: 500 },
  die_setup_waste_sheets: { existing: 50, new_die: 150 },
  gluer_setup_waste_cartons: { value: 100 },
  glue_grams: {
    straight_tuck: 0.4,
    reverse_tuck:  0.5,
    auto_bottom:   0.7,
    crash_lock:    0.6,
  },
  glue_rate_per_kg: { value: 150 },
  finishing_rates: {
    lamination_bopp_gloss: { rate: 18,   unit: "sqm" },
    lamination_bopp_matt:  { rate: 16,   unit: "sqm" },
    foil_stamping:         { rate: 8,    unit: "sqm" },
    embossing:             { rate: 12,   unit: "sqm" },
    spot_uv:               { rate: 14,   unit: "sqm" },
    window_patching:       { rate: 0.80, unit: "per_carton" },
  },
  freight_packing_default: { value: 0 },
};

export function useCostingSettings() {
  return useQuery<CostingSettingsMap>({
    queryKey: ["/api/costing-settings"],
    queryFn: async () => {
      const raw = await customFetch<Record<string, unknown>>("/api/costing-settings", { method: "GET" });
      return { ...COSTING_SETTINGS_DEFAULTS, ...raw } as CostingSettingsMap;
    },
    staleTime: 60_000,
  });
}

export function useUpdateCostingSetting() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { key: string; value: unknown }>({
    mutationFn: ({ key, value }) =>
      customFetch(`/api/costing-settings/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/costing-settings"] });
    },
  });
}
