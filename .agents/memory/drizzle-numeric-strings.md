---
name: Drizzle numeric coercion
description: Drizzle ORM numeric/decimal columns return strings at runtime
---

- **Rule:** Drizzle ORM returns Postgres `numeric`/`decimal` columns as JS strings, not numbers. Always coerce with `Number(x || 0)` before arithmetic or `.toFixed()`.
- **Why:** Caused a widespread `TypeError: e.toFixed is not a function` crash across many frontend pages (layout, inventory, costing, jobs, reports) that had to be fixed in bulk.
- **How to apply:** Any new frontend code consuming API values that originate from numeric DB columns (rates, quantities, costs, percentages) must wrap them in `Number()` before math or formatting.
