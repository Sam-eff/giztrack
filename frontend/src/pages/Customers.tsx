import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import type { Customer, Sale, RepairTicket } from "../types";
import api from "../api/axios";
// ── Helpers ───────────────────────────────────────────────────────────────────
const inputStyle = {
  backgroundColor: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
};

const fmt = (n: number | string) =>
  `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-2xl rounded-2xl shadow-xl flex flex-col"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          maxHeight: "calc(100dvh - 2rem)",
        }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: "var(--color-border)" }}>
          <h2 className="font-display font-bold text-base" style={{ color: "var(--color-text)" }}>
            {title}
          </h2>
          <button onClick={onClose} style={{ color: "var(--color-muted)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ── Status badge for repairs ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  received:      { bg: "#e0f2fe", text: "#0369a1" },
  diagnosing:    { bg: "#fef9c3", text: "#854d0e" },
  waiting_parts: { bg: "#fce7f3", text: "#9d174d" },
  fixed:         { bg: "#dcfce7", text: "#166534" },
  collected:     { bg: "#f1f5f9", text: "#475569" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { bg: "#f1f5f9", text: "#475569" };
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}>
      {status.replace("_", " ")}
    </span>
  );
}

// ── Customer History Modal ────────────────────────────────────────────────────
function CustomerHistory({ customer, onClose }: {
  customer: Customer; onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<Sale[]>([]);
  const [repairs, setRepairs] = useState<RepairTicket[]>([]);
  const [tab, setTab] = useState<"purchases" | "repairs">("purchases");

  useEffect(() => {
    api.get(`/customers/${customer.id}/history/`)
      .then(({ data }) => {
        setPurchases(data.purchases || []);
        setRepairs(data.repairs || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customer.id]);

  return (
    <Modal title={`${customer.name} — History`} onClose={onClose}>
      <div className="space-y-4">

        {/* Customer info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl" style={{ backgroundColor: "var(--color-bg)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Phone</p>
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{customer.phone}</p>
          </div>
          <div className="p-3 rounded-xl" style={{ backgroundColor: "var(--color-bg)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Email</p>
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              {customer.email || "—"}
            </p>
          </div>
          <div className="p-3 rounded-xl" style={{ backgroundColor: "var(--color-bg)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Total Purchases</p>
            <p className="text-sm font-bold text-primary">{purchases.length}</p>
          </div>
          <div className="p-3 rounded-xl" style={{ backgroundColor: "var(--color-bg)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Total Repairs</p>
            <p className="text-sm font-bold text-primary">{repairs.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl p-1 gap-1"
          style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
          {(["purchases", "repairs"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all capitalize"
              style={{
                backgroundColor: tab === t ? "var(--color-primary)" : "transparent",
                color: tab === t ? "white" : "var(--color-muted)",
              }}>
              {t} ({t === "purchases" ? purchases.length : repairs.length})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <svg className="animate-spin w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : tab === "purchases" ? (
          purchases.length === 0 ? (
            <div className="flex items-center justify-center h-24 rounded-xl"
              style={{ backgroundColor: "var(--color-bg)" }}>
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>No purchases yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {purchases.map((sale) => (
                <div key={sale.id} className="p-4 rounded-xl"
                  style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                      Sale #{sale.id}
                    </span>
                    <span className="text-sm font-bold text-primary">{fmt(sale.total_amount)}</span>
                  </div>
                  <div className="space-y-1">
                    {sale.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-xs"
                        style={{ color: "var(--color-muted)" }}>
                        <span>{item.product_name} × {item.quantity}</span>
                        <span>{fmt(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>
                    {new Date(sale.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )
        ) : (
          repairs.length === 0 ? (
            <div className="flex items-center justify-center h-24 rounded-xl"
              style={{ backgroundColor: "var(--color-bg)" }}>
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>No repairs yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {repairs.map((repair) => (
                <div key={repair.id} className="p-4 rounded-xl"
                  style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                      Repair #{repair.id} — {repair.device_model}
                    </span>
                    <StatusBadge status={repair.status} />
                  </div>
                  <p className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>
                    {repair.issue_description}
                  </p>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--color-muted)" }}>
                      {new Date(repair.created_at).toLocaleDateString()}
                    </span>
                    <span className="font-medium text-primary">{fmt(repair.estimated_cost)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </Modal>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);

  const fetchCustomers = () => {
    setLoading(true);
    api.get("/customers/", { params: { search: search || undefined, page } })
      .then(({ data }) => {
        setCustomers(data.results || data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const delay = setTimeout(fetchCustomers, 400);
    return () => clearTimeout(delay);
  }, [search, page]);

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1); }, [search]);

  return (
    <>
      <Helmet>
        <title>Customers — Giztrack</title>
        <meta name="description" content="Manage your customer database and view their history." />
      </Helmet>
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold" style={{ color: "var(--color-text)" }}>
          Customers
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          {customers.length} customer(s) — search by name or phone
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
          style={{ color: "var(--color-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
          style={inputStyle}
        />
      </div>

      {/* Customer grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <svg className="animate-spin w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-2xl gap-2"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <svg className="w-10 h-10" style={{ color: "var(--color-muted)" }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            {search ? "No customers found" : "No customers yet — they appear after a sale or repair"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {customers.map((customer) => (
            <button key={customer.id}
              onClick={() => setSelectedCustomer(customer)}
              className="text-left p-5 rounded-2xl transition-all hover:shadow-md"
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}>
              <div className="flex items-center gap-3 mb-3">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center
                  text-white font-bold text-sm shrink-0">
                  {customer.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text)" }}>
                    {customer.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {customer.phone}
                  </p>
                </div>
              </div>
              

              {customer.email && (
                <p className="text-xs truncate mb-2" style={{ color: "var(--color-muted)" }}>
                  {customer.email}
                </p>
              )}

              {customer.address && (
                <p className="text-xs truncate" style={{ color: "var(--color-muted)" }}>
                  📍 {customer.address}
                </p>
              )}

              <div className="mt-3 pt-3 border-t flex items-center justify-between"
                style={{ borderColor: "var(--color-border)" }}>
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  Since {new Date(customer.created_at).toLocaleDateString()}
                </span>
                <span className="text-xs font-medium text-primary">View history →</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* History modal */}
      {selectedCustomer && (
        <CustomerHistory
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </div>
    </>
  );
}