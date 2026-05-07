import { Suspense, lazy, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import {
  AppShellFallback,
  DashboardSkeleton,
  PageSkeleton,
  PublicPageFallback,
} from "./components/LoadingFallbacks";
import OfflineNotice from "./components/OfflineNotice";
import InstallPrompt from "./components/InstallPrompt";
import RouteLoadBoundary from "./components/RouteLoadBoundary";
import { buildAppPath, rememberPostAuthRedirect } from "./utils/navigation";

const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Terms = lazy(() => import("./pages/Terms"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Sales = lazy(() => import("./pages/Sales"));
const Repairs = lazy(() => import("./pages/Repairs"));
const Customers = lazy(() => import("./pages/Customers"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Help = lazy(() => import("./pages/Help"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Layout = lazy(() => import("./components/Layout"));
const Billing = lazy(() => import("./pages/Billing"));
const Expenses = lazy(() => import("./pages/Expenses"));

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const SENSITIVE_QUERY_KEYS = new Set(["token", "uid", "access", "refresh"]);

function sanitizeUrl(url?: string) {
  if (!url) return url;

  try {
    const parsed = new URL(url, window.location.origin);
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    return parsed.toString();
  } catch {
    return url.replace(/([?&](token|uid|access|refresh)=)[^&]+/gi, "$1[REDACTED]");
  }
}

if (SENTRY_DSN) {
  void import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        integrations: [
          Sentry.browserTracingIntegration(),
          // Session Replay intentionally disabled — it records full screen video of users
          // which requires explicit consent under NDPR/GDPR.
        ],
        tracesSampleRate: 0.2,
        sendDefaultPii: false,
        beforeSend(event) {
          if (event.request?.url) {
            event.request.url = sanitizeUrl(event.request.url);
          }
          return event;
        },
        beforeBreadcrumb(breadcrumb) {
          if (breadcrumb.data?.url && typeof breadcrumb.data.url === "string") {
            breadcrumb.data.url = sanitizeUrl(breadcrumb.data.url);
          }
          return breadcrumb;
        },
      });
    })
    .catch(() => {
      // Sentry must never block app startup in production.
    });
}

function withSuspense(element: React.ReactNode, fallback: React.ReactNode) {
  return (
    <RouteLoadBoundary>
      <Suspense fallback={fallback}>{element}</Suspense>
    </RouteLoadBoundary>
  );
}

function RedirectToLogin() {
  const location = useLocation();

  useEffect(() => {
    rememberPostAuthRedirect(buildAppPath(location.pathname, location.search, location.hash));
  }, [location.hash, location.pathname, location.search]);

  return <Navigate to="/login" replace />;
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <AppShellFallback />;
  }

  return isAuthenticated ? <>{children}</> : <RedirectToLogin />;
}

export default function App() {
  return (
    <>
      <OfflineNotice />
      <InstallPrompt />
      <Routes>
        <Route path="/login" element={withSuspense(<Login />, <PublicPageFallback />)} />
        <Route path="/register" element={withSuspense(<Register />, <PublicPageFallback />)} />
        <Route path="/forgot-password" element={withSuspense(<ForgotPassword />, <PublicPageFallback />)} />
        <Route path="/reset-password" element={withSuspense(<ResetPassword />, <PublicPageFallback />)} />
        <Route path="/terms" element={withSuspense(<Terms />, <PublicPageFallback />)} />
        <Route path="/privacy-policy" element={withSuspense(<PrivacyPolicy />, <PublicPageFallback />)} />
        <Route
          path="/billing"
          element={<PrivateRoute>{withSuspense(<Layout />, <AppShellFallback />)}</PrivateRoute>}
        >
          <Route index element={withSuspense(<Billing />, <PageSkeleton />)} />
        </Route>
        <Route path="/" element={withSuspense(<Landing />, <PublicPageFallback />)} />
        <Route
          element={
            <PrivateRoute>
              {withSuspense(<Layout />, <AppShellFallback />)}
            </PrivateRoute>
          }
        >
          <Route path="dashboard" element={withSuspense(<Dashboard />, <DashboardSkeleton />)} />
          <Route path="inventory" element={withSuspense(<Inventory />, <PageSkeleton />)} />
          <Route path="sales" element={withSuspense(<Sales />, <PageSkeleton />)} />
          <Route path="repairs" element={withSuspense(<Repairs />, <PageSkeleton />)} />
          <Route path="customers" element={withSuspense(<Customers />, <PageSkeleton />)} />
          <Route path="expenses" element={withSuspense(<Expenses />, <PageSkeleton />)} />
          <Route path="reports" element={withSuspense(<Reports />, <PageSkeleton />)} />
          <Route path="settings" element={withSuspense(<Settings />, <PageSkeleton />)} />
          <Route path="help" element={withSuspense(<Help />, <PageSkeleton />)} />
          {/* Fallback route inside layout (for authenticated bad URLs) */}
          <Route path="*" element={withSuspense(<NotFound />, <PageSkeleton />)} />
        </Route>

        {/* Global Fallback for completely unhandled URLs outside layout */}
        <Route path="*" element={withSuspense(<NotFound />, <PublicPageFallback />)} />
      </Routes>
    </>
  );
}
