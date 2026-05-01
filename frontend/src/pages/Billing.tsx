import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import ConfirmModal from "../components/ConfirmModal";
import { getApiErrorMessage } from "../utils/http";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Plan {
  id: number;
  name: string;
  description: string;
  price: string;
  interval: "monthly" | "yearly";
  features: string[];
  max_users: number;
  max_products: number;
  is_active: boolean;
}

interface Subscription {
  id: number;
  plan: Plan;
  pending_plan?: Plan | null;
  status: "active" | "inactive" | "cancelled" | "trial" | "pending";
  current_period_start: string;
  current_period_end: string;
  pending_checkout_started_at?: string | null;
  has_pending_checkout?: boolean;
  created_at: string;
}

interface PaymentHistory {
  id: number;
  amount: string;
  paystack_reference: string;
  paid_at: string;
  plan_name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number | string) =>
  `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

const formatLimit = (value: number, noun: string) =>
  value >= 999 ? `Unlimited ${noun}` : `Up to ${value} ${noun}`;

function StatusBadge({ status, planName }: { status: string; planName?: string | null }) {
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    active:    { bg: "#dcfce7", text: "#166534", label: "Active" },
    trial:     { bg: "#e0f2fe", text: "#0369a1", label: "30-Day Pro Trial" },
    inactive:  { bg: "#f1f5f9", text: "#475569", label: "Inactive" },
    cancelled: { bg: "#fef2f2", text: "#dc2626", label: "Cancelled" },
    success:   { bg: "#dcfce7", text: "#166534", label: "Success" },
    failed:    { bg: "#fef2f2", text: "#dc2626", label: "Failed" },
    pending:   { bg: "#fef9c3", text: "#854d0e", label: "Pending" },
  };
  const c = cfg[status] || cfg.inactive;
  const label = status === "active" && planName ? `${planName} Active` : c.label;
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ backgroundColor: c.bg, color: c.text }}>
      {label}
    </span>
  );
}

// ── Plan Card ─────────────────────────────────────────────────────────────────
function PlanCard({ plan, current, onSelect, loading, disabledReason, monthlyPlan }: {
  plan: Plan;
  current: Subscription | null;
  onSelect: (plan: Plan) => void;
  loading: boolean;
  disabledReason?: string | null;
  monthlyPlan?: Plan;
}) {
  const isCurrentPlan = current?.plan?.id === plan.id;
  const isActive = current?.status === "active" || current?.status === "trial";
  const isBlocked = !isCurrentPlan && !!disabledReason;

  let discountBadge = null;
  if (plan.interval === "yearly" && monthlyPlan) {
    const monthlyPrice = parseFloat(monthlyPlan.price);
    const yearlyPrice = parseFloat(plan.price);
    if (monthlyPrice > 0 && yearlyPrice < monthlyPrice * 12) {
      const discount = Math.round(((monthlyPrice * 12 - yearlyPrice) / (monthlyPrice * 12)) * 100);
      discountBadge = (
        <div className="absolute -top-3 right-4">
          <span className="px-3 py-1 rounded-full text-xs font-bold text-white bg-green-500 shadow-sm">
            Save {discount}%
          </span>
        </div>
      );
    }
  }

  return (
    <div className="rounded-2xl p-6 flex flex-col gap-4 transition-all"
      style={{
        backgroundColor: "var(--color-surface)",
        border: `2px solid ${isCurrentPlan ? "var(--color-primary)" : "var(--color-border)"}`,
        position: "relative",
      }}>

      {/* Current plan badge */}
      {isCurrentPlan && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 rounded-full text-xs font-bold text-white bg-primary shadow-sm">
            Current Plan
          </span>
        </div>
      )}
      
      {discountBadge}

      <div>
        <h3 className="font-display font-bold text-lg" style={{ color: "var(--color-text)" }}>
          {plan.name}
        </h3>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          {plan.description}
        </p>
      </div>

      <div className="flex items-end gap-1">
        <span className="font-display font-bold text-3xl" style={{ color: "var(--color-text)" }}>
          {fmt(plan.price)}
        </span>
        <span className="text-sm mb-1" style={{ color: "var(--color-muted)" }}>
          / {plan.interval}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)" }}
        >
          {formatLimit(plan.max_users, "team members")}
        </span>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)" }}
        >
          {formatLimit(plan.max_products, "products")}
        </span>
      </div>

      {/* Features */}
      <ul className="space-y-2 flex-1">
        {(plan.features || []).map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm"
            style={{ color: "var(--color-text)" }}>
            <svg className="w-4 h-4 text-green-500 shrink-0 mt-0.5" fill="none"
              stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={() => onSelect(plan)}
        disabled={loading || isCurrentPlan && isActive || isBlocked}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
        style={{
          background: isCurrentPlan && isActive || isBlocked
            ? "var(--color-border)"
            : "linear-gradient(135deg, var(--color-primary), var(--color-primary))",
          color: isCurrentPlan && isActive || isBlocked ? "var(--color-muted)" : "white",
          cursor: isCurrentPlan && isActive || isBlocked ? "not-allowed" : "pointer",
        }}>
        {loading ? "Processing..." :
          isCurrentPlan && isActive ? "Current Plan" :
          isBlocked ? "Unavailable" :
          isCurrentPlan ? "Renew Plan" :
          "Pay Now"}
      </button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Billing() {
  const { user, isTrial, trialDaysLeft, hasActiveSubscription, subscriptionPlan } = useAuth();
  const isAdmin = user?.role === "admin";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<PaymentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingPlanId, setPayingPlanId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancellingPendingCheckout, setCancellingPendingCheckout] = useState(false);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [plansRes, subRes, paymentsRes] = await Promise.all([
        api.get("/subscriptions/plans/"),
        api.get("/subscriptions/current/"),
        api.get("/subscriptions/payments/"),
      ]);
      setPlans(plansRes.data.results || plansRes.data);
      setSubscription(subRes.data?.status === "no_subscription" ? null : subRes.data);
      setPayments(paymentsRes.data.results || paymentsRes.data);
    } catch {
      // subscription might not exist yet — that's fine
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // Handle Paystack redirect
    useEffect(() => {
    const status = searchParams.get("status");
    if (status === "success") {
        setToast({ message: "Payment successful! Your subscription is now active.", type: "success" });
        setSearchParams({});  // clear query param
        fetchAll();           // refresh subscription data
    } else if (status === "cancelled") {
        setToast({ message: "That checkout was cancelled before activation. Your active plan was left unchanged.", type: "error" });
        setSearchParams({});
        fetchAll();
    } else if (status === "pending") {
        setToast({ message: "Payment received. We are confirming your subscription...", type: "success" });
    } else if (status === "failed") {
        setToast({ message: "Payment failed or was cancelled. Please try again.", type: "error" });
        setSearchParams({});
    }
    }, []);

    // Auto-dismiss toast
    useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
    }, [toast]);

  const handleSelectPlan = async (plan: Plan) => {
    if (!isAdmin) return;
    setPayingPlanId(plan.id);
    setError("");
    try {
      const { data } = await api.post("/subscriptions/initialize/", { plan_id: plan.id });
      // Redirect to Paystack checkout
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to initialize payment."));
    } finally {
      setPayingPlanId(null);
    }
  };

  const handleCancelClick = () => {
    setShowCancelConfirm(true);
  };

  const executeCancel = async () => {
    setCancelling(true);
    setError("");
    setShowCancelConfirm(false);
    try {
      await api.post("/subscriptions/cancel/");
      fetchAll();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to cancel subscription."));
    } finally {
      setCancelling(false);
    }
  };

  const handleCancelPendingCheckout = async () => {
    setCancellingPendingCheckout(true);
    setError("");
    try {
      await api.post("/subscriptions/cancel-checkout/");
      setToast({ message: "Pending checkout cancelled. Your current plan stays the same.", type: "success" });
      fetchAll();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to cancel pending checkout."));
    } finally {
      setCancellingPendingCheckout(false);
    }
  };

  const isActive = subscription?.status === "active" || hasActiveSubscription;
  const isTrialOnly = isTrial && !hasActiveSubscription && !subscription;
  const isInTrial = isTrialOnly || subscription?.status === "trial";
  const hasPendingCheckout = !!subscription?.has_pending_checkout && !!subscription?.pending_plan;
  const hasBlockingPaidSubscription = !!subscription?.plan && hasActiveSubscription && !isTrialOnly;
  const currentPeriodEndsLabel = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;
  const planSelectionBlockedReason = hasPendingCheckout
    ? `Complete or cancel the pending ${subscription?.pending_plan?.name || "plan"} checkout first.`
    : hasBlockingPaidSubscription
      ? subscription?.status === "cancelled"
        ? `Your ${subscription?.plan?.name || "current"} subscription remains active until ${currentPeriodEndsLabel || "the end of this billing period"}. You can choose a new plan after that date.`
        : `Your ${subscription?.plan?.name || "current"} subscription is active until ${currentPeriodEndsLabel || "the end of this billing period"}. Cancel it first to stop future renewals, then choose a new plan after the current billing period ends.`
      : null;

  const daysLeft = isActive && subscription?.current_period_end
    ? Math.max(0, Math.ceil(
        (new Date(subscription.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ))
    : isTrialOnly ? trialDaysLeft : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold" style={{ color: "var(--color-text)" }}>
          Billing & Subscription
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Manage your plan, limits, and payment history
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm text-red-600"
          style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}

      {/* Toast notification */}
        {toast && (
        <div
            className="fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl
            text-sm font-medium transition-all"
            style={{
            backgroundColor: toast.type === "success" ? "#dcfce7" : "#fef2f2",
            border: `1px solid ${toast.type === "success" ? "#86efac" : "#fecaca"}`,
            color: toast.type === "success" ? "#166534" : "#dc2626",
            }}>
            {toast.type === "success" ? (
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            ) : (
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            )}
            {toast.message}
            <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            </button>
        </div>
        )}

      {/* Current subscription status */}
      {(subscription || isTrialOnly) && (
        <div className="rounded-2xl p-6"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          {hasPendingCheckout && (
            <div
              className="mb-5 rounded-2xl border px-4 py-4"
              style={{ backgroundColor: "#fff7ed", borderColor: "#fdba74" }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#9a3412" }}>
                    Checkout in progress for {subscription?.pending_plan?.name}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "#9a3412" }}>
                    Cancel this if you opened Paystack but decided not to finish the upgrade. This only abandons the pending checkout attempt and keeps your current plan unchanged.
                  </p>
                </div>
                <button
                  onClick={handleCancelPendingCheckout}
                  disabled={cancellingPendingCheckout}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: "#c2410c" }}
                >
                  {cancellingPendingCheckout ? "Cancelling..." : "Cancel Pending Checkout"}
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="font-display font-bold text-lg" style={{ color: "var(--color-text)" }}>
                  {subscription?.plan?.name || subscriptionPlan}
                </h2>
                <StatusBadge
                  status={isActive ? "active" : isTrialOnly ? "trial" : subscription?.status || "inactive"}
                  planName={subscription?.plan?.name || subscriptionPlan}
                />
              </div>

              {isTrialOnly && (
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                  Your shop is currently on a 30-day free Pro trial. Choose Basic for core tools or Pro for advanced features before it ends.
                </p>
              )}

              <div className="flex flex-wrap gap-4 text-sm">
                {subscription?.current_period_start && !isTrialOnly && (
                  <div>
                    <span style={{ color: "var(--color-muted)" }}>Started </span>
                    <span className="font-medium" style={{ color: "var(--color-text)" }}>
                      {new Date(subscription.current_period_start).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {subscription?.current_period_end && !isTrialOnly && (
                  <div className="flex items-center gap-2">
                    <span style={{ color: "var(--color-muted)" }}>
                      {isActive ? "Auto-renews on " : "Ended on "}
                    </span>
                    <span className="font-medium" style={{ color: "var(--color-text)" }}>
                      {new Date(subscription.current_period_end).toLocaleDateString()}
                    </span>
                    {isActive && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                        style={{ backgroundColor: "#dcfce7", color: "#166534" }}>
                        Auto-renew ON
                      </span>
                    )}
                  </div>
                )}
                {daysLeft !== null && (daysLeft <= 7) && (
                  <span className="font-semibold text-amber-600">
                    ⚠️ {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
                  </span>
                )}
              </div>

              {/* Trial progress bar */}
              {isInTrial && daysLeft !== null && (
                <div className="w-64">
                  <div className="flex justify-between text-xs mb-1"
                    style={{ color: "var(--color-muted)" }}>
                    <span>Trial progress</span>
                    <span>{daysLeft} days left</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden"
                    style={{ backgroundColor: "var(--color-border)" }}>
                    <div className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, ((30 - daysLeft) / 30) * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Cancel button */}
            {isAdmin && isActive && !isInTrial && (
              <button onClick={handleCancelClick} disabled={cancelling}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-red-600 shrink-0 transition-colors"
                style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
                {cancelling ? "Processing..." : "Turn off auto-renew"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Non-admin notice */}
      {!isAdmin && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{
            backgroundColor: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "var(--color-primary)",
          }}>
          Only the shop admin can manage billing. Contact your admin to upgrade or change the plan.
        </div>
      )}

      {/* Plans */}
      <div>
        <h2 className="font-display font-bold text-lg mb-4" style={{ color: "var(--color-text)" }}>
          Available Plans
        </h2>
        
        {/* Monthly/Yearly Toggle */}
        {plans.some(p => p.interval === "yearly") && (
          <div className="flex justify-center mb-8">
            <div className="flex items-center p-1 rounded-xl" style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
              <button
                onClick={() => setBillingInterval("monthly")}
                className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${billingInterval === "monthly" ? "shadow-sm" : "opacity-60"}`}
                style={{ 
                  backgroundColor: billingInterval === "monthly" ? "var(--color-surface)" : "transparent",
                  color: billingInterval === "monthly" ? "var(--color-primary)" : "var(--color-text)"
                }}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval("yearly")}
                className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${billingInterval === "yearly" ? "shadow-sm" : "opacity-60"}`}
                style={{ 
                  backgroundColor: billingInterval === "yearly" ? "var(--color-surface)" : "transparent",
                  color: billingInterval === "yearly" ? "var(--color-primary)" : "var(--color-text)"
                }}
              >
                Yearly
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 uppercase tracking-wider hidden sm:inline-block">Save</span>
              </button>
            </div>
          </div>
        )}

        <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>
          Basic keeps your shop running with core inventory, sales, customer, and repair tools. Pro adds premium controls like expenses, custom sale items, discounts, and advanced automation.
        </p>
        {planSelectionBlockedReason && (
          <div
            className="mb-4 rounded-2xl border px-4 py-3 text-sm"
            style={{ backgroundColor: "#fff7ed", borderColor: "#fdba74", color: "#9a3412" }}
          >
            {planSelectionBlockedReason}
          </div>
        )}
        {plans.filter(p => p.interval === billingInterval).length === 0 ? (
          <div className="flex items-center justify-center h-32 rounded-2xl"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>No {billingInterval} plans available</p>
          </div>
        ) : (
          <div className={`grid gap-6 ${
            plans.filter(p => p.interval === billingInterval).length === 1 ? "grid-cols-1 max-w-sm" :
            plans.filter(p => p.interval === billingInterval).length === 2 ? "grid-cols-1 sm:grid-cols-2" :
            "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          }`}>
            {plans.filter(p => p.interval === billingInterval).map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                current={subscription}
                onSelect={handleSelectPlan}
                loading={payingPlanId === plan.id}
                disabledReason={planSelectionBlockedReason}
                monthlyPlan={plans.find(p => p.interval === "monthly" && p.max_users === plan.max_users && p.max_products === plan.max_products)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Payment history */}
      <div>
        <h2 className="font-display font-bold text-lg mb-4" style={{ color: "var(--color-text)" }}>
          Payment History
        </h2>
        <div className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          {payments.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>No payments yet</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {["Date", "Plan", "Amount", "Reference"].map((h) => (
                      <th key={h}
                        className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide"
                        style={{ color: "var(--color-muted)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment, i) => (
                    <tr key={payment.id}
                      style={{
                        borderBottom: i < payments.length - 1
                          ? "1px solid var(--color-border)" : "none"
                      }}>
                      <td className="px-5 py-4 text-sm" style={{ color: "var(--color-muted)" }}>
                        {new Date(payment.paid_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium" style={{ color: "var(--color-text)" }}>
                        {payment.plan_name}
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-primary">
                        {fmt(payment.amount)}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-mono px-2 py-1 rounded-lg"
                          style={{
                            backgroundColor: "var(--color-bg)",
                            color: "var(--color-muted)",
                          }}>
                          {payment.paystack_reference}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={showCancelConfirm}
        title="Turn off auto-renewal"
        message="This will stop your subscription from automatically renewing. Your current paid period will remain active until the end of the billing cycle."
        confirmText="Yes, turn it off"
        onConfirm={executeCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </div>
  );
}
