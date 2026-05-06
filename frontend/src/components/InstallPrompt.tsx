import { useState } from "react";
import { usePWAInstall } from "../hooks/usePWAInstall";

/**
 * PWA install banner. Two modes:
 *
 * 1. Android / Desktop Chrome → uses the native `beforeinstallprompt` event
 *    to trigger the browser's built-in install dialog.
 *
 * 2. iOS Safari → shows instructional text ("Tap Share → Add to Home Screen")
 *    because Apple doesn't support beforeinstallprompt.
 *
 * Dismissing stores a flag in localStorage so it won't reappear for 7 days.
 * If the app is already running in standalone mode (installed), nothing shows.
 */

const DISMISS_KEY = "Giztrack:pwa-dismiss";
const DISMISS_DAYS = 7;

function wasDismissedRecently(): boolean {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isInStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  // iOS standalone check
  if ("standalone" in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone) {
    return true;
  }
  // Standard display-mode check
  return window.matchMedia("(display-mode: standalone)").matches;
}

export default function InstallPrompt() {
  const { canInstall, promptInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(wasDismissedRecently);

  // Don't show if already installed as PWA
  if (isInStandaloneMode()) return null;

  const isiOS = isIOS();
  const showNativePrompt = canInstall && !isiOS;
  const showIOSPrompt = isiOS && !dismissed;

  // Nothing to show
  if (!showNativePrompt && !showIOSPrompt) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage may be unavailable
    }
  };

  const handleInstall = async () => {
    await promptInstall();
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 60,
        maxWidth: 440,
        marginInline: "auto",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 20,
        padding: "16px 20px",
        boxShadow: "0 12px 40px -8px rgba(0,0,0,0.15)",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: "rgba(19,78,94,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-primary)",
          flexShrink: 0,
        }}
      >
        <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, margin: 0 }}>
          Install Giztrack
        </p>
        {isiOS ? (
          <p style={{ fontSize: 12, color: "var(--color-muted)", margin: "2px 0 0", lineHeight: 1.4 }}>
            Tap{" "}
            {/* iOS share icon inline */}
            <svg style={{ width: 14, height: 14, verticalAlign: "middle", display: "inline", color: "var(--color-primary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {" "}then <strong>"Add to Home Screen"</strong>
          </p>
        ) : (
          <p style={{ fontSize: 12, color: "var(--color-muted)", margin: "2px 0 0", lineHeight: 1.4 }}>
            Add to your home screen for quick access, even offline.
          </p>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            backgroundColor: "transparent",
            color: "var(--color-muted)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Later
        </button>
        {showNativePrompt && (
          <button
            type="button"
            onClick={handleInstall}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}
