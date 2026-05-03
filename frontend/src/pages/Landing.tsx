import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

/* ------------------------------------------------------------------ */
/*  Giztrack public landing page                                      */
/*  Design language: matches Login.tsx / Dashboard — same CSS vars,   */
/*  same fonts (Syne headings, DM Sans body), same border-radius.    */
/* ------------------------------------------------------------------ */

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  /* While the initial auth check resolves, show a brief spinner */
  if (isLoading) {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-bg)" }}>
        <div style={{ width: 40, height: 40, border: "4px solid var(--color-primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  /*
   * If the user is already authenticated, show a contextual CTA
   * ("Go to Dashboard") instead of "Get Started / Sign in".
   * We do NOT redirect — that caused redirect loops on Chrome
   * when cookies were stale or partially expired.
   */
  const isLoggedIn = isAuthenticated;

  /* ---------------------------------------------------------------- */
  /*  DATA                                                            */
  /* ---------------------------------------------------------------- */

  const features = [
    {
      title: "Inventory Management",
      desc: "Track every product, category, and variant. Get automatic low-stock alerts before you run out.",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
    },
    {
      title: "Point of Sale",
      desc: "Ring up walk-in sales in seconds. Auto-generate receipts and track daily revenue in real time.",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />,
    },
    {
      title: "Repair Ticketing",
      desc: "Log customer devices, assign technicians, track repair stages, and calculate costs automatically.",
      icon: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>,
    },
    {
      title: "SMS Notifications",
      desc: "Automatically text customers when their device is ready. Powered by Africa's Talking.",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />,
    },
    {
      title: "Analytics & Reports",
      desc: "Revenue charts, profit breakdowns, daily summaries — delivered to your dashboard and email.",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
    },
    {
      title: "Team & Access Control",
      desc: "Add staff with specific roles — admin, sales rep, or technician — and control what they can see.",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
    },
  ];

  const proFeatures = [
    "Unlimited products",
    "Automated SMS alerts",
    "Advanced analytics",
    "Unlimited staff",
    "Daily email reports",
    "Priority support",
  ];

  const freeFeatures = [
    "Up to 20 products",
    "Unlimited sales",
    "Basic repair tickets",
    "1 admin account",
  ];

  /* ---------------------------------------------------------------- */
  /*  Small helpers                                                   */
  /* ---------------------------------------------------------------- */
  const FeatureIcon = ({ children }: { children: React.ReactNode }) => (
    <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">{children}</svg>
  );

  const Check = ({ accent }: { accent?: boolean }) => (
    <svg style={{ width: 18, height: 18, color: accent ? "var(--color-accent)" : "var(--color-primary)", flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );

  /* ---------------------------------------------------------------- */
  /*  RENDER                                                          */
  /* ---------------------------------------------------------------- */
  return (
    <>
      <Helmet>
        <title>Giztrack — Manage your shop like a pro</title>
        <meta name="description" content="Inventory, sales, repairs and customer management for Nigerian tech shops. Start free." />
      </Helmet>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .landing-card { transition: box-shadow 0.3s, transform 0.3s; }
        .landing-card:hover { box-shadow: 0 12px 40px -12px rgba(0,0,0,0.12); transform: translateY(-2px); }
        .landing-cta { transition: opacity 0.2s, transform 0.15s; }
        .landing-cta:hover { opacity: 0.92; transform: translateY(-1px); }
        .landing-cta:active { transform: translateY(0); }
      `}</style>

      {/*
        position:fixed + inset:0 + overflow-y:auto bypasses any
        parent overflow:hidden on html / body / #root that blocks scrolling.
      */}
      <div style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
        WebkitOverflowScrolling: "touch",
      }}>

        {/* ======================================================== */}
        {/*  NAVBAR — mobile-responsive                               */}
        {/* ======================================================== */}
        <nav style={{
          position: "sticky", top: 0, zIndex: 50,
          backgroundColor: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
        }}>
          <div style={{
            maxWidth: 1100, marginInline: "auto",
            paddingInline: 16,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: 56,
          }}>
            {/* Left: Logo + theme toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <Link to="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "var(--color-primary)" }}>
                <img src="/favicon.png" alt="Giztrack" style={{ width: 28, height: 28, borderRadius: 8 }} />
                <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17 }}>Giztrack</span>
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                style={{
                  width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)", cursor: "pointer",
                  color: "var(--color-muted)", flexShrink: 0,
                }}
              >
                {isDark ? (
                  <svg style={{ width: 15, height: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                  <svg style={{ width: 15, height: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
              </button>
            </div>

            {/* Right: Auth actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {isLoggedIn ? (
                <Link
                  to="/dashboard"
                  className="landing-cta"
                  style={{
                    fontWeight: 700, fontSize: 13, color: "#fff", textDecoration: "none",
                    padding: "7px 14px", borderRadius: 8,
                    backgroundColor: "var(--color-primary)", whiteSpace: "nowrap",
                  }}
                >
                  Dashboard →
                </Link>
              ) : (
                <>
                  <Link to="/login" style={{ fontWeight: 600, fontSize: 13, color: "var(--color-muted)", textDecoration: "none", padding: "7px 10px", whiteSpace: "nowrap" }}>
                    Sign in
                  </Link>
                  <Link
                    to="/register"
                    className="landing-cta"
                    style={{
                      fontWeight: 700, fontSize: 13, color: "#fff", textDecoration: "none",
                      padding: "7px 14px", borderRadius: 8,
                      backgroundColor: "var(--color-primary)", whiteSpace: "nowrap",
                    }}
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* ======================================================== */}
        {/*  HERO                                                     */}
        {/* ======================================================== */}
        <section style={{ padding: "48px 16px 40px" }}>
          <div style={{ maxWidth: 680, marginInline: "auto", textAlign: "center" }}>

            <h1 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: "clamp(1.75rem, 6vw, 3.5rem)",
              lineHeight: 1.15, marginBottom: 16,
            }}>
              Manage your shop<br />
              <span style={{ color: "var(--color-accent)" }}>like a pro.</span>
            </h1>

            <p style={{
              fontSize: "clamp(0.9rem, 2.5vw, 1.1rem)",
              lineHeight: 1.7, color: "var(--color-muted)",
              maxWidth: 480, marginInline: "auto", marginBottom: 28,
            }}>
              Inventory, sales, repairs and customers — all in one platform built for Nigerian tech shops.
            </p>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              {isLoggedIn ? (
                <Link
                  to="/dashboard"
                  className="landing-cta"
                  style={{
                    fontWeight: 700, fontSize: 15, color: "#fff", textDecoration: "none",
                    padding: "12px 28px", borderRadius: 12, width: "100%", maxWidth: 260,
                    backgroundColor: "var(--color-primary)", textAlign: "center",
                    boxShadow: "0 4px 20px -4px rgba(19,78,94,0.3)",
                  }}
                >
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/register"
                    className="landing-cta"
                    style={{
                      fontWeight: 700, fontSize: 15, color: "#fff", textDecoration: "none",
                      padding: "12px 28px", borderRadius: 12, width: "100%", maxWidth: 260,
                      backgroundColor: "var(--color-primary)", textAlign: "center",
                      boxShadow: "0 4px 20px -4px rgba(19,78,94,0.3)",
                    }}
                  >
                    Start your free trial
                  </Link>
                  <Link
                    to="/login"
                    className="landing-cta"
                    style={{
                      fontWeight: 600, fontSize: 15, color: "var(--color-text)", textDecoration: "none",
                      padding: "12px 28px", borderRadius: 12, width: "100%", maxWidth: 260,
                      backgroundColor: "var(--color-surface)", textAlign: "center",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
            {!isLoggedIn && (
              <p style={{ fontSize: 12, color: "var(--color-muted)", fontWeight: 500, marginTop: 14 }}>
                Free for 30 days · No credit card required
              </p>
            )}
          </div>
        </section>

        {/* ======================================================== */}
        {/*  FEATURES                                                 */}
        {/* ======================================================== */}
        <section style={{
          padding: "40px 16px 48px",
          backgroundColor: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
        }}>
          <div style={{ maxWidth: 1100, marginInline: "auto" }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "clamp(1.3rem, 3.5vw, 1.85rem)", marginBottom: 8 }}>
                Everything your shop needs
              </h2>
              <p style={{ color: "var(--color-muted)", fontSize: 14, maxWidth: 400, marginInline: "auto", lineHeight: 1.6 }}>
                Replace spreadsheets and scattered WhatsApp threads with one unified system.
              </p>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
              gap: 14,
            }}>
              {features.map((f, i) => (
                <div
                  key={i}
                  className="landing-card"
                  style={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 16,
                    padding: 20,
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: "rgba(19,78,94,0.08)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--color-primary)", marginBottom: 12,
                  }}>
                    <FeatureIcon>{f.icon}</FeatureIcon>
                  </div>
                  <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{f.title}</h3>
                  <p style={{ color: "var(--color-muted)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/*  PRICING                                                  */}
        {/* ======================================================== */}
        <section style={{ padding: "48px 16px" }}>
          <div style={{ maxWidth: 1100, marginInline: "auto" }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "clamp(1.3rem, 3.5vw, 1.85rem)", marginBottom: 8 }}>
                Simple pricing
              </h2>
              <p style={{ color: "var(--color-muted)", fontSize: 14, maxWidth: 380, marginInline: "auto", lineHeight: 1.6 }}>
                Start free. Upgrade when you're ready to unlock everything.
              </p>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
              gap: 16, maxWidth: 640, marginInline: "auto",
            }}>

              {/* FREE */}
              <div style={{
                backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 16, padding: 24, display: "flex", flexDirection: "column",
              }}>
                <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 2 }}>Basic</p>
                <p style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 16 }}>For shops just getting started.</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 16 }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 32 }}>₦3,000</span>
                  <span style={{ fontSize: 13, color: "var(--color-muted)", fontWeight: 600 }}>/ mo</span>
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1, display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                  {freeFeatures.map((f, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <Check /> {f}
                    </li>
                  ))}
                </ul>

                <Link
                  to="/register"
                  className="landing-cta"
                  style={{
                    display: "block", textAlign: "center", padding: "10px 0", borderRadius: 10,
                    fontWeight: 700, fontSize: 13, textDecoration: "none",
                    color: "var(--color-text)",
                    backgroundColor: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  Get started
                </Link>
              </div>

              {/* PRO */}
              <div style={{
                backgroundColor: "var(--color-surface)", border: "2px solid var(--color-primary)",
                borderRadius: 16, padding: 24, display: "flex", flexDirection: "column",
                boxShadow: "0 8px 30px -12px rgba(19,78,94,0.18)",
                position: "relative",
              }}>
                <span style={{
                  position: "absolute", top: -10, right: 16,
                  backgroundColor: "var(--color-primary)", color: "#fff",
                  fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                  padding: "3px 10px", borderRadius: 20,
                }}>
                  Popular
                </span>

                <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 2, color: "var(--color-primary)" }}>Pro</p>
                <p style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 16 }}>For growing businesses.</p>

                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 16 }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 32 }}>₦6,000</span>
                  <span style={{ fontSize: 13, color: "var(--color-muted)", fontWeight: 600 }}>/ mo</span>
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1, display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                  {proFeatures.map((f, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <Check accent /> {f}
                    </li>
                  ))}
                </ul>

                <Link
                  to="/register"
                  className="landing-cta"
                  style={{
                    display: "block", textAlign: "center", padding: "10px 0", borderRadius: 10,
                    fontWeight: 700, fontSize: 13, textDecoration: "none",
                    color: "#fff",
                    backgroundColor: "var(--color-primary)",
                  }}
                >
                  Start 30-day free trial
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/*  FOOTER                                                   */}
        {/* ======================================================== */}
        <footer style={{
          borderTop: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          padding: "28px 16px",
        }}>
          <div style={{
            maxWidth: 1100, marginInline: "auto",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            textAlign: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <img src="/favicon.png" alt="Giztrack" style={{ width: 18, height: 18, borderRadius: 5, opacity: 0.7 }} />
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, color: "var(--color-muted)" }}>Giztrack</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, fontSize: 12, fontWeight: 500 }}>
              <Link to="/terms" style={{ color: "var(--color-muted)", textDecoration: "none" }}>Terms</Link>
              <Link to="/privacy-policy" style={{ color: "var(--color-muted)", textDecoration: "none" }}>Privacy</Link>
              <a href="mailto:support@giztrack.com" style={{ color: "var(--color-muted)", textDecoration: "none" }}>Support</a>
            </div>

            <p style={{ fontSize: 11, color: "var(--color-muted)", margin: 0 }}>
              © {new Date().getFullYear()} Giztrack. All rights reserved.
            </p>
          </div>
        </footer>

      </div>
    </>
  );
}
