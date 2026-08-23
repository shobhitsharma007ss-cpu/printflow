import { useQuery } from "@tanstack/react-query";
import type { Lot } from "@/pages/store/printflow-store.data";

const API = import.meta.env.VITE_API_URL ?? "";

/* Real lots from /store/lots. full + ratePerDay are derived server-side;
   when ratePerDay is absent the UI shows HISTORY BUILDING and no day count. */
export function useStoreLots() {
  return useQuery<Lot[]>({
    queryKey: ["store-lots"],
    queryFn: async () => {
      const r = await fetch(`${API}/api/store/lots`, { credentials: "include" });
      if (!r.ok) throw new Error("Could not load store");
      return r.json();
    },
  });
}
