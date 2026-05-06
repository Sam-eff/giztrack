import { useEffect, useState } from "react";

/**
 * Captures the browser's `beforeinstallprompt` event and exposes a simple
 * API so any component can trigger the native PWA install dialog.
 *
 * Usage:
 *   const { canInstall, promptInstall } = usePWAInstall();
 *   if (canInstall) <button onClick={promptInstall}>Install</button>
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function usePWAInstall() {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    // If we already captured the event before this hook mounted
    if (deferredPrompt) {
      setCanInstall(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // If the app was installed, hide the prompt
    const installed = () => {
      setCanInstall(false);
      deferredPrompt = null;
    };
    window.addEventListener("appinstalled", installed);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setCanInstall(false);
    }
    deferredPrompt = null;
  };

  return { canInstall, promptInstall };
}
