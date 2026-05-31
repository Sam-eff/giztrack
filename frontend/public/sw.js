const VERSION = "Giztrack-v5";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const API_CACHE = `${VERSION}-api`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
];

const isStaticAsset = (request, url) => {
  if (["style", "script", "font", "image", "worker"].includes(request.destination)) {
    return true;
  }

  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/media/") ||
    url.pathname === "/favicon.png" ||
    url.pathname === "/manifest.webmanifest"
  );
};

const isApiRequest = (url) => url.pathname.startsWith("/api/");

const isCacheableApiRequest = (url) =>
  isApiRequest(url) && !url.pathname.includes("/auth/");

const isAppShellResponse = (response) => {
  const contentType = response.headers.get("Content-Type") || "";
  return response.ok && contentType.includes("text/html");
};

const offlineApiResponse = () =>
  new Response(
    JSON.stringify({
      detail: "Network error. The API server could not be reached.",
      error: "network_unavailable",
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE, API_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (isApiRequest(url)) {
    event.respondWith(
      (async () => {
        const canUseOfflineCache = isCacheableApiRequest(url);
        const cache = canUseOfflineCache ? await caches.open(API_CACHE) : null;

        try {
          const response = await fetch(request);

          if (response.ok && cache) {
            void cache.put(request, response.clone()).catch(() => undefined);
          }

          if (response.status >= 500 && cache) {
            const cached = await cache.match(request);
            if (cached) {
              return cached;
            }
          }

          return response;
        } catch {
          if (cache) {
            const cached = await cache.match(request);
            if (cached) {
              return cached;
            }
          }

          return offlineApiResponse();
        }
      })()
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isAppShellResponse(response)) {
            const copy = response.clone();
            void caches.open(SHELL_CACHE).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(async () => {
          const cachedApp = await caches.match("/index.html");
          if (cachedApp) {
            return cachedApp;
          }

          return caches.match("/offline.html");
        })
    );
    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
