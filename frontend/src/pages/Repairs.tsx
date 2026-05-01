import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import type { Customer, RepairTicket } from "../types";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import CustomerLookup from "../components/CustomerLookup";
import Pagination from "../components/Pagination";
import { resolveAssetUrl } from "../utils/assets";
import { getApiErrorMessage, parseApiErrors } from "../utils/http";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 print:inset-auto print:relative print:bg-transparent print:p-0"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-lg rounded-2xl shadow-xl flex flex-col print:shadow-none print:border-none print:w-auto print:max-h-full"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          maxHeight: "calc(100dvh - 2rem)",
        }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 print:hidden"
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
        <div className="px-6 py-5 overflow-y-auto print:overflow-visible print:p-0">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--color-primary)" }}>{hint}</p>}
    </div>
  );
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  received:      { label: "Received",       bg: "#e0f2fe", text: "#0369a1" },
  diagnosing:    { label: "Diagnosing",     bg: "#fef9c3", text: "#854d0e" },
  waiting_parts: { label: "Waiting Parts",  bg: "#fce7f3", text: "#9d174d" },
  fixed:         { label: "Fixed",          bg: "#dcfce7", text: "#166534" },
  collected:     { label: "Collected",      bg: "#f1f5f9", text: "#475569" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: "#f1f5f9", text: "#475569" };
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}>
      {cfg.label}
    </span>
  );
}

