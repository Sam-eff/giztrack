import { useEffect, useState } from "react";

export default function OfflineNotice() {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [justRestored, setJustRestored] = useState(false);

  useEffect(() => {
    let resetTimer: number | undefined;

    const handleOffline = () => {
      setIsOffline(true);
      setJustRestored(false);
      if (resetTimer) {
        window.clearTimeout(resetTimer);
      }
    };

    const handleOnline = () => {
      setIsOffline(false);
      setJustRestored(true);
      if (resetTimer) {
        window.clearTimeout(resetTimer);
      }
      resetTimer = window.setTimeout(() => setJustRestored(false), 3500);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      if (resetTimer) {
        window.clearTimeout(resetTimer);
      }
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!isOffline && !justRestored) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed left-3 right-3 top-[4.75rem] z-20 mx-auto max-w-xl rounded-2xl border px-4 py-3 shadow-lg sm:left-4 sm:right-4 lg:top-4 lg:z-[70]"
      style={{
        backgroundColor: isOffline ? "#fff7ed" : "#ecfdf5",
        borderColor: isOffline ? "#fdba74" : "#86efac",
        color: isOffline ? "#9a3412" : "#166534",
      }}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-semibold">
        {isOffline ? "You are offline." : "Back online."}
      </p>
      <p className="mt-1 text-xs opacity-90">
        {isOffline
          ? "You can open cached pages, but new sales, repairs, billing updates, and sync actions need internet access."
          : "Giztrack can sync live data normally again."}
      </p>
    </div>
  );
}
