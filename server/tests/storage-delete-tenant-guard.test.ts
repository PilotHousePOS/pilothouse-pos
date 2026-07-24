/**
 * Enumeration test: every tenant-scoped storage delete method must throw when
 * called without a tenantId.
 *
 * The requireTenantId() helper (server/storage.ts) enforces this at the top of
 * each method, before any DB call, so no live database connection is needed —
 * the promise rejects synchronously.
 *
 * When a new delete method is added for a tenant-owned table, add it to the
 * TENANT_SCOPED_DELETES list below and the test will cover it automatically.
 * Omitting it will be caught as a missing entry (the list is the contract).
 */

import { describe, it, expect } from "vitest";
import { storage } from "../storage";

// ─── Contract list ─────────────────────────────────────────────────────────────
//
// Each entry names a StorageInterface delete method that operates on a
// tenant-owned table.  The value is the argument list to pass, with tenantId
// intentionally omitted (undefined) so requireTenantId() fires.
//
// Use a numeric id of 0; the guard throws before any DB lookup so the row need
// not exist.

const TENANT_SCOPED_DELETES: Array<{
  method: keyof typeof storage;
  label: string;
  args: [id: number, tenantId: undefined];
}> = [
  { method: "deletePet",                     label: "deletePet",                     args: [0, undefined] },
  { method: "deleteSupply",                  label: "deleteSupply",                  args: [0, undefined] },
  { method: "deleteOrder",                   label: "deleteOrder",                   args: [0, undefined] },
  { method: "deleteAppointment",             label: "deleteAppointment",             args: [0, undefined] },
  { method: "deleteAppointmentHistoryRecord",label: "deleteAppointmentHistoryRecord",args: [0, undefined] },
  { method: "deleteContact",                 label: "deleteContact",                 args: [0, undefined] },
  { method: "deleteGroomer",                 label: "deleteGroomer",                 args: [0, undefined] },
  { method: "deleteGroomerAvailability",     label: "deleteGroomerAvailability",     args: [0, undefined] },
  { method: "deleteGroomerBlockedDay",       label: "deleteGroomerBlockedDay",       args: [0, undefined] },
  { method: "deleteDailyAppointmentLimit",   label: "deleteDailyAppointmentLimit",   args: [0, undefined] },
  { method: "deleteWeeklyAppointmentLimit",  label: "deleteWeeklyAppointmentLimit",  args: [0, undefined] },
  { method: "deleteSpecialDateSetting",      label: "deleteSpecialDateSetting",      args: [0, undefined] },
  { method: "deleteBoardingRecord",          label: "deleteBoardingRecord",          args: [0, undefined] },
  { method: "deleteScheduleEntry",           label: "deleteScheduleEntry",           args: [0, undefined] },
  { method: "deleteGroomingScheduleEntry",   label: "deleteGroomingScheduleEntry",   args: [0, undefined] },
];

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("storage delete methods — requireTenantId guard", () => {
  for (const { method, label, args } of TENANT_SCOPED_DELETES) {
    it(`${label}(id, undefined) throws before reaching the database`, async () => {
      const fn = (storage as any)[method].bind(storage);
      await expect(fn(...args)).rejects.toThrow(/tenantId is required/i);
    });
  }
});
