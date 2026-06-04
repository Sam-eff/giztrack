/* eslint-disable react-refresh/only-export-components */
import { AxiosError } from "axios";
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "../types";
import api from "../api/axios";

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  setCurrentUser: (user: User | null) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  isPro: boolean;
  hasAppAccess: boolean;
  hasActiveSubscription: boolean;
  subscriptionPlan: string;
  isTrial: boolean;
  trialDaysLeft: number;
  isLocked: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
const LAST_KNOWN_USER_KEY = "Giztrack:last-known-user";

const readCachedUser = (): User | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LAST_KNOWN_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

const persistCachedUser = (user: User | null) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (user) {
      window.localStorage.setItem(LAST_KNOWN_USER_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(LAST_KNOWN_USER_KEY);
    }
  } catch {
    // Offline resilience must not fail because storage is unavailable.
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const cachedUser = readCachedUser();

    api
      .get("/auth/me/", { skipAuthRedirect: true })
      .then(({ data }) => {
        if (isMounted) {
          setUser(data);
          persistCachedUser(data);
        }
      })
      .catch((requestError: AxiosError) => {
        if (isMounted) {
          const status = requestError.response?.status;
          const isOfflineResponse = !requestError.response || (status && status >= 500);

          if (isOfflineResponse && cachedUser) {
            setUser(cachedUser);
          } else if (status === 401 || status === 403 || !isOfflineResponse) {
            setUser(null);
            persistCachedUser(null);
          }
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const login = (nextUser: User) => {
    setUser(nextUser);
    persistCachedUser(nextUser);
    setIsLoading(false);
  };

  const logout = () => {
    setUser(null);
    persistCachedUser(null);
    setIsLoading(false);
  };

  const isTrial = user?.subscription_status === "trial" || !!user?.is_in_trial;
  const trialDaysLeft = user?.trial_days_remaining || 0;
  const hasActiveSubscription = !!user?.has_active_subscription;
  const hasAppAccess = !!user?.has_app_access;
  const isPro = !!user?.has_pro_access;
  const isLocked = !!user && !hasAppAccess;
  const subscriptionPlan =
    user?.subscription_plan ||
    (isTrial ? "Pro Trial" : hasActiveSubscription ? "Active Plan" : "No Active Plan");

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        setCurrentUser: (nextUser) => {
          setUser(nextUser);
          persistCachedUser(nextUser);
        },
        isAuthenticated: !!user,
        isLoading,
        isPro,
        hasAppAccess,
        hasActiveSubscription,
        subscriptionPlan,
        isTrial,
        trialDaysLeft,
        isLocked,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
