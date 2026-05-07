import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Outlet, NavLink, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import api from "../api/axios";
import { clearPostAuthRedirect } from "../utils/navigation";



const navItems = [
  {
    path: "/dashboard",
    label: "Dashboard",
    roles: ["admin", "staff", "technician"],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    path: "/inventory",
    label: "Inventory",
    roles: ["admin", "staff"],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    path: "/sales",
    label: "Sales",
    roles: ["admin", "staff"],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    path: "/repairs",
    label: "Repairs",
    roles: ["admin", "staff", "technician"],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    path: "/customers",
    label: "Customers",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    path: "/expenses",
    label: "Expenses",
    roles: ["admin", "staff"],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
      </svg>
    ),
  },
  {
    path: "/reports",
    label: "Reports",
    roles: ["admin"],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    path: "/billing",
    label: "Billing",
    roles: ["admin"],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    path: "/settings",
    label: "Settings",
    roles: ["admin"],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
  {
    path: "/help",
    label: "Help",
    roles: ["admin", "staff", "technician"],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const routePreloaders: Record<string, () => Promise<unknown>> = {
  "/dashboard": () => import("../pages/Dashboard"),
  "/inventory": () => import("../pages/Inventory"),
  "/sales": () => import("../pages/Sales"),
  "/repairs": () => import("../pages/Repairs"),
  "/customers": () => import("../pages/Customers"),
  "/expenses": () => import("../pages/Expenses"),
  "/reports": () => import("../pages/Reports"),
  "/billing": () => import("../pages/Billing"),
  "/settings": () => import("../pages/Settings"),
  "/help": () => import("../pages/Help"),
};

const preloadedRoutes = new Set<string>();

const preloadRoute = (path: string) => {
  if (preloadedRoutes.has(path)) return;
  const preload = routePreloaders[path];
  if (!preload) return;
  preloadedRoutes.add(path);
  void preload();
};



// --- Monetization UI ---
const TrialBanner = ({ daysLeft }: { daysLeft: number }) => (
  <div className="bg-secondary/5 border border-secondary-dark/20 p-4 rounded-xl mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--color-secondary-dark)", color: "white" }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Your 30-day Pro trial ends in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</p>
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>Choose Basic for core operations or Pro to keep advanced features after trial.</p>
      </div>
    </div>
    <Link to="/billing" className="text-xs font-bold text-white px-5 py-2.5 rounded-lg transition-transform transform hover:-translate-y-0.5 shrink-0" style={{ backgroundColor: "var(--color-primary)" }}>
      Choose Plan
    </Link>
  </div>
);

const HardLockScreen = () => (
  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 h-full mt-8">
    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}>
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    </div>
    <h2 className="text-3xl font-display font-bold mb-3" style={{ color: "var(--color-text)" }}>Your free trial has ended</h2>
    <p className="text-base mb-8 max-w-md mx-auto" style={{ color: "var(--color-muted)" }}>
      Activate a Basic or Pro plan to regain access to your inventory, sales, repairs, and reports.
    </p>
    <Link to="/billing" className="text-white font-bold text-base px-8 py-3.5 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5" style={{ backgroundColor: "var(--color-primary)" }}>
      Choose a Plan
    </Link>
  </div>
);

export default function Layout() {
  const { user, logout, isPro, isTrial, trialDaysLeft, isLocked, hasActiveSubscription } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const location = useLocation();
  const currentPage = navItems.find((i) =>
    i.path === "/" ? location.pathname === "/" : location.pathname.startsWith(i.path)
  );

  // Filter by role and Pro Plan limits before rendering
  const visibleNavItems = useMemo(
    () =>
      navItems.filter(
        (item) =>
          user?.role &&
          item.roles &&
          item.roles.includes(user.role) &&
          (item.path !== "/expenses" || isPro) &&
          (item.path !== "/reports" || isPro)
      ),
    [user?.role, isPro]
  );

  useEffect(() => {
    if (visibleNavItems.length === 0) return;

    const warmVisibleRoutes = () => {
      visibleNavItems.forEach((item) => preloadRoute(item.path));
    };

    const browserWindow = typeof window !== "undefined" ? window : null;

    if (browserWindow && "requestIdleCallback" in browserWindow) {
      const id = browserWindow.requestIdleCallback(warmVisibleRoutes);
      return () => browserWindow.cancelIdleCallback(id);
    }

    const timeout = globalThis.setTimeout(warmVisibleRoutes, 250);
    return () => globalThis.clearTimeout(timeout);
  }, [visibleNavItems]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await api.post("/auth/logout/");
    } catch {
      // proceed even if blacklist fails
    } finally {
      clearPostAuthRedirect();
      logout();
      navigate("/login");
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <img src="/favicon.png" alt="Giztrack logo" className="w-9 h-9 rounded-xl shrink-0" />
        <div className="min-w-0">
          <p className="text-text font-display font-bold text-sm truncate">
            {user?.shop_name || "Tech Shop"}
          </p>
          <p className="text-xs truncate" style={{ color: "var(--color-sidebar-text)" }}>
            {user?.role}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            onClick={() => setSidebarOpen(false)}
            onMouseEnter={() => preloadRoute(item.path)}
            onFocus={() => preloadRoute(item.path)}
            onTouchStart={() => preloadRoute(item.path)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
                ? "bg-primary text-white"
                : "hover:bg-white/5"
              }`
            }
            style={({ isActive }) => ({
              color: isActive ? "white" : "var(--color-sidebar-text)",
            })}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom — user + theme + logout */}
      <div className="px-3 py-4 border-t space-y-1"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
          style={{ color: "var(--color-sidebar-text)" }}
        >
          {isDark ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
          {isDark ? "Light Mode" : "Dark Mode"}
        </button>

        {/* User */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-tex text-xs font-bold shrink-0">
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-text text-xs font-medium truncate">{user?.full_name}</p>
            <p className="text-xs truncate" style={{ color: "var(--color-sidebar-text)" }}>
              {user?.email}
            </p>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-red-500/10 hover:text-red-400"
          style={{ color: "var(--color-sidebar-text)" }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {loggingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden border-none bg-white" style={{ backgroundColor: "var(--color-bg)" }}>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 h-full print:hidden"
        style={{ backgroundColor: "var(--color-sidebar)" }}>
        <SidebarContent />
      </aside>

      {/* Sidebar — mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 flex flex-col lg:hidden transform transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        style={{ backgroundColor: "var(--color-sidebar)" }}
      >
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible print:bg-white">

        {/* Top bar — mobile only */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b shrink-0 print:hidden"
          style={{
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-border)",
          }}>
          <button onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg" style={{ color: "var(--color-text)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-display font-bold text-sm" style={{ color: "var(--color-text)" }}>
            {currentPage?.label || user?.shop_name}
          </span>
          <div className="w-9" />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 print:p-0 print:overflow-visible print:bg-white min-w-0" style={{ backgroundColor: "var(--color-bg)" }}>
          {isLocked && location.pathname !== "/billing" && location.pathname !== "/settings" ? (
            <HardLockScreen />
          ) : (
            <>
              {isTrial && !hasActiveSubscription && <TrialBanner daysLeft={trialDaysLeft} />}
              <Outlet />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
