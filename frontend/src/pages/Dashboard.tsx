import { lazy, Suspense, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../context/AuthContext";
import type { DashboardStats } from "../types";
import api from "../api/axios";
import ProFeatureOverlay from "../components/ProFeatureOverlay";
import { DashboardSkeleton } from "../components/LoadingFallbacks";
import { getApiErrorMessage } from "../utils/http";

interface TrendData {
  period: string;
  revenue: number;
  net_profit: number;
}

const DashboardRevenueChart = lazy(() => import("../components/charts/DashboardRevenueChart"));

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
}

function StatCard({ label, value, sub, icon, trend }: StatCardProps) {
  return (
    <div className="rounded-3xl p-6 flex flex-col gap-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        boxShadow: "0 8px 30px -12px rgba(0,0,0,0.08)"
      }}>
      <div className="flex items-start justify-between relative z-10">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/10 text-primary shrink-0">
          {icon}
        </div>
        {trend && (
          <span className={`text-xs font-black px-2.5 py-1 rounded-full shrink-0 ${
            trend === "up" ? "text-green-700 bg-green-100 dark:bg-green-900/30" :
            trend === "down" ? "text-red-700 bg-red-100 dark:bg-red-900/30" :
            "text-slate-600 bg-slate-100 dark:bg-slate-800"
          }`}>
            {trend === "up" ? "↗" : trend === "down" ? "↘" : "—"}
          </span>
        )}
      </div>
      <div className="relative z-10 mt-1 min-w-0">
        <p className="font-display font-extrabold text-app tracking-tight leading-tight wrap-break-word"
          style={{ fontSize: "clamp(1.25rem, 3vw, 1.875rem)" }}>
          {value}
        </p>
        <p className="text-sm font-semibold mt-1.5 text-muted">
          {label}
        </p>
        {sub && (
          <p className="text-xs font-medium mt-1 opacity-70 text-muted">{sub}</p>
        )}
      </div>
    </div>
  );
}

function RepairStatusBadge({ status, count }: { status: string; count: number }) {
  const colors: Record<string, { bg: string; text: string }> = {
    received: { bg: "#e0f2fe", text: "#0369a1" },
    diagnosing: { bg: "#fef9c3", text: "#854d0e" },
    waiting_parts: { bg: "#fce7f3", text: "#9d174d" },
    fixed: { bg: "#dcfce7", text: "#166534" },
    collected: { bg: "#f1f5f9", text: "#475569" },
  };
  const c = colors[status] || { bg: "#f1f5f9", text: "#475569" };
  const label = status.replace("_", " ");

  return (
    <div className="flex items-center justify-between px-5 py-3.5 rounded-2xl transition-all"
      style={{ backgroundColor: c.bg }}>
      <span className="text-sm font-bold capitalize" style={{ color: c.text }}>{label}</span>
      <span className="text-sm font-black bg-white/40 px-3 py-1 rounded-lg" style={{ color: c.text }}>{count}</span>
    </div>
  );
}

