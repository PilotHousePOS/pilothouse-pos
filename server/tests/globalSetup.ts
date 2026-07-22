/**
 * Vitest global setup — runs once before any test file is loaded.
 * Ensures all schema columns exist so tests never fail on a fresh DB.
 */
import { applyMissingColumns } from "../scripts/apply-missing-columns";

export async function setup() {
  await applyMissingColumns();
}
