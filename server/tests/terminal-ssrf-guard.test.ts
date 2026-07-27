/**
 * Unit tests: POST /api/terminal/charge — SSRF guard (isPrivateOrLoopback)
 *
 * Verifies that the charge endpoint:
 * 1. Rejects a public IP (e.g. 8.8.8.8) with HTTP 400 and the SSRF
 *    rejection message before any network call is made.
 * 2. Allows a private LAN IP (192.168.x.x) past the guard so the TCP
 *    connect step is reached (adapter mock returns a synthetic approval).
 *
 * Storage, adapter resolution, and auth middleware are fully mocked — no
 * real DB, network, or Stripe calls are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import supertest from "supertest";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const { mockGetTenant, mockResolveAdapter, mockCharge } = vi.hoisted(() => {
  const mockCharge = vi.fn();

  const mockResolveAdapter = vi.fn(() => ({
    adapter: { charge: mockCharge },
  }));

  const mockGetTenant = vi.fn();

  return { mockGetTenant, mockResolveAdapter, mockCharge };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../storage", () => ({
  storage: { getTenant: mockGetTenant },
}));

vi.mock("../terminalAdapters/index", () => ({
  resolveAdapter: mockResolveAdapter,
}));

// Inject req.user and req.tenantId so authMiddleware passes
vi.mock("../auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: "test-user-1", isAdmin: true };
    req.tenantId = 1;
    next();
  },
}));

// ── Import SUT after mocks ────────────────────────────────────────────────────

import { registerTerminalRoutes } from "../terminalRoutes";

// ── Test app factory ──────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  registerTerminalRoutes(app);
  return supertest(app);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: tenant exists with no hardwareConfig
  mockGetTenant.mockResolvedValue({ id: 1, enabledFeatures: {} });

  // Default: adapter resolves with an approved charge
  mockCharge.mockResolvedValue({ approved: true, authCode: "TEST123" });
  mockResolveAdapter.mockReturnValue({ adapter: { charge: mockCharge } });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/terminal/charge — SSRF guard rejects public IPs", () => {
  it("returns 400 when terminalIp is a public internet address (8.8.8.8)", async () => {
    const agent = buildApp();
    const res = await agent.post("/api/terminal/charge").send({
      amountCents: 1999,
      orderRef: "ORDER-001",
      terminalBrand: "dejavoo",
      terminalIp: "8.8.8.8",
    });

    expect(res.status).toBe(400);
    expect(res.body.approved).toBe(false);
    expect(res.body.reason).toMatch(/not a private\/LAN address/i);
  });

  it("includes the offending IP in the rejection message", async () => {
    const agent = buildApp();
    const res = await agent.post("/api/terminal/charge").send({
      amountCents: 500,
      orderRef: "ORDER-002",
      terminalBrand: "dejavoo",
      terminalIp: "8.8.8.8",
    });

    expect(res.body.reason).toContain("8.8.8.8");
  });

  it("does not call resolveAdapter when a public IP is provided", async () => {
    const agent = buildApp();
    await agent.post("/api/terminal/charge").send({
      amountCents: 500,
      orderRef: "ORDER-003",
      terminalBrand: "dejavoo",
      terminalIp: "8.8.8.8",
    });

    expect(mockResolveAdapter).not.toHaveBeenCalled();
  });

  it("returns 400 for other public IPs (1.1.1.1)", async () => {
    const agent = buildApp();
    const res = await agent.post("/api/terminal/charge").send({
      amountCents: 500,
      orderRef: "ORDER-004",
      terminalBrand: "pax",
      terminalIp: "1.1.1.1",
    });

    expect(res.status).toBe(400);
    expect(res.body.approved).toBe(false);
    expect(res.body.reason).toMatch(/not a private\/LAN address/i);
  });
});

describe("POST /api/terminal/charge — SSRF guard passes private LAN IPs", () => {
  it("passes the guard for a 192.168.x.x address and reaches the adapter", async () => {
    const agent = buildApp();
    const res = await agent.post("/api/terminal/charge").send({
      amountCents: 1999,
      orderRef: "ORDER-005",
      terminalBrand: "dejavoo",
      terminalIp: "192.168.1.100",
    });

    // The adapter mock returns approved: true, so the response should be 200
    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(true);
  });

  it("calls resolveAdapter when a private IP passes the guard", async () => {
    const agent = buildApp();
    await agent.post("/api/terminal/charge").send({
      amountCents: 1999,
      orderRef: "ORDER-006",
      terminalBrand: "dejavoo",
      terminalIp: "192.168.1.100",
    });

    expect(mockResolveAdapter).toHaveBeenCalledOnce();
  });

  it("passes the guard for a 10.x.x.x address", async () => {
    const agent = buildApp();
    const res = await agent.post("/api/terminal/charge").send({
      amountCents: 500,
      orderRef: "ORDER-007",
      terminalBrand: "dejavoo",
      terminalIp: "10.0.0.55",
    });

    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(true);
  });

  it("passes the guard for a 172.16.x.x address", async () => {
    const agent = buildApp();
    const res = await agent.post("/api/terminal/charge").send({
      amountCents: 500,
      orderRef: "ORDER-008",
      terminalBrand: "dejavoo",
      terminalIp: "172.16.5.10",
    });

    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(true);
  });

  it("passes the guard for loopback (127.0.0.1)", async () => {
    const agent = buildApp();
    const res = await agent.post("/api/terminal/charge").send({
      amountCents: 500,
      orderRef: "ORDER-009",
      terminalBrand: "dejavoo",
      terminalIp: "127.0.0.1",
    });

    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(true);
  });
});

describe("POST /api/terminal/charge — SSRF guard is skipped for Stripe brand", () => {
  it("does not apply the SSRF check when terminalBrand is 'stripe'", async () => {
    // Stripe Terminal routes through Stripe's cloud, not a local IP.
    // The guard explicitly skips non-stripe brands, so a public IP with
    // brand='stripe' should reach the adapter (or fail for a different reason).
    mockResolveAdapter.mockReturnValue({ adapter: { charge: mockCharge } });

    const agent = buildApp();
    const res = await agent.post("/api/terminal/charge").send({
      amountCents: 500,
      orderRef: "ORDER-010",
      terminalBrand: "stripe",
      terminalIp: "8.8.8.8",
    });

    // Guard is skipped — resolveAdapter is called (no 400 from SSRF guard)
    expect(res.status).not.toBe(400);
    expect(res.body.reason ?? "").not.toMatch(/not a private\/LAN address/i);
  });
});