export default function Dashboard() {
  const { user, isPro } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fmt = (n: number) =>
    `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  useEffect(() => {
    if (!user) {
      return;
    }

    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const fromDate = toDateInputValue(lastWeek);
    const toDate = toDateInputValue(today);
    const canViewSalesTrends = (user.role === "admin" || user.role === "staff") && isPro;

    setLoading(true);
    setError("");

    Promise.allSettled([
      api.get("/reports/dashboard/"),
      canViewSalesTrends
        ? api.get("/reports/sales/", {
            params: { period: "daily", from: fromDate, to: toDate },
          })
        : Promise.resolve(null),
    ])
      .then(([dashResult, trendsResult]) => {
        if (dashResult.status !== "fulfilled") {
          setError(getApiErrorMessage(dashResult.reason, "Failed to load dashboard data."));
          return;
        }

        setStats(dashResult.value.data);

        if (trendsResult.status === "fulfilled" && trendsResult.value) {
          setTrends(trendsResult.value.data.breakdown || []);
        } else {
          setTrends([]);
        }
      })
      .catch((err) => setError(getApiErrorMessage(err, "Failed to load dashboard data.")))
      .finally(() => setLoading(false));
  }, [user, isPro]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="bg-red-50 text-red-600 px-6 py-4 rounded-2xl font-bold flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Dashboard — Giztrack</title>
        <meta name="description" content="View your shop's performance, recent sales, and pending repairs at a glance." />
      </Helmet>
      <div className="space-y-6 animate-in fade-in slide-in-bottom-4 duration-500 pb-20 lg:pb-0">

      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-app tracking-tight">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
            <span className="text-primary">{user?.first_name}</span>
          </h1>
          <p className="text-base font-medium mt-1 text-muted">
            Here's what is happening with your shop today.
          </p>
        </div>
        <div className="px-4 py-2 bg-surface border border-app rounded-xl shadow-sm text-sm font-bold text-muted flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          Live Workspace
        </div>
      </div>

      {/* Stat Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard
          label="Today's Cash In"
          value={fmt(stats?.sales_today.cash_received || 0)}
          sub={`${stats?.sales_today.payment_count || 0} payment(s) collected`}
          trend="up"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Today's Realized Profit"
          value={fmt(stats?.sales_today.profit || 0)}
          sub={`${stats?.sales_today.count || 0} sale(s) booked today`}
          trend="up"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
        <StatCard
          label="Active Repairs"
          value={stats?.repairs.active || 0}
          sub={`${stats?.repairs.completed_today || 0} completed today`}
          trend="neutral"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label="Low Stock Items"
          value={stats?.inventory.low_stock_count || 0}
          sub={`out of ${stats?.inventory.total_products || 0} products`}
          trend={stats?.inventory.low_stock_count ? "down" : "neutral"}
          icon={
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* 7-Day Trend Chart */}
      <ProFeatureOverlay featureName="Advanced Graphical Analytics">
      <div className="bg-surface border-app border rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8 relative z-10">
          <div>
            <h2 className="font-display font-extrabold text-xl text-app">7-Day Sales Trend</h2>
            <p className="text-sm font-medium text-muted mt-1">Booked sales and net profit by sale date</p>
          </div>
          <div className="bg-primary/10 text-primary font-bold px-4 py-2 rounded-xl text-sm border border-primary/20">
            Last 7 Days
          </div>
        </div>
        
        <Suspense
          fallback={
            <div
              className="h-[320px] w-full rounded-2xl animate-pulse"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-border) 72%, transparent)" }}
            />
          }
        >
          <DashboardRevenueChart trends={trends} role={user?.role} />
        </Suspense>
      </div>

      </ProFeatureOverlay>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Lifetime revenue */}
        <div className="bg-surface border-app border rounded-3xl p-8 shadow-sm flex flex-col justify-between group hover:border-primary/50 transition-colors">
          <div>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 mb-6">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
            </div>
            <h2 className="font-display font-bold text-xl text-app mb-2">Lifetime Revenue</h2>
            <p className="font-display text-5xl font-extrabold text-primary tracking-tighter">
              {fmt(stats?.revenue_all_time || 0)}
            </p>
            <p className="text-sm font-medium mt-3 text-muted">
              Total sales value recorded since shop creation
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-app">
            <div className="rounded-2xl p-4 bg-amber-50 border border-amber-200">
              <div className="flex items-center justify-between gap-4 mb-3">
                <span className="text-sm font-semibold text-amber-900">Outstanding Credit</span>
                <span className="text-sm font-bold text-amber-700">
                  {fmt(stats?.credit.outstanding || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-amber-800/80">Customers owing</span>
                <span className="font-bold text-amber-700">{stats?.credit.customers_with_balance || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="font-medium text-amber-800/80">Unpaid credit sales</span>
                <span className="font-bold text-amber-700">{stats?.credit.sales_with_balance || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Repairs by status */}
        <div className="bg-surface border-app border rounded-3xl p-8 shadow-sm">
          <h2 className="font-display font-extrabold text-xl text-app mb-6">Repair Load by Status</h2>
          {stats?.repairs.by_status && Object.keys(stats.repairs.by_status).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.repairs.by_status).map(([status, count]) => (
                <RepairStatusBadge key={status} status={status} count={count} />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 bg-app rounded-2xl border border-dashed border-app">
              <p className="font-medium text-muted">No tickets currently logged.</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
