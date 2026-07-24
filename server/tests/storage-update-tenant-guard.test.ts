/**
 * Enumeration test: every tenant-scoped storage update method must throw when
 * called without a tenantId.
 *
 * The requireTenantId() helper (server/storage.ts) enforces this at the top of
 * each method, before any DB call, so no live database connection is needed —
 * the promise rejects synchronously.
 *
 * When a new update method is added for a tenant-owned table, add it to the
 * TENANT_SCOPED_UPDATES list below and the test will cover it automatically.
 * Omitting it will be caught as a missing entry (the list is the contract).
 */

import { describe, it, expect } from "vitest";
import { storage } from "../storage";

// ─── Contract list ─────────────────────────────────────────────────────────────
//
// Each entry names a StorageInterface update method that operates on a
// tenant-owned table.  The value is the full argument list to pass, with
// tenantId intentionally omitted (undefined) so requireTenantId() fires.
//
// Use a numeric id of 0 and minimal dummy values for other required args;
// the guard throws before any DB lookup so the row need not exist.

const TENANT_SCOPED_UPDATES: Array<{
  method: keyof typeof storage;
  label: string;
  args: any[];
}> = [
  { method: "updatePet",                        label: "updatePet",                        args: [0, {}, undefined] },
  { method: "updateSupply",                     label: "updateSupply",                     args: [0, {}, undefined] },
  { method: "updateOrderStatus",                label: "updateOrderStatus",                args: [0, "pending", undefined] },
  { method: "updateOrderApprovalStatus",        label: "updateOrderApprovalStatus",        args: [0, "approved", undefined] },
  { method: "updateAppointmentStatus",          label: "updateAppointmentStatus",          args: [0, "confirmed", undefined] },
  { method: "updateAppointmentIsHere",          label: "updateAppointmentIsHere",          args: [0, true, undefined] },
  { method: "updateAppointmentIsPaid",          label: "updateAppointmentIsPaid",          args: [0, true, undefined] },
  { method: "updateAppointmentReadyForPayment", label: "updateAppointmentReadyForPayment", args: [0, "0.00", false, undefined] },
  { method: "updateAppointmentPaidOnline",      label: "updateAppointmentPaidOnline",      args: [0, "sess_test", undefined] },
  { method: "updateAppointmentGroomingCompleted", label: "updateAppointmentGroomingCompleted", args: [0, false, undefined] },
  { method: "updateAppointmentHistoryRecord",   label: "updateAppointmentHistoryRecord",   args: [0, {}, undefined] },
  { method: "updateGroomer",                    label: "updateGroomer",                    args: [0, {}, undefined] },
  { method: "updateGroomerAvailability",        label: "updateGroomerAvailability",        args: [0, {}, undefined] },
  { method: "updateContact",                    label: "updateContact",                    args: [0, {}, undefined] },
  { method: "updateContactSmsOptOut",           label: "updateContactSmsOptOut",           args: [0, false, undefined] },
  { method: "updateBoardingRecord",             label: "updateBoardingRecord",             args: [0, {}, undefined] },
  { method: "updateScheduleEntry",              label: "updateScheduleEntry",              args: [0, {}, undefined] },
  { method: "updateGroomingScheduleEntry",      label: "updateGroomingScheduleEntry",      args: [0, {}, undefined] },
  { method: "updateLoyaltySettings",            label: "updateLoyaltySettings",            args: [{}, undefined] },
  { method: "updateJobApplicationStatus",       label: "updateJobApplicationStatus",       args: [0, "reviewed", undefined, undefined] },
  { method: "updateAppointmentDetails",         label: "updateAppointmentDetails",         args: [0, {}, undefined] },
  { method: "updateAppointmentItemPrice",       label: "updateAppointmentItemPrice",       args: [0, "0.00", undefined] },
  { method: "updateCustomerPet",                label: "updateCustomerPet",                args: [0, {}, undefined] },
  { method: "updateSpecialDateSetting",         label: "updateSpecialDateSetting",         args: [0, {}, undefined] },
  { method: "updateOrderItemRefund",            label: "updateOrderItemRefund",            args: [0, 1, "0.00", undefined] },
];

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("storage update methods — requireTenantId guard", () => {
  for (const { method, label, args } of TENANT_SCOPED_UPDATES) {
    it(`${label}(..., undefined) throws before reaching the database`, async () => {
      const fn = (storage as any)[method].bind(storage);
      await expect(fn(...args)).rejects.toThrow(/tenantId is required/i);
    });
  }
});
