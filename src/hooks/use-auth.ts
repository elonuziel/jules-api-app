import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "jules_custom_api_key";

export interface UserInfo {
  name: string;
  email: string;
}

export function useAuth() {
  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return (
      localStorage.getItem(STORAGE_KEY) ||
      sessionStorage.getItem(STORAGE_KEY) ||
      ""
    );
  });

  const [storageType, setStorageType] = useState<"local" | "session" | "none">(() => {
    if (typeof window === "undefined") return "none";
    if (localStorage.getItem(STORAGE_KEY)) return "local";
    if (sessionStorage.getItem(STORAGE_KEY)) return "session";
    return "none";
  });

  const [isLoading] = useState(false);

  // Sync state if storage changes
  useEffect(() => {
    const handleStorageChange = () => {
      const stored =
        localStorage.getItem(STORAGE_KEY) ||
        sessionStorage.getItem(STORAGE_KEY) ||
        "";
      setApiKey(stored);
      if (localStorage.getItem(STORAGE_KEY)) setStorageType("local");
      else if (sessionStorage.getItem(STORAGE_KEY)) setStorageType("session");
      else setStorageType("none");
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const saveApiKey = useCallback((key: string, remember: boolean = true) => {
    const trimmed = key.trim();
    if (!trimmed) {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      setApiKey("");
      setStorageType("none");
      return;
    }

    if (remember) {
      localStorage.setItem(STORAGE_KEY, trimmed);
      sessionStorage.removeItem(STORAGE_KEY);
      setStorageType("local");
    } else {
      sessionStorage.setItem(STORAGE_KEY, trimmed);
      localStorage.removeItem(STORAGE_KEY);
      setStorageType("session");
    }
    setApiKey(trimmed);
  }, []);

  const signIn = useCallback(
    async (_provider?: string, data?: unknown) => {
      if (data instanceof FormData) {
        const key = data.get("apiKey") as string;
        if (key) {
          saveApiKey(key, true);
          return;
        }
      } else if (typeof data === "string") {
        saveApiKey(data, true);
        return;
      }
      if (typeof window !== "undefined") {
        sessionStorage.setItem("jules_guest_session", "true");
      }
    },
    [saveApiKey],
  );

  const signOut = useCallback(async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem("jules_guest_session");
    }
    setApiKey("");
    setStorageType("none");
  }, []);

  const hasKey = Boolean(apiKey);
  const isGuest =
    typeof window !== "undefined" &&
    sessionStorage.getItem("jules_guest_session") === "true";
  const isAuthenticated = hasKey || isGuest;

  const user: UserInfo | null = isAuthenticated
    ? {
        name: "Personal Workspace",
        email: hasKey ? "Direct Jules API" : "Guest Mode (API key needed)",
      }
    : null;

  return {
    isLoading,
    isAuthenticated,
    hasKey,
    apiKey,
    storageType,
    user,
    saveApiKey,
    signIn,
    signOut,
  };
}
