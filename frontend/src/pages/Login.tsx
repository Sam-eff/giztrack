import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import api from "../api/axios";
import { PasswordInput } from "../components/PasswordInput";
import { PublicLegalLinks } from "../components/PublicLegalLinks";
import { getApiErrorMessage } from "../utils/http";
import { consumePostAuthRedirect } from "../utils/navigation";

export default function Login() {
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login/", form);
      login(data.user);
      navigate(consumePostAuthRedirect("/dashboard"), { replace: true });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Invalid email or password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Login — Giztrack</title>
        <meta name="description" content="Sign in to your Giztrack account to manage your tech shop." />
      </Helmet>
    <div className="min-h-screen flex" style={{ backgroundColor: "var(--color-bg)" }}>

      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden"
        style={{ backgroundColor: "var(--color-sidebar)" }}>
        <div className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 30% 50%, #1e3a8a33 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, var(--color-primary)22 0%, transparent 50%)"
          }}
        />
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px"
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="Giztrack logo" className="w-10 h-10 rounded-xl" />
            <span className="text-primary font-display font-bold text-lg">Giztrack</span>
          </div>

          {/* Center content */}
          <div>
            <h2 className="font-display text-4xl font-bold text-primary leading-tight mb-4">
              Manage your shop<br />
              <span className="text-accent">like a pro.</span>
            </h2>
            <p className="text-slate-400 text-base leading-relaxed max-w-sm">
              Inventory, sales, repairs and customers — all in one place built for Nigerian tech shops.
            </p>

            {/* Stats */}
            <div className="mt-10 grid grid-cols-3 gap-4">
              {[
                { label: "Inventory", value: "Real-time" },
                { label: "Repairs", value: "Tracked" },
                { label: "Reports", value: "Instant" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl p-4"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="text-accent font-display font-bold text-sm">{s.value}</div>
                  <div className="text-slate-500 text-xs mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-slate-600 text-sm">© 2026 Giztrack</p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 xl:px-24 relative">

        {/* Theme toggle */}
        <button onClick={toggleTheme}
          className="absolute top-6 right-6 p-2 rounded-lg transition-colors"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          {isDark ? (
            <svg className="w-5 h-5" style={{ color: "var(--color-text)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" style={{ color: "var(--color-text)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        <div className="w-full max-w-md mx-auto">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <img src="/favicon.png" alt="Giztrack logo" className="w-9 h-9 rounded-xl" />
            <span className="font-display font-bold text-base" style={{ color: "var(--color-primary)" }}>
              Giztrack
            </span>
          </div>

          <h1 className="font-display text-3xl font-bold mb-2" style={{ color: "var(--color-accent)" }}>
            Welcome back
          </h1>
          <p className="text-sm mb-8" style={{ color: "var(--color-muted)" }}>
            Sign in to continue to your shop dashboard
          </p>

          {error && (
            <div className="mb-6 p-4 rounded-xl text-sm flex items-center gap-3"
              style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}>
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
                Email address
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--color-primary)"}
                onBlur={(e) => e.target.style.borderColor = "var(--color-border)"}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
                Password
              </label>
              <PasswordInput
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--color-primary)"}
                onBlur={(e) => e.target.style.borderColor = "var(--color-border)"}
                required
              />
            </div>

            <div className="flex justify-end">
              <Link to="/forgot-password"
                className="text-xs font-medium hover:underline"
                style={{ color: "var(--color-muted)" }}>
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
              style={{
                background: loading ? "var(--color-accent)" : "var(--color-primary)",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : "Sign in"}
            </button>
          </form>

          <p className="text-center text-sm mt-8" style={{ color: "var(--color-muted)" }}>
            Don't have an account?{" "}
            <Link to="/register" className="font-semibold text-primary hover:text-accent transition-colors">
              Register your shop
            </Link>
          </p>

          <PublicLegalLinks />
        </div>
      </div>
    </div>
    </>
  );
}
