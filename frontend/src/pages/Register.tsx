import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import api from "../api/axios";
import { PasswordInput } from "../components/PasswordInput";
import { PublicLegalLinks } from "../components/PublicLegalLinks";
import { parseApiErrors } from "../utils/http";
import { consumePostAuthRedirect } from "../utils/navigation";

export default function Register() {
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    shop_name: "", shop_phone: "", shop_address: "",
    first_name: "", last_name: "", email: "",
    password: "", confirm_password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: "" });
  };

  const handleNext = () => {
    const newErrors: Record<string, string> = {};
    if (!form.shop_name) newErrors.shop_name = "Shop name is required";
    const phoneRegex = /^(\+\d{1,3}\s?)?\d{10,11}$/;
    if (!form.shop_phone) {
      newErrors.shop_phone = "Phone is required";
    } else if (!phoneRegex.test(form.shop_phone)) {
      newErrors.shop_phone = "Phone must be exactly 10 or 11 digits (with optional country code, e.g., +234)";
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register/", form);
      login(data.user);
      navigate(consumePostAuthRedirect("/"), { replace: true });
    } catch (err: unknown) {
      const parsed = parseApiErrors(err, "Registration failed. Please try again.");
      setErrors(
        Object.keys(parsed.fieldErrors).length > 0
          ? parsed.fieldErrors
          : { general: parsed.nonFieldError || "Registration failed. Please try again." },
      );
      if (parsed.fieldErrors.shop_name || parsed.fieldErrors.shop_phone) {
        setStep(1);
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (name: string) => `
    w-full px-4 py-3 rounded-xl text-sm outline-none transition-all
    ${errors[name] ? "border-red-400" : ""}
  `;

  const inputStyle = {
    backgroundColor: "var(--color-surface)",
    border: `1px solid ${errors ? "var(--color-border)" : "var(--color-border)"}`,
    color: "var(--color-text)",
  };

  return (
    <>
      <Helmet>
        <title>Register — Giztrack</title>
        <meta name="description" content="Create a new Giztrack account to start managing your tech shop." />
      </Helmet>
    <div className="h-screen flex overflow-hidden" style={{ backgroundColor: "var(--color-bg)" }}>

      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden h-screen"
        style={{ backgroundColor: "var(--color-sidebar)" }}>
        <div className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 30% 50%, #1e3a8a33 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, var(--color-primary)22 0%, transparent 50%)"
          }}
        />
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px"
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="Giztrack logo" className="w-10 h-10 rounded-xl" />
            <span className="text-primary font-display font-bold text-lg">Giztrack</span>
          </div>

          <div>
            <h2 className="font-display text-4xl font-bold text-primary leading-tight mb-4">
              Your shop,<br />
              <span className="text-accent">fully in control.</span>
            </h2>
            <p className="text-slate-400 text-base leading-relaxed max-w-sm">
              Join hundreds of tech shops managing inventory, repairs and sales with ease.
            </p>

            <div className="mt-10 space-y-4">
              {[
                { icon: "✓", text: "30-day free trial, no credit card required" },
                { icon: "✓", text: "Unlimited repairs and sales tracking" },
                { icon: "✓", text: "Real-time inventory and low stock alerts" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-secondary-dark text-white text-xs flex items-center justify-center font-bold shrink-0">
                    {item.icon}
                  </span>
                  <span className="text-slate-400 text-sm">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-slate-600 text-sm">© 2026 Giztrack</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col px-6 sm:px-12 lg:px-16 xl:px-24 relative h-screen overflow-y-auto">

        {/* Theme toggle */}
        <div className="absolute top-6 right-6 z-20">
          <button onClick={toggleTheme}
            className="p-2 rounded-lg transition-colors"
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
        </div>

        <div className="w-full max-w-md mx-auto my-auto py-12">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <img src="/favicon.png" alt="Giztrack logo" className="w-9 h-9 rounded-xl" />
            <span className="font-display font-bold text-base" style={{ color: "var(--color-primary)" }}>
              Giztrack
            </span>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-8">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step === s
                    ? "bg-primary text-white"
                    : step > s
                      ? "bg-green-500 text-white"
                      : "text-slate-400"
                  }`}
                  style={step !== s && step <= s ? { backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" } : {}}>
                  {step > s ? "✓" : s}
                </div>
                <span className="text-xs font-medium" style={{ color: step === s ? "var(--color-text)" : "var(--color-muted)" }}>
                  {s === 1 ? "Shop Info" : "Your Details"}
                </span>
                {s < 2 && <div className="w-8 h-px mx-1" style={{ backgroundColor: "var(--color-border)" }} />}
              </div>
            ))}
          </div>

          <h1 className="font-display text-3xl font-bold mb-2" style={{ color: "var(--color-accent)" }}>
            {step === 1 ? "Set up your shop" : "Create your account"}
          </h1>
          <p className="text-sm mb-8" style={{ color: "var(--color-muted)" }}>
            {step === 1 ? "Tell us about your business" : "You'll use these to sign in"}
          </p>

          {errors.general && (
            <div className="mb-6 p-4 rounded-xl text-sm"
              style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}>
              {errors.general}
            </div>
          )}

          {step === 1 ? (
            <div className="space-y-5">
              {[
                { label: "Shop Name", name: "shop_name", placeholder: "Samuel Tech Store" },
                { label: "Phone Number", name: "shop_phone", placeholder: "+234901234567 or 901234567" },
                { label: "Address (optional)", name: "shop_address", placeholder: "12 Lagos Street, Ikeja" },
              ].map(({ label, name, placeholder }) => (
                <div key={name}>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
                    {label}
                  </label>
                  <input
                    type="text"
                    name={name}
                    value={form[name as keyof typeof form]}
                    onChange={handleChange}
                    placeholder={placeholder}
                    className={inputClass(name)}
                    style={inputStyle}
                  />
                  {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]}</p>}
                </div>
              ))}

              <button onClick={handleNext}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white mt-4 transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
                style={{ background: "var(--color-primary)" }}>
                Continue →
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "First Name", name: "first_name", placeholder: "Samuel" },
                  { label: "Last Name", name: "last_name", placeholder: "Adebayo" },
                ].map(({ label, name, placeholder }) => (
                  <div key={name}>
                    <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
                      {label}
                    </label>
                    <input
                      type="text"
                      name={name}
                      value={form[name as keyof typeof form]}
                      onChange={handleChange}
                      placeholder={placeholder}
                      className={inputClass(name)}
                      style={inputStyle}
                    />
                    {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]}</p>}
                  </div>
                ))}
              </div>

              {[
                { label: "Email", name: "email", type: "email", placeholder: "samuel@techstore.com" },
              ].map(({ label, name, type, placeholder }) => (
                <div key={name}>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
                    {label}
                  </label>
                  <input
                    type={type}
                    name={name}
                    value={form[name as keyof typeof form]}
                    onChange={handleChange}
                    placeholder={placeholder}
                    className={inputClass(name)}
                    style={inputStyle}
                  />
                  {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]}</p>}
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
                  Password
                </label>
                <PasswordInput
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Min. 8 characters"
                  className={errors.password ? "border-red-400" : ""}
                  style={inputStyle}
                />
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
                  Confirm Password
                </label>
                <PasswordInput
                  name="confirm_password"
                  value={form.confirm_password}
                  onChange={handleChange}
                  placeholder="Repeat password"
                  className={errors.confirm_password ? "border-red-400" : ""}
                  style={inputStyle}
                />
                {errors.confirm_password && <p className="text-red-500 text-xs mt-1">{errors.confirm_password}</p>}
              </div>

              <div className="flex gap-4 pt-4 pb-2">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all hover:bg-slate-50 dark:hover:bg-slate-800 hover:-translate-y-0.5 active:scale-[0.98]"
                  style={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}>
                  ← Back
                </button>
                <button type="submit" disabled={loading}
                  className="flex-2 grow py-3 rounded-xl text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
                  style={{
                    background: loading ? "var(--color-accent)" : "var(--color-primary)",
                    cursor: loading ? "not-allowed" : "pointer",
                  }}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating shop...
                    </span>
                  ) : "Create Shop"}
                </button>
              </div>
            </form>
          )}

          <p className="text-center text-sm mt-8" style={{ color: "var(--color-muted)" }}>
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-primary hover:text-accent transition-colors">
              Sign in
            </Link>
          </p>

          <PublicLegalLinks />
        </div>
      </div>
    </div>
    </>
  );
}
