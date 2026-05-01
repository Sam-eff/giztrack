import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import type { Expense } from "../types";
import Pagination from "../components/Pagination";

// ── Helpers ───────────────────────────────────────────────────────────────────
const inputStyle = {
  backgroundColor: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
};

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
      <div className="relative">
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 px-3 pr-10 py-2.5 text-sm rounded-lg outline-none"
          style={inputStyle}
        />
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--color-muted)" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10m-13 9h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v11a2 2 0 002 2z" />
        </svg>
      </div>
    </label>
  );
}

const fmt = (n: number | string) =>
  `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Expenses() {
  const { isPro } = useAuth();
  const { success, error } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  
  // Pagination
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);

  // Form State
  const [formVisible, setFormVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    amount: "",
    category: "miscellaneous",
    date: new Date().toISOString().split("T")[0],
    description: "",
  });

  const CATEGORIES = [
    { id: "rent", label: "Rent" },
    { id: "salary", label: "Salary" },
    { id: "utilities", label: "Utilities" },
    { id: "supplies", label: "Supplies" },
    { id: "maintenance", label: "Maintenance" },
    { id: "marketing", label: "Marketing" },
    { id: "miscellaneous", label: "Miscellaneous" },
  ];

  const fetchExpenses = () => {
    if (!isPro) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const params: any = { page };
    if (dateFrom) params.start_date = dateFrom;
    if (dateTo) params.end_date = dateTo;

    api.get("/finance/expenses/", { params })
      .then(({ data }) => {
        setExpenses(data.results);
        setCount(data.count);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchExpenses();
  }, [page, dateFrom, dateTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPro) {
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/finance/expenses/", {
        ...formData,
        amount: parseFloat(formData.amount),
      });
      setFormVisible(false);
      setFormData({
        amount: "",
        category: "miscellaneous",
        date: new Date().toISOString().split("T")[0],
        description: "",
      });
      setPage(1);
      fetchExpenses();
      success("Expense logged successfully!");
    } catch (err: any) {
      error("Failed to log expense.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isPro) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="rounded-3xl border border-app bg-surface p-8 md:p-10 text-center shadow-sm">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="font-display text-3xl font-extrabold text-app tracking-tight">
            Expenses are available on Pro
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base font-medium text-muted">
            Basic covers your day-to-day shop operations. Pro adds expense tracking so you can see true net profit after operating costs.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/billing"
              className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5"
            >
              Upgrade to Pro
            </Link>
            <Link
              to="/"
              className="rounded-xl border border-app bg-app px-6 py-3 text-sm font-bold text-app transition-colors hover:bg-primary/5"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: "var(--color-text)" }}>
            Expenses
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            Track your shop's operational costs to calculate true net profit
          </p>
        </div>
        <button
          onClick={() => setFormVisible(true)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white whitespace-nowrap"
          style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-primary))" }}>
          + Log Expense
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 p-4 rounded-2xl sm:flex-row sm:items-center sm:justify-between"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end sm:flex-1">
          <DateInput
            label="From"
            value={dateFrom}
            onChange={(value) => {
              setDateFrom(value);
              setPage(1);
            }}
          />
          <span className="hidden sm:block text-center text-sm font-medium pb-2.5" style={{ color: "var(--color-muted)" }}>to</span>
          <DateInput
            label="To"
            value={dateTo}
            onChange={(value) => {
              setDateTo(value);
              setPage(1);
            }}
          />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
            className="w-full text-sm px-3 py-2 rounded-lg sm:w-auto" style={{ color: "var(--color-muted)" }}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Expenses Table */}
      <div className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        {loading ? (
          <div className="p-8 text-center" style={{ color: "var(--color-muted)" }}>Loading expenses...</div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "var(--color-bg)" }}>
              <span className="text-2xl">💸</span>
            </div>
            <p className="font-medium" style={{ color: "var(--color-text)" }}>No expenses logged</p>
            <p className="text-sm mt-1 max-w-sm mx-auto" style={{ color: "var(--color-muted)" }}>
              Log rent, salaries, and utility bills here to get accurate profit numbers on your dashboard.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y md:hidden" style={{ borderColor: "var(--color-border)" }}>
              {expenses.map((expense) => (
                <div key={expense.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold break-words" style={{ color: "var(--color-text)" }}>
                        {expense.description || expense.category_display}
                      </p>
                      <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                        {new Date(expense.date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-red-600 dark:text-red-400">
                      -{fmt(expense.amount)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                        Category
                      </p>
                      <span
                        className="mt-1 inline-flex items-center px-2 py-1 rounded-md text-xs font-medium"
                        style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                      >
                        {expense.category_display}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                        Logged By
                      </p>
                      <p className="mt-1 font-medium break-words" style={{ color: "var(--color-text)" }}>
                        {expense.logged_by_name}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>Date</th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>Category</th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>Description</th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>Logged By</th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-widetext-right" style={{ color: "var(--color-muted)" }}>Amount</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200"
                  style={{ backgroundColor: "var(--color-surface)" }}>
                  {expenses.map((expense) => (
                    <tr key={expense.id} className="transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                      <td className="px-5 py-4 text-sm" style={{ color: "var(--color-text)" }}>
                        {new Date(expense.date).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium"
                          style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                          {expense.category_display}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm max-w-xs truncate" style={{ color: "var(--color-text)" }}>
                        {expense.description}
                      </td>
                      <td className="px-5 py-4 text-sm" style={{ color: "var(--color-muted)" }}>
                        {expense.logged_by_name}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-right text-red-600 dark:text-red-400">
                        -{fmt(expense.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <Pagination count={count} page={page} onChange={setPage} pageSize={20} />

      {/* Log Expense Modal */}
      {formVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-md rounded-2xl shadow-xl flex flex-col"
            style={{ 
              backgroundColor: "var(--color-surface)", 
              border: "1px solid var(--color-border)",
              maxHeight: "calc(100svh - 2rem)"
            }}>
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
              style={{ borderColor: "var(--color-border)" }}>
              <h2 className="font-display font-bold text-base" style={{ color: "var(--color-text)" }}>
                Log Expense
              </h2>
              <button onClick={() => setFormVisible(false)} style={{ color: "var(--color-muted)" }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
                    Amount (₦)
                  </label>
                  <input required type="number" step="0.01" min="0"
                    value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                  {formData.amount && (
                    <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--color-primary)" }}>
                      Preview: ₦{Number(formData.amount).toLocaleString("en-NG")}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
                    Date
                  </label>
                  <input required type="date"
                    value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
                  Category
                </label>
                <select required
                  value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none appearance-none cursor-pointer" style={inputStyle}>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
                  Description / Note
                </label>
                <textarea required rows={3} placeholder="E.g. Monthly electricity bill"
                  value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none" style={inputStyle} />
              </div>

              <div className="pt-2">
                <button type="submit" disabled={submitting}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity"
                  style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-primary))", opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? "Saving..." : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
