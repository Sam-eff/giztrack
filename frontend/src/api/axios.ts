import axios, { AxiosError, AxiosHeaders } from "axios";
import { isPublicRoute, rememberCurrentPathForAuth } from "../utils/navigation";

declare module "axios" {
  interface AxiosRequestConfig {
    _retry?: boolean;
    skipAuthRedirect?: boolean;
  }

  interface InternalAxiosRequestConfig {
    _retry?: boolean;
    skipAuthRedirect?: boolean;
  }
}

const configuredBaseURL = (import.meta.env.VITE_API_URL || "").trim();
const baseURL = configuredBaseURL || "/api/v1";

const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

const csrfClient = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

let refreshPromise: Promise<void> | null = null;
let csrfPromise: Promise<void> | null = null;

const getCookie = (name: string) => {
  if (typeof document === "undefined") {
    return "";
  }

  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
};

const fetchCsrfToken = async () => {
  if (typeof window === "undefined") {
    return;
  }

  if (!csrfPromise) {
    csrfPromise = csrfClient
      .get("/auth/csrf/", { skipAuthRedirect: true })
      .then(() => undefined)
      .finally(() => {
        csrfPromise = null;
      });
  }

  await csrfPromise;
};

api.interceptors.request.use(async (config) => {
  const method = (config.method || "get").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    await fetchCsrfToken();
    const csrfToken = getCookie("csrftoken");

    if (csrfToken) {
      if (typeof config.headers?.set === "function") {
        config.headers.set("X-CSRFToken", csrfToken);
      } else {
        config.headers = new AxiosHeaders({
          ...config.headers,
          "X-CSRFToken": csrfToken,
        });
      }
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config;
    const requestPath = original?.url || "";

    const isRefreshRequest = requestPath.includes("/auth/token/refresh/");
    const isCookieRefreshRequest = requestPath.includes("/auth/refresh/");
    const isPublicAuthRequest =
      requestPath.includes("/auth/login/") ||
      requestPath.includes("/auth/register/") ||
      requestPath.includes("/auth/forgot-password/") ||
      requestPath.includes("/auth/reset-password/");

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isRefreshRequest &&
      !isCookieRefreshRequest &&
      !isPublicAuthRequest
    ) {
      original._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = api
            .post("/auth/refresh/", null, { skipAuthRedirect: true })
            .then(() => undefined)
            .finally(() => {
              refreshPromise = null;
            });
        }

        await refreshPromise;
        return api(original);
      } catch (refreshError) {
        if (!original.skipAuthRedirect && !isPublicRoute(window.location.pathname)) {
          rememberCurrentPathForAuth();
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
