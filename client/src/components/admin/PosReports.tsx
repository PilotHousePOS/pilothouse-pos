import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem { name: string; sku?: string; price: number; quantity: number; category: string; }
interface SaleOrder {
  id: number; order_number: string; items: OrderItem[];
  subtotal: number; tax: number; total: number;
  payment_method: string; amount_tendered?: number; change_due?: number;
  created_at: string;
}
interface PeriodRow { period: string; label: string; order_count: number; subtotal: number; tax: number; total: number; }
interface MethodRow  { payment_method: string; order_count: number; total: number; }
interface SummaryData { totals: { order_count: number; subtotal: number; tax: number; total: number }; byPeriod: PeriodRow[]; byMethod: MethodRow[]; }
interface TrendItem  { name: string; category: string; sku?: string; total_qty: number; total_revenue: number; order_count: number; }
interface InvCatRow  { category: string; item_count: number; total_units: number; total_value: number; }
interface InvData    { byCategory: InvCatRow[]; totals: { item_count: number; total_units: number; total_value: number }; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt  = (n: number | string) => `$${Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const fmtN = (n: number | string) => Number(n).toLocaleString();

function today()     { return new Date().toISOString().slice(0, 10); }
function monthStart(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }
function yearStart() { return `${new Date().getFullYear()}-01-01`; }

const PAYMENT_LABELS: Record<string, string> = { cash: "Cash", credit: "Credit / Card", charge_account: "Charge Account" };

const CATEGORY_LABELS: Record<string, string> = {
  dogFood:"Dog Food", catFood:"Cat Food", dogTreats:"Dog Treats", catTreats:"Cat Treats",
  accessories:"Accessories", leashesAndCollars:"Leashes & Collars", toys:"Toys", beds:"Beds",
  healthcare:"Healthcare", aquatics:"Aquatics", reptiles:"Reptiles",
  birdSupplies:"Bird Supplies", smallAnimalSupplies:"Small Animals",
  grooming:"Grooming", tips:"Tips", misc:"Misc.", giftCards:"Gift Cards",
};

function exportCsv(filename: string, rows: string[][], headers: string[]) {
  const lines = [headers, ...rows].map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([lines], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function DateRangeBar({
  start, end, onStart, onEnd, presets,
}: {
  start: string; end: string;
  onStart: (v: string) => void; onEnd: (v: string) => void;
  presets?: { label: string; start: string; end: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <label className="text-xs text-gray-400">From</label>
      <input type="date" value={start} onChange={e => onStart(e.target.value)}
        className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500" />
      <label className="text-xs text-gray-400">To</label>
      <input type="date" value={end} onChange={e => onEnd(e.target.value)}
        className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500" />
      {presets?.map(p => (
        <button key={p.label} onClick={() => { onStart(p.start); onEnd(p.end); }}
          className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2.5 py-1 rounded">
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ─── ORDERS TAB ───────────────────────────────────────────────────────────────

function OrdersTab() {
  const [start, setStart] = useState(monthStart);
  const [end,   setEnd  ] = useState(today);
  const [page,  setPage ] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ orders: SaleOrder[]; total: number }>({
    queryKey: [`/api/admin/pos/sales?start=${start}&end=${end}&page=${page}&limit=50`],
    enabled: !!start && !!end,
  });

  const orders  = data?.orders  ?? [];
  const total   = data?.total   ?? 0;
  const pages   = Math.ceil(total / 50);

  const presets = [
    { label: "Today",        start: today(),      end: today() },
    { label: "This Month",   start: monthStart(), end: today() },
    { label: "This Year",    start: yearStart(),  end: today() },
    { label: "All Time",     start: "2020-01-01", end: today() },
  ];

  const doExport = () => {
    const headers = ["Order #","Date","Items","Payment","Subtotal","Tax","Total"];
    const rows = orders.map(o => [
      o.order_number, new Date(o.created_at).toLocaleDateString(),
      (o.items || []).map(i => `${i.name} ×${i.quantity}`).join("; "),
      PAYMENT_LABELS[o.payment_method] ?? o.payment_method,
      Number(o.subtotal).toFixed(2), Number(o.tax).toFixed(2), Number(o.total).toFixed(2),
    ]);
    exportCsv(`sales-orders-${start}-to-${end}.csv`, rows, headers);
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <DateRangeBar start={start} end={end} onStart={s => { setStart(s); setPage(1); }} onEnd={e => { setEnd(e); setPage(1); }} presets={presets} />
        <button onClick={doExport} disabled={!orders.length}
          className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white px-3 py-1.5 rounded font-semibold">
          ⬇ Export CSV
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">No orders found for this period.</div>
      ) : (
        <>
          <div className="text-xs text-gray-500 mb-2">{total} orders found</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-2 pr-3">Date / Time</th>
                  <th className="pb-2 pr-3">Order #</th>
                  <th className="pb-2 pr-3">Items</th>
                  <th className="pb-2 pr-3">Payment</th>
                  <th className="pb-2 pr-3 text-right">Subtotal</th>
                  <th className="pb-2 pr-3 text-right">Tax</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {orders.map(o => (
                  <>
                    <tr key={o.id}
                      onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                      className="hover:bg-gray-800/50 cursor-pointer">
                      <td className="py-2 pr-3 text-gray-300 whitespace-nowrap">
                        {new Date(o.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}<br/>
                        <span className="text-gray-500">{new Date(o.created_at).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})}</span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-yellow-400">{o.order_number || `#${o.id}`}</td>
                      <td className="py-2 pr-3 text-gray-300">{(o.items||[]).reduce((s,i)=>s+i.quantity,0)} items</td>
                      <td className="py-2 pr-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${o.payment_method==="cash"?"bg-green-900 text-green-300":o.payment_method==="credit"?"bg-blue-900 text-blue-300":"bg-gray-700 text-gray-300"}`}>
                          {PAYMENT_LABELS[o.payment_method] ?? o.payment_method}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right text-gray-300">{fmt(o.subtotal)}</td>
                      <td className="py-2 pr-3 text-right text-gray-400">{fmt(o.tax)}</td>
                      <td className="py-2 text-right font-semibold text-green-400">{fmt(o.total)}</td>
                    </tr>
                    {expanded === o.id && (
                      <tr key={`${o.id}-detail`} className="bg-gray-900">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Line Items</div>
                          <table className="w-full text-xs mb-2">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left pb-1">Item</th>
                                <th className="text-left pb-1">Category</th>
                                <th className="text-right pb-1">Price ea</th>
                                <th className="text-right pb-1">Qty</th>
                                <th className="text-right pb-1">Line Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(o.items||[]).map((item, idx) => (
                                <tr key={idx} className="border-t border-gray-800">
                                  <td className="py-1 pr-3 text-white">{item.name}</td>
                                  <td className="py-1 pr-3 text-gray-400">{CATEGORY_LABELS[item.category] ?? item.category}</td>
                                  <td className="py-1 pr-3 text-right text-gray-300">{fmt(item.price)}</td>
                                  <td className="py-1 pr-3 text-right text-gray-300">{item.quantity}</td>
                                  <td className="py-1 text-right text-green-400 font-semibold">{fmt(item.price * item.quantity)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {o.payment_method === "cash" && o.amount_tendered != null && (
                            <div className="text-xs text-gray-500">Cash tendered: {fmt(o.amount_tendered)} · Change: {fmt(o.change_due ?? 0)}</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-30 rounded">← Prev</button>
              <span className="text-xs text-gray-400">Page {page} of {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page===pages}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-30 rounded">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── SUMMARY TAB ─────────────────────────────────────────────────────────────

function SummaryTab() {
  const currentYear = new Date().getFullYear();
  const [start,   setStart  ] = useState(yearStart);
  const [end,     setEnd    ] = useState(today);
  const [groupBy, setGroupBy] = useState<"day"|"month"|"year">("month");

  const { data, isLoading } = useQuery<SummaryData>({
    queryKey: [`/api/admin/pos/sales/summary?start=${start}&end=${end}&groupBy=${groupBy}`],
    enabled: !!start && !!end,
  });

  const presets = [
    { label: "This Month", start: monthStart(), end: today() },
    { label: "This Year",  start: yearStart(),  end: today() },
    { label: `${currentYear-1}`, start: `${currentYear-1}-01-01`, end: `${currentYear-1}-12-31` },
    { label: `${currentYear-2}`, start: `${currentYear-2}-01-01`, end: `${currentYear-2}-12-31` },
    { label: "All Time",   start: "2020-01-01", end: today() },
  ];

  const totals   = data?.totals;
  const byPeriod = data?.byPeriod ?? [];
  const byMethod = data?.byMethod ?? [];

  const doExport = () => {
    exportCsv(`sales-summary-${start}-to-${end}.csv`,
      byPeriod.map(r => [r.label, String(r.order_count), Number(r.subtotal).toFixed(2), Number(r.tax).toFixed(2), Number(r.total).toFixed(2)]),
      ["Period","Orders","Subtotal","Tax","Total"],
    );
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <DateRangeBar start={start} end={end} onStart={setStart} onEnd={setEnd} presets={presets} />
        <div className="flex items-center gap-1">
          {(["day","month","year"] as const).map(g => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={`text-xs px-2.5 py-1 rounded capitalize ${groupBy===g?"bg-blue-700 text-white":"bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
              {g}
            </button>
          ))}
        </div>
        <button onClick={doExport} disabled={!byPeriod.length}
          className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white px-3 py-1.5 rounded font-semibold">
          ⬇ Export CSV
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-gray-500 text-sm">Loading…</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Orders"  value={fmtN(totals?.order_count ?? 0)} />
            <StatCard label="Gross Sales"   value={fmt(totals?.subtotal ?? 0)} />
            <StatCard label="Tax Collected" value={fmt(totals?.tax ?? 0)} sub="For tax filing" />
            <StatCard label="Net Revenue"   value={fmt(totals?.total ?? 0)} />
          </div>

          {/* Payment method breakdown */}
          {byMethod.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">By Payment Method</div>
              <div className="flex flex-wrap gap-3">
                {byMethod.map(m => (
                  <div key={m.payment_method} className="bg-gray-800 border border-gray-700 rounded px-4 py-2 text-sm">
                    <span className="text-gray-400">{PAYMENT_LABELS[m.payment_method] ?? m.payment_method}: </span>
                    <span className="font-bold text-white">{fmt(m.total)}</span>
                    <span className="text-gray-500 ml-1">({fmtN(m.order_count)} orders)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Period table */}
          {byPeriod.length > 0 ? (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Breakdown by {groupBy}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="pb-2 pr-4">Period</th>
                      <th className="pb-2 pr-4 text-right">Orders</th>
                      <th className="pb-2 pr-4 text-right">Subtotal</th>
                      <th className="pb-2 pr-4 text-right">Tax</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {byPeriod.map(r => (
                      <tr key={r.period} className="hover:bg-gray-800/40">
                        <td className="py-2 pr-4 text-white font-medium">{r.label}</td>
                        <td className="py-2 pr-4 text-right text-gray-300">{fmtN(r.order_count)}</td>
                        <td className="py-2 pr-4 text-right text-gray-300">{fmt(r.subtotal)}</td>
                        <td className="py-2 pr-4 text-right text-gray-400">{fmt(r.tax)}</td>
                        <td className="py-2 text-right font-semibold text-green-400">{fmt(r.total)}</td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="border-t-2 border-gray-600 font-bold">
                      <td className="py-2 pr-4 text-gray-300">TOTAL</td>
                      <td className="py-2 pr-4 text-right text-white">{fmtN(totals?.order_count ?? 0)}</td>
                      <td className="py-2 pr-4 text-right text-white">{fmt(totals?.subtotal ?? 0)}</td>
                      <td className="py-2 pr-4 text-right text-white">{fmt(totals?.tax ?? 0)}</td>
                      <td className="py-2 text-right text-green-400 text-sm">{fmt(totals?.total ?? 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">No sales in this period.</div>
          )}
        </>
      )}
    </div>
  );
}

// ─── TRENDS TAB ───────────────────────────────────────────────────────────────

function TrendsTab() {
  const [start,   setStart  ] = useState(yearStart);
  const [end,     setEnd    ] = useState(today);
  const [sortBy,  setSortBy ] = useState<"revenue"|"quantity">("revenue");
  const [catFilter, setCatFilter] = useState("all");

  const { data = [], isLoading } = useQuery<TrendItem[]>({
    queryKey: [`/api/admin/pos/sales/trends?start=${start}&end=${end}`],
    enabled: !!start && !!end,
  });

  const presets = [
    { label: "This Month", start: monthStart(), end: today() },
    { label: "This Year",  start: yearStart(),  end: today() },
    { label: "All Time",   start: "2020-01-01", end: today() },
  ];

  const categories = useMemo(() => ["all", ...Array.from(new Set(data.map(d => d.category).filter(Boolean)))], [data]);

  const sorted = useMemo(() => {
    const filtered = catFilter === "all" ? data : data.filter(d => d.category === catFilter);
    return [...filtered].sort((a, b) =>
      sortBy === "revenue" ? Number(b.total_revenue) - Number(a.total_revenue) : Number(b.total_qty) - Number(a.total_qty)
    );
  }, [data, sortBy, catFilter]);

  const grandRevenue = sorted.reduce((s, r) => s + Number(r.total_revenue), 0);
  const grandQty     = sorted.reduce((s, r) => s + Number(r.total_qty), 0);

  const doExport = () => {
    exportCsv(`sales-trends-${start}-to-${end}.csv`,
      sorted.map(r => [r.name, CATEGORY_LABELS[r.category]??r.category, String(Number(r.total_qty)), Number(r.total_revenue).toFixed(2), String(r.order_count)]),
      ["Item","Category","Units Sold","Revenue","# Orders"],
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangeBar start={start} end={end} onStart={setStart} onEnd={setEnd} presets={presets} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400">Sort by:</span>
        {(["revenue","quantity"] as const).map(s => (
          <button key={s} onClick={() => setSortBy(s)}
            className={`text-xs px-2.5 py-1 rounded capitalize ${sortBy===s?"bg-blue-700 text-white":"bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
            {s === "revenue" ? "$ Revenue" : "Units Sold"}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-3">Category:</span>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none">
          {categories.map(c => <option key={c} value={c}>{c==="all"?"All Categories":(CATEGORY_LABELS[c]??c)}</option>)}
        </select>
        <button onClick={doExport} disabled={!sorted.length}
          className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white px-3 py-1.5 rounded font-semibold ml-auto">
          ⬇ Export CSV
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-gray-500 text-sm">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-10 text-gray-500 text-sm">No sales data for this period.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700">
                <th className="pb-2 pr-2 w-6">#</th>
                <th className="pb-2 pr-4">Item</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4 text-right">Units Sold</th>
                <th className="pb-2 pr-4 text-right">Revenue</th>
                <th className="pb-2 pr-4 text-right">Orders</th>
                <th className="pb-2 text-right">% of Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {sorted.map((item, idx) => {
                const pct = grandRevenue > 0 ? (Number(item.total_revenue) / grandRevenue * 100) : 0;
                return (
                  <tr key={`${item.name}-${idx}`} className="hover:bg-gray-800/40">
                    <td className="py-2 pr-2 text-gray-600">{idx+1}</td>
                    <td className="py-2 pr-4 text-white font-medium max-w-xs truncate">{item.name}</td>
                    <td className="py-2 pr-4 text-gray-400">{CATEGORY_LABELS[item.category]??item.category}</td>
                    <td className="py-2 pr-4 text-right text-blue-400 font-semibold">{fmtN(Number(item.total_qty))}</td>
                    <td className="py-2 pr-4 text-right text-green-400 font-semibold">{fmt(item.total_revenue)}</td>
                    <td className="py-2 pr-4 text-right text-gray-400">{fmtN(item.order_count)}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="text-gray-400 w-8 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-gray-600 font-bold">
                <td className="py-2 pr-2" />
                <td className="py-2 pr-4 text-gray-300">TOTAL ({sorted.length} items)</td>
                <td className="py-2 pr-4" />
                <td className="py-2 pr-4 text-right text-blue-400">{fmtN(grandQty)}</td>
                <td className="py-2 pr-4 text-right text-green-400">{fmt(grandRevenue)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── INVENTORY VALUE TAB ──────────────────────────────────────────────────────

function InventoryValueTab() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<InvData>({
    queryKey: ["/api/admin/pos/inventory-value"],
    staleTime: 60_000,
  });

  const categories = data?.byCategory ?? [];
  const totals     = data?.totals;

  const doExport = () => {
    exportCsv(`inventory-value-${today()}.csv`,
      categories.map(r => [CATEGORY_LABELS[r.category]??r.category, String(r.item_count), String(Number(r.total_units)), Number(r.total_value).toFixed(2)]),
      ["Category","SKUs","Units On Hand","Total Value ($)"],
    );
  };

  const asOf = new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Inventory Valuation</h3>
          <p className="text-xs text-gray-400 mt-0.5">Current stock on hand × retail price as of {asOf}. Use for end-of-year inventory reporting.</p>
        </div>
        <button onClick={doExport} disabled={!categories.length}
          className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white px-3 py-1.5 rounded font-semibold">
          ⬇ Export CSV
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-gray-500 text-sm">Loading inventory…</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Categories with Stock" value={fmtN(categories.length)} />
            <StatCard label="Total Units On Hand"   value={fmtN(Number(totals?.total_units ?? 0))} />
            <StatCard label="Total Inventory Value" value={fmt(totals?.total_value ?? 0)} sub="At retail price" />
          </div>

          {/* Category table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 pr-4 text-right">SKUs</th>
                  <th className="pb-2 pr-4 text-right">Units On Hand</th>
                  <th className="pb-2 text-right">Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {categories.map(cat => {
                  const total = Number(totals?.total_value ?? 1);
                  const pct   = total > 0 ? (Number(cat.total_value) / total * 100) : 0;
                  return (
                    <tr key={cat.category} className="hover:bg-gray-800/40">
                      <td className="py-2 pr-4 text-white font-medium">{CATEGORY_LABELS[cat.category]??cat.category}</td>
                      <td className="py-2 pr-4 text-right text-gray-300">{fmtN(cat.item_count)}</td>
                      <td className="py-2 pr-4 text-right text-blue-400">{fmtN(Number(cat.total_units))}</td>
                      <td className="py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <span className="text-green-400 font-semibold">{fmt(cat.total_value)}</span>
                          <span className="text-gray-500 w-10 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-gray-600 font-bold">
                  <td className="py-2 pr-4 text-gray-300">TOTAL</td>
                  <td className="py-2 pr-4 text-right text-white">{fmtN(Number(totals?.item_count ?? 0))}</td>
                  <td className="py-2 pr-4 text-right text-blue-400">{fmtN(Number(totals?.total_units ?? 0))}</td>
                  <td className="py-2 text-right text-green-400 text-sm font-bold">{fmt(totals?.total_value ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-600 border-t border-gray-800 pt-3">
            Note: Values are at retail price (not cost). Items with zero stock quantity are excluded. 
            For cost-based valuation, adjust prices accordingly before running this report.
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main PosReports Component ────────────────────────────────────────────────

const TABS = [
  { id: "orders",    label: "Sales Orders" },
  { id: "summary",   label: "Summary & Tax Report" },
  { id: "trends",    label: "Trends" },
  { id: "inventory", label: "Inventory Value" },
] as const;

type TabId = typeof TABS[number]["id"];

export default function PosReports() {
  const [activeTab, setActiveTab] = useState<TabId>("orders");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold">POS Sales Reports</h2>
        <p className="text-sm text-gray-400 mt-0.5">Track revenue, tax collected, top sellers, and inventory value.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-700">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab===t.id?"border-blue-500 text-blue-400":"border-transparent text-gray-400 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {activeTab === "orders"    && <OrdersTab />}
        {activeTab === "summary"   && <SummaryTab />}
        {activeTab === "trends"    && <TrendsTab />}
        {activeTab === "inventory" && <InventoryValueTab />}
      </div>
    </div>
  );
}