// ── Ticket Detail Modal ───────────────────────────────────────────────────────
function TicketDetail({
  ticket, onClose, onTicketUpdated, onSummaryRefresh, userRole,
}: {
  ticket: RepairTicket;
  onClose: () => void;
  onTicketUpdated: (ticket: RepairTicket) => void;
  onSummaryRefresh: () => void;
  userRole: string;
}) {
  const { success, error } = useToast();
  const [updating, setUpdating] = useState(false);
  const [addingPart, setAddingPart] = useState(false);
  const [collectingPayment, setCollectingPayment] = useState(false);

  const { user } = useAuth();
  const [shop, setShop] = useState<any>(null);
  useEffect(() => {
    api.get("/shops/").then(({ data }) => setShop(data)).catch(() => {});
  }, []);

  const [statusNote, setStatusNote] = useState("");
  const [partForm, setPartForm] = useState({ product_id: "", quantity: "1" });
  const [partSearch, setPartSearch] = useState("");
  const [partSearchResults, setPartSearchResults] = useState<any[]>([]);
  const [partSearching, setPartSearching] = useState(false);
  const [selectedPart, setSelectedPart] = useState<any>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount_paid: ticket.final_cost || ticket.estimated_cost,
    final_cost: ticket.final_cost || ticket.estimated_cost,
  });

  const [activeTab, setActiveTab] = useState<"details" | "parts" | "finance">("details");

  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    received:      ["diagnosing", "waiting_parts", "fixed", "collected"],
    diagnosing:    ["waiting_parts", "fixed", "collected"],
    waiting_parts: ["diagnosing", "fixed", "collected"],
    fixed:         ["collected"],
    collected:     [],
  };

  const nextStatuses = ALLOWED_TRANSITIONS[ticket.status] || [];

  const handleUpdateStatus = async (newStatus: string) => {
    setUpdating(true);
    try {
      const { data } = await api.post(`/repairs/${ticket.id}/update-status/`, {
        status: newStatus,
        note: statusNote,
      });
      if (data.ticket) {
        onTicketUpdated(data.ticket);
      }
      setStatusNote("");
      success("Ticket status updated successfully.");
    } catch (err: unknown) {
      error(getApiErrorMessage(err, "Failed to update status."));
    } finally {
      setUpdating(false);
    }
  };

  // Search inventory for spare parts
  useEffect(() => {
    if (!partSearch.trim()) { setPartSearchResults([]); return; }
    setPartSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/inventory/products/?search=${encodeURIComponent(partSearch)}`);
        setPartSearchResults(data.results || data || []);
      } catch {
        setPartSearchResults([]);
      } finally {
        setPartSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [partSearch]);

  const handleAddPart = async () => {
    if (!partForm.product_id) return;
    setAddingPart(true);
    try {
      const { data } = await api.post(`/repairs/${ticket.id}/add-part/`, {
        product_id: parseInt(partForm.product_id),
        quantity: parseInt(partForm.quantity),
      });
      setPartForm({ product_id: "", quantity: "1" });
      setPartSearch("");
      setSelectedPart(null);
      setPartSearchResults([]);
      if (data.ticket) {
        onTicketUpdated(data.ticket);
      }
      onSummaryRefresh();
      success("Part added successfully.");
    } catch (err: unknown) {
      error(getApiErrorMessage(err, "Failed to add part."));
    } finally {
      setAddingPart(false);
    }
  };

  const handleRecordPayment = async () => {
    setCollectingPayment(true);
    try {
      const { data } = await api.post(`/repairs/${ticket.id}/record-payment/`, {
        amount_paid: parseFloat(paymentForm.amount_paid.toString()) || 0,
        final_cost: parseFloat(paymentForm.final_cost.toString()) || 0,
      });
      if (data.ticket) {
        onTicketUpdated(data.ticket);
      }
      onSummaryRefresh();
      success("Payment records updated successfully.");
    } catch (err: unknown) {
      error(getApiErrorMessage(err, "Failed to record payment."));
    } finally {
      setCollectingPayment(false);
    }
  };

  const isAdmin = userRole === "admin";
  const isTech = userRole === "technician";
  const isTerminal = ticket.status === "collected";

  return (
    <Modal title={`Repair #${ticket.id} — ${ticket.device_model}`} onClose={onClose}>
      {/* ── PRINT-ONLY THERMAL TICKET ── */}
      <div className="hidden print:block w-full max-w-[320px] mx-auto text-gray-900 font-mono text-xs sm:text-sm">
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold uppercase tracking-wider">{shop?.name || user?.shop_name || "Repair Ticket"}</h2>
          {shop?.address && <p className="mt-1 whitespace-pre-line leading-tight">{shop.address}</p>}
          {shop?.phone && <p className="mt-1">Tel: {shop.phone}</p>}
          {shop?.email && <p>{shop.email}</p>}
        </div>

        <div className="border-b border-dashed border-gray-400 mb-3" />

        <div className="mb-3 space-y-1">
          <div className="flex justify-between">
            <span>Ticket No:</span>
            <span className="font-semibold">#{ticket.id.toString().padStart(5, "0")}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{new Date(ticket.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <span className="uppercase">{ticket.status_display}</span>
          </div>
          {ticket.customer_name && (
            <div className="flex justify-between">
              <span>Customer:</span>
              <span>{ticket.customer_name}</span>
            </div>
          )}
        </div>

        <div className="border-b border-dashed border-gray-400 mb-3" />

        <div className="mb-3 space-y-1">
          <p className="font-bold">Device Issue</p>
          <p className="font-medium">{ticket.device_type} — {ticket.device_model}</p>
          <p className="text-gray-600 mt-1">{ticket.issue_description}</p>
        </div>

        {ticket.parts.length > 0 && (
          <>
            <div className="border-b border-dashed border-gray-400 mb-3" />
            <div className="space-y-2 mb-3">
              <div className="flex justify-between font-bold mb-1">
                <span>Parts Used</span>
                <span>Total</span>
              </div>
              {ticket.parts.map((part) => (
                <div key={part.id} className="flex justify-between">
                  <span className="pr-2">{part.product_name} x {part.quantity_used}</span>
                  <span>{fmt(parseFloat(part.unit_cost) * part.quantity_used)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="border-b border-dashed border-gray-400 mb-3" />

        <div className="space-y-1 mb-6">
          <div className="flex justify-between font-bold text-base">
            <span>Est. Cost:</span>
            <span>{fmt(ticket.estimated_cost)}</span>
          </div>
          {parseFloat(ticket.amount_paid) > 0 && (
            <div className="flex justify-between font-bold text-green-600">
              <span>Paid:</span>
              <span>{fmt(ticket.amount_paid)}</span>
            </div>
          )}
        </div>

        <div className="text-center text-gray-800 space-y-1">
          <p className="font-semibold">Please present this ticket</p>
          <p>when collecting your device.</p>
        </div>
      </div>

      {/* ── ON-SCREEN MANAGEMENT UI ── */}
      <div className="print:hidden p-2 space-y-4 font-sans">
        
        {/* Tab Navigation */}
        <div className="flex bg-surface border border-app rounded-xl p-1 shrink-0 mb-4">
          <button onClick={() => setActiveTab("details")}
            className={`flex-1 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${activeTab === "details" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-app"}`}>
            Status & Details
          </button>
          <button onClick={() => setActiveTab("parts")}
            className={`flex-1 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${activeTab === "parts" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-app"}`}>
            Spare Parts
          </button>
          <button onClick={() => setActiveTab("finance")}
            className={`flex-1 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${activeTab === "finance" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-app"}`}>
            Financials
          </button>
        </div>

        {/* Tab 1: Status & Details */}
        {activeTab === "details" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Read-only info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl" style={{ backgroundColor: "var(--color-bg)" }}>
                <p className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>Status</p>
                <StatusBadge status={ticket.status} />
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: "var(--color-bg)" }}>
                <p className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>Customer</p>
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{ticket.customer_name || "—"}</p>
              </div>
            </div>

            <div className="p-3 rounded-xl flex items-center gap-4" style={{ backgroundColor: "var(--color-bg)" }}>
              {ticket.image && (
                <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-app">
                  <a href={resolveAssetUrl(ticket.image) || undefined} target="_blank" rel="noreferrer">
                    <img
                      src={resolveAssetUrl(ticket.image) || undefined}
                      alt="Device"
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider mb-0.5" style={{ color: "var(--color-muted)" }}>
                  Device ({ticket.device_type})
                </p>
                <p className="text-base font-bold" style={{ color: "var(--color-text)" }}>{ticket.device_model}</p>
              </div>
            </div>

            <div className="p-3 rounded-xl" style={{ backgroundColor: "var(--color-bg)" }}>
              <p className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>Issue Description</p>
              <p className="text-sm" style={{ color: "var(--color-text)" }}>{ticket.issue_description}</p>
            </div>

            {ticket.note && (
              <div className="p-3 rounded-xl border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-900/10">
                <p className="text-[10px] uppercase font-bold tracking-wider text-yellow-700 dark:text-yellow-500 mb-1">Technician Notes</p>
                <p className="text-sm whitespace-pre-line text-yellow-900 dark:text-yellow-200">{ticket.note}</p>
              </div>
            )}

            {/* Update Status Workflow */}
            {!isTerminal && (isAdmin || isTech) && nextStatuses.length > 0 && (
              <div className="border-t pt-4 space-y-3" style={{ borderColor: "var(--color-border)" }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>Advance Status</p>
                <input value={statusNote} onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="Optional status note (e.g., 'Awaiting screen replacement')"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map((s) => (
                    <button key={s} onClick={() => handleUpdateStatus(s)} disabled={updating}
                      className="px-4 py-2 rounded-xl text-sm font-bold capitalize transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                      style={{
                        backgroundColor: STATUS_CONFIG[s]?.bg || "#f1f5f9",
                        color: STATUS_CONFIG[s]?.text || "#475569",
                        border: `1px solid ${STATUS_CONFIG[s]?.text || "#475569"}33`,
                      }}>
                      {updating ? "..." : `Mark as ${STATUS_CONFIG[s]?.label || s}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Parts */}
        {activeTab === "parts" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {ticket.parts.length === 0 ? (
              <div className="p-6 text-center border border-dashed rounded-xl" style={{ borderColor: "var(--color-border)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>No spare parts used yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {ticket.parts.map((part) => (
                  <div key={part.id} className="flex justify-between items-center text-sm px-4 py-3 rounded-xl border border-app bg-surface shadow-sm hover:border-primary/30 transition-colors">
                    <div>
                      <p className="font-bold text-app">{part.product_name}</p>
                      <p className="text-[10px] uppercase font-bold text-muted tracking-wider mt-0.5">Qty Used: {part.quantity_used}</p>
                    </div>
                    <span className="font-bold text-primary">{fmt(part.unit_cost)} each</span>
                  </div>
                ))}
              </div>
            )}

            {!isTerminal && (isAdmin || isTech) && (
              <div className="border-t pt-4 space-y-3 mt-4" style={{ borderColor: "var(--color-border)" }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text)" }}>Deduct Part from Inventory</p>
                <div className="relative">
                  {selectedPart ? (
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm border-2 border-primary bg-primary/5">
                      <div>
                        <span className="font-bold" style={{ color: "var(--color-text)" }}>{selectedPart.name}</span>
                        <span className="ml-2 text-xs font-bold text-primary">In Stock: {selectedPart.quantity}</span>
                      </div>
                      <button onClick={() => { setSelectedPart(null); setPartSearch(""); setPartForm({ ...partForm, product_id: "" }); }}
                        className="text-xs px-2 py-1 flex items-center justify-center font-bold text-red-500 hover:bg-red-50 rounded-lg">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <input value={partSearch} onChange={(e) => setPartSearch(e.target.value)}
                          placeholder="Search inventory..."
                          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none font-medium" style={inputStyle} />
                        {partSearching && (
                          <div className="absolute right-3 top-2.5">
                            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24" style={{ color: "var(--color-muted)" }}>
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      {partSearchResults.length > 0 && (
                        <div className="absolute z-20 w-full mt-1 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto border border-app bg-surface">
                          {partSearchResults.map((p) => (
                            <button key={p.id} onClick={() => { setSelectedPart(p); setPartForm({ ...partForm, product_id: p.id.toString() }); setPartSearch(""); setPartSearchResults([]); }}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary/5 transition-colors flex items-center justify-between gap-2 border-b border-app last:border-b-0">
                              <span className="font-bold text-app">{p.name} <span className="text-xs font-medium text-muted ml-1">{p.brand}</span></span>
                              <span className="text-xs font-black shadow-sm px-2 py-0.5 rounded-full" style={{ backgroundColor: p.quantity <= p.low_stock_threshold ? "#fee2e2" : "#dcfce7", color: p.quantity <= p.low_stock_threshold ? "#dc2626" : "#166534" }}>
                                {p.quantity} left
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  <input value={partForm.quantity} onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })}
                    placeholder="Qty" type="number" min="1"
                    className="w-24 px-4 py-2.5 rounded-xl text-sm outline-none font-bold" style={inputStyle} />
                  <button onClick={handleAddPart} disabled={addingPart || !partForm.product_id}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: "var(--color-primary)" }}>
                    {addingPart ? "Adding..." : "Confirm Part Usage"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Finance */}
        {activeTab === "finance" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-app bg-surface space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Estimated / Final</p>
                <p className="text-2xl font-black text-app">{fmt(ticket.final_cost || ticket.estimated_cost)}</p>
              </div>
              <div className="p-4 rounded-xl border border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-900/10 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-green-700 dark:text-green-500">Amount Paid</p>
                <p className="text-2xl font-black text-green-700 dark:text-green-400">{fmt(ticket.amount_paid)}</p>
              </div>
            </div>

            {isAdmin && (
              <div className="border-t pt-5 mt-4 space-y-4" style={{ borderColor: "var(--color-border)" }}>
                <p className="text-xs font-bold uppercase tracking-wide text-app">Update Payment Records</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block text-muted">Final Ticket Cost</label>
                    <input value={paymentForm.final_cost} onChange={(e) => setPaymentForm({ ...paymentForm, final_cost: e.target.value })}
                      type="number" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none font-bold" style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block text-muted">Amount Customer Paid</label>
                    <input value={paymentForm.amount_paid} onChange={(e) => setPaymentForm({ ...paymentForm, amount_paid: e.target.value })}
                      type="number" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none font-bold" style={inputStyle} />
                  </div>
                </div>
                <button onClick={handleRecordPayment} disabled={collectingPayment}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all shadow-md hover:shadow-lg active:scale-95 bg-green-600 hover:bg-green-700">
                  {collectingPayment ? "Updating Ledger..." : "Save Financials"}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="border-t pt-4 mt-6 print:hidden" style={{ borderColor: "var(--color-border)" }}>
          <button onClick={() => window.print()}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5 active:translate-y-0 border border-app bg-surface text-app shadow-sm hover:shadow-md">
            🖨️ Print Customer Receipt
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Create Ticket Modal ───────────────────────────────────────────────────────
function CreateTicket({
  onClose,
  onTicketCreated,
}: {
  onClose: () => void;
  onTicketCreated: (ticket: RepairTicket) => void;
}) {
  const { success } = useToast();
  const [form, setForm] = useState({
    customer_phone: "", customer_name: "",
    device_type: "", device_model: "",
    issue_description: "", estimated_cost: "",
    technician: "", note: "",
    image: null as File | null,
  });
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get("/auth/staff/")
      .then(({ data }) => {
        const techs = (data.results || data).filter((u: any) => u.role === "technician");
        setTechnicians(techs);
      })
      .catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    setForm({ ...form, [name]: value });
    setErrors({ ...errors, [name]: "" });

    if (
      selectedCustomer &&
      ((name === "customer_phone" && value !== selectedCustomer.phone) ||
        (name === "customer_name" && value !== selectedCustomer.name))
    ) {
      setSelectedCustomer(null);
    }
  };

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setForm((prev) => ({
      ...prev,
      customer_phone: customer.phone,
      customer_name: customer.name,
    }));
    setErrors((prev) => ({ ...prev, customer_phone: "" }));
  };

  const handleSubmit = async () => {
    setErrors({});
    const phoneRegex = /^(\+\d{1,3}\s?)?\d{10,11}$/;
    if (!form.customer_phone) {
      setErrors({ customer_phone: "Customer phone is required" });
      return;
    } else if (!phoneRegex.test(form.customer_phone)) {
      setErrors({ customer_phone: "Phone must be exactly 10 or 11 digits (with optional country code, e.g., +234)" });
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("customer_phone", form.customer_phone);
      formData.append("customer_name", form.customer_name);
      formData.append("device_type", form.device_type);
      formData.append("device_model", form.device_model);
      formData.append("issue_description", form.issue_description);
      formData.append("estimated_cost", (parseFloat(form.estimated_cost) || 0).toString());
      if (form.technician) formData.append("technician", form.technician);
      if (form.note) formData.append("note", form.note);
      if (form.image) formData.append("image", form.image);

      const { data } = await api.post("/repairs/", formData, { headers: { "Content-Type": "multipart/form-data" }});

      if (data.ticket) {
        onTicketCreated(data.ticket);
      }
      onClose();
      success("Repair ticket created successfully!");
    } catch (err: unknown) {
      const parsed = parseApiErrors(err, "Failed to create repair ticket.");
      setErrors(parsed.fieldErrors);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New Repair Ticket" onClose={onClose}>
      <div className="space-y-4">

        <CustomerLookup
          selectedCustomer={selectedCustomer}
          onSelect={handleCustomerSelect}
          onClear={() => setSelectedCustomer(null)}
          inputStyle={inputStyle}
          helperText="Reuse an existing customer when they return for another repair."
        />

        {/* Customer */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer Phone">
            <input name="customer_phone" value={form.customer_phone} onChange={handleChange}
              placeholder="+2349012345678 or 09012345678"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
            {errors.customer_phone && <p className="text-red-500 text-xs mt-1">{errors.customer_phone}</p>}
          </Field>
          <Field label="Customer Name">
            <input name="customer_name" value={form.customer_name} onChange={handleChange}
              placeholder="John Doe"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
          </Field>
        </div>

        {/* Device */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Device Type">
            <input name="device_type" value={form.device_type} onChange={handleChange}
              placeholder="Laptop, Phone, Tablet"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
            {errors.device_type && <p className="text-red-500 text-xs mt-1">{errors.device_type}</p>}
          </Field>
          <Field label="Device Model">
            <input name="device_model" value={form.device_model} onChange={handleChange}
              placeholder="iPhone 13, HP Pavilion"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
            {errors.device_model && <p className="text-red-500 text-xs mt-1">{errors.device_model}</p>}
          </Field>
        </div>

        {/* Issue */}
        <Field label="Issue Description">
          <textarea name="issue_description" value={form.issue_description} onChange={handleChange}
            placeholder="Describe the problem in detail..."
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
            style={inputStyle} />
          {errors.issue_description && <p className="text-red-500 text-xs mt-1">{errors.issue_description}</p>}
        </Field>

        {/* Estimated cost + technician */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estimated Cost (₦)"
            hint={form.estimated_cost ? `Preview: ₦${Number(form.estimated_cost).toLocaleString("en-NG")}` : undefined}>
            <input name="estimated_cost" value={form.estimated_cost} onChange={handleChange}
              type="number" placeholder="5000"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
          </Field>
          <Field label="Assign Technician">
            <select name="technician" value={form.technician} onChange={handleChange}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
              <option value="">Unassigned</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Device Image + Internal Note */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Device Image (optional)">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setForm({ ...form, image: file });
              }}
              className="w-full px-4 py-2 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 text-sm outline-none cursor-pointer"
              style={inputStyle}
            />
          </Field>
          <Field label="Internal Note (optional)">
            <input name="note" value={form.note} onChange={handleChange}
              placeholder="Any internal notes..."
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
          </Field>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{
              backgroundColor: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "var(--color-primary)" }}>
            {saving ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Repairs() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<RepairTicket | null>(null);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState({ total_revenue: 0, total_expense: 0, total_profit: 0 });

  const fetchSummary = async () => {
    try {
      const { data } = await api.get("/repairs/summary/", { params: { status: statusFilter || undefined } });
      setSummary(data);
    } catch {
      // Ignore summary refresh errors for now.
    }
  };

  const syncTicketInState = (updatedTicket: RepairTicket) => {
    setTickets((prev) => {
      const matchesFilter = !statusFilter || updatedTicket.status === statusFilter;
      const existingIndex = prev.findIndex((ticket) => ticket.id === updatedTicket.id);

      if (!matchesFilter) {
        if (existingIndex === -1) return prev;
        setCount((current) => Math.max(0, current - 1));
        return prev.filter((ticket) => ticket.id !== updatedTicket.id);
      }

      if (existingIndex === -1) {
        if (page !== 1) {
          return prev;
        }
        setCount((current) => current + 1);
        return [updatedTicket, ...prev].slice(0, 20);
      }

      return prev.map((ticket) => (ticket.id === updatedTicket.id ? updatedTicket : ticket));
    });

    setSelectedTicket((prev) => (prev?.id === updatedTicket.id ? updatedTicket : prev));
  };

  const fetchTickets = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial" || tickets.length === 0) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const [ticketsRes, sumRes] = await Promise.all([
        api.get("/repairs/", { params: { status: statusFilter || undefined, page } }),
        api.get("/repairs/summary/", { params: { status: statusFilter || undefined } })
      ]);
      const fetchedTickets = ticketsRes.data.results || ticketsRes.data;
      setTickets(fetchedTickets);
      setCount(ticketsRes.data.count || 0);
      setSummary(sumRes.data);
      
      // Crucial: keep the modal strictly in sync.
      setSelectedTicket((prev) => {
        if (!prev) return null;
        return fetchedTickets.find((t: RepairTicket) => t.id === prev.id) || prev;
      });
    } catch {
      // Ignore or log
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchTickets(tickets.length === 0 ? "initial" : "refresh"); }, [statusFilter, page]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [statusFilter]);

  const statusCounts = tickets.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const isAdminOrStaff = user?.role === "admin" || user?.role === "staff";

  return (
    <>
      <Helmet>
        <title>Repair Tickets — Giztrack</title>
        <meta name="description" content="Manage repair tickets, track status, and add spare parts." />
      </Helmet>
      <div className="space-y-6 max-w-7xl mx-auto print:hidden">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--color-text)" }}>
            Repairs
          </h1>
          <p className="text-sm mt-1 flex items-center gap-2" style={{ color: "var(--color-muted)" }}>
            <span>{count} ticket(s)</span>
            {refreshing && (
              <span className="text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
                Refreshing...
              </span>
            )}
          </p>
        </div>
        {isAdminOrStaff && (
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "var(--color-primary)" }}>
            + New Repair
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="p-6 rounded-2xl relative overflow-hidden"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-8 -mt-8" />
          <div className="relative z-10">
            <p className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>Total Repair Revenue</p>
            <h3 className="text-3xl font-display font-bold text-green-600">
              ₦{Number(summary.total_revenue).toLocaleString()}
            </h3>
            <p className="text-sm mt-3" style={{ color: "var(--color-text)" }}>
              <span className="font-medium">Payments collected</span> from customers
            </p>
          </div>
        </div>
        <div className="p-6 rounded-2xl relative overflow-hidden"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-bl-full -mr-8 -mt-8" />
          <div className="relative z-10">
            <p className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>Total Repair Expenses</p>
            <h3 className="text-3xl font-display font-bold text-red-500">
              ₦{Number(summary.total_expense).toLocaleString()}
            </h3>
            <p className="text-sm mt-3" style={{ color: "var(--color-text)" }}>
              <span className="font-medium">Total cost of parts</span> used from inventory
            </p>
          </div>
        </div>
        <div className="p-6 rounded-2xl relative overflow-hidden text-white"
          style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))" }}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -mr-8 -mt-8" />
          <div className="relative z-10">
            <p className="text-sm font-semibold uppercase tracking-wider mb-2 text-white/80">Net Repair Profit</p>
            <h3 className="text-3xl font-display font-bold">
              ₦{Number(summary.total_profit).toLocaleString()}
            </h3>
            <p className="text-sm mt-3 text-white/90">
              Total Revenue minus Total Expenses
            </p>
          </div>
        </div>
      </div>

      {/* Status summary pills */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
        <button
          onClick={() => setStatusFilter("")}
          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0"
          style={{
            backgroundColor: !statusFilter ? "var(--color-primary)" : "var(--color-surface)",
            color: !statusFilter ? "white" : "var(--color-muted)",
            border: "1px solid var(--color-border)",
          }}>
          All ({count})
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0"
            style={{
              backgroundColor: statusFilter === key ? cfg.bg : "var(--color-surface)",
              color: statusFilter === key ? cfg.text : "var(--color-muted)",
              border: `1px solid ${statusFilter === key ? cfg.text + "44" : "var(--color-border)"}`,
            }}>
            {cfg.label} ({statusCounts[key] || 0})
          </button>
        ))}
      </div>

      {/* Tickets table */}
      <div className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        {loading && tickets.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <svg className="animate-spin w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <svg className="w-10 h-10" style={{ color: "var(--color-muted)" }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>No repair tickets found</p>
          </div>
        ) : (
          <>
          <div className="md:hidden divide-y" style={{ borderColor: "var(--color-border)" }}>
            {tickets.map((ticket) => (
              <div key={ticket.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold" style={{ color: "var(--color-text)" }}>
                      #{ticket.id} • {ticket.customer_name || "Walk-in"}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                      {ticket.device_type} • {ticket.device_model}
                    </p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
                <p className="text-sm line-clamp-2" style={{ color: "var(--color-muted)" }}>
                  {ticket.issue_description}
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                      Technician
                    </p>
                    <p className="mt-1 font-medium" style={{ color: "var(--color-text)" }}>
                      {ticket.technician_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                      Estimated Cost
                    </p>
                    <p className="mt-1 font-bold text-primary">{fmt(ticket.estimated_cost)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </p>
                  <button onClick={() => setSelectedTicket(ticket)}
                    className="px-3 py-2 rounded-lg text-sm font-semibold text-primary"
                    style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
                    Manage
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block w-full overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {["Ticket", "Customer", "Device", "Issue", "Technician", "Cost", "Status", "Date", ""].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--color-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket, i) => (
                  <tr key={ticket.id}
                    style={{ borderBottom: i < tickets.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                    <td className="px-5 py-4 text-sm font-medium" style={{ color: "var(--color-text)" }}>
                      #{ticket.id}
                    </td>
                    <td className="px-5 py-4 text-sm" style={{ color: "var(--color-text)" }}>
                      {ticket.customer_name || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                        {ticket.device_model}
                      </p>
                      <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                        {ticket.device_type}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm max-w-xs truncate" style={{ color: "var(--color-muted)" }}>
                        {ticket.issue_description}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm" style={{ color: "var(--color-muted)" }}>
                      {ticket.technician_name}
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-primary">
                      {fmt(ticket.estimated_cost)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-5 py-4 text-sm" style={{ color: "var(--color-muted)" }}>
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <button onClick={() => setSelectedTicket(ticket)}
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-primary"
                        style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Pagination */}
      <Pagination
        count={count}
        page={page}
        onChange={setPage}
        pageSize={20}
      />
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateTicket
          onClose={() => setShowCreate(false)}
          onTicketCreated={(ticket) => {
            syncTicketInState(ticket);
            setShowCreate(false);
          }}
        />
      )}
      {selectedTicket && (
        <TicketDetail
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onTicketUpdated={syncTicketInState}
          onSummaryRefresh={fetchSummary}
          userRole={user?.role || "staff"}
        />
      )}
    </>
  );
}
