import { createHash } from "node:crypto";

// The route's maxDuration must remain a literal for Next.js static analysis.
export const SUBMISSION_BUDGET = {
  runtimeMs: 120000,
  responseMs: 110000,
  bodyMs: 5000,
  lookupMs: 5000,
  syncMs: 80000,
  attemptMs: 40000,
  persistenceReserveMs: 25000,
  saveMs: 5000,
  settingsMs: 5000,
  orderMs: 5000,
  activityMs: 1000,
} as const;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function submissionHash(body: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex");
}

/** Namespaced UUID using existing PK constraints; never derive identity from customer data. */
export function submissionResourceId(tenantId: string, submissionId: string, kind: "profile" | "lite-order") {
  const hash = createHash("sha256").update(JSON.stringify(["submission-v1", tenantId, submissionId, kind])).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
