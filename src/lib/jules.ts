import { Capacitor } from "@capacitor/core";

export type JulesOperation =
  | "status"
  | "listSources"
  | "getSource"
  | "listSessions"
  | "getSession"
  | "createSession"
  | "deleteSession"
  | "listActivities"
  | "getActivity"
  | "sendMessage"
  | "approvePlan";

export interface JulesCallArgs {
  operation: JulesOperation;
  resourceId?: string;
  activityId?: string;
  prompt?: string;
  title?: string;
  source?: string;
  startingBranch?: string;
  requirePlanApproval?: boolean;
  automationMode?: string;
  pageSize?: number;
  pageToken?: string;
  filter?: string;
  apiKey?: string;
}

function getBaseUrl(): string {
  // If running in browser dev mode, use the Vite dev proxy to avoid browser CORS issues.
  // When running inside Android Capacitor (native) or production build, use the direct Google API endpoint.
  if (typeof window !== "undefined" && !Capacitor.isNativePlatform() && import.meta.env.DEV) {
    return "/jules-api";
  }
  return "https://jules.googleapis.com/v1alpha";
}

function required(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function getResourceId(value: string, prefix: string): string {
  const cleaned = value.trim();
  return cleaned.startsWith(`${prefix}/`) ? cleaned.slice(prefix.length + 1) : cleaned;
}

export async function callJules(args: JulesCallArgs): Promise<unknown> {
  const apiKey =
    args.apiKey?.trim() ||
    (typeof window !== "undefined"
      ? localStorage.getItem("jules_custom_api_key") ||
        sessionStorage.getItem("jules_custom_api_key") ||
        ""
      : "");

  if (args.operation === "status") {
    return {
      configured: Boolean(apiKey),
      source: apiKey ? "client" : "none",
    };
  }

  if (!apiKey) {
    throw new Error("Jules API key is not configured. Enter your API key above to connect.");
  }

  const headers: Record<string, string> = {
    "x-goog-api-key": apiKey,
    Accept: "application/json",
  };
  const MAX_RETRIES = 3;
  const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const baseUrl = getBaseUrl();

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    let delay = 600;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          ...init,
          headers: { ...headers, ...(init?.headers ?? {}) },
        });
      } catch (fetchError) {
        if (attempt === MAX_RETRIES) throw fetchError;
        const jitter = Math.floor(Math.random() * 200);
        await wait(delay + jitter);
        delay *= 2;
        continue;
      }

      if (response.ok) {
        if (response.status === 204) return {} as T;
        return (await response.json()) as T;
      }

      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES) {
        const retryAfter = response.headers.get("retry-after");
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;
        const jitter = Math.floor(Math.random() * 200);
        await wait((Number.isNaN(waitTime) ? delay : waitTime) + jitter);
        delay *= 2;
        continue;
      }

      let message = `Jules returned ${response.status}.`;
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        message = body.error?.message ?? message;
        if (
          message.includes("API keys are not supported") ||
          message.includes("assert a principal")
        ) {
          message =
            "Invalid Jules API key. Please generate a valid API key from https://jules.google.com/settings#api.";
        }
      } catch {
        // Keep the status message when Jules does not return JSON.
      }
      throw new Error(message);
    }
    throw new Error("Jules request failed after retries.");
  };

  const params = new URLSearchParams();
  if (args.pageSize) params.set("pageSize", String(args.pageSize));
  if (args.pageToken) params.set("pageToken", args.pageToken);
  if (args.filter) params.set("filter", args.filter);
  const query = params.toString() ? `?${params.toString()}` : "";

  switch (args.operation) {
    case "listSources":
      return request(`/sources${query}`);
    case "getSource":
      return request(`/sources/${getResourceId(required(args.resourceId, "Source"), "sources")}`);
    case "listSessions":
      return request(`/sessions${query}`);
    case "getSession":
      return request(`/sessions/${getResourceId(required(args.resourceId, "Session"), "sessions")}`);
    case "createSession": {
      const body: Record<string, unknown> = {
        prompt: required(args.prompt, "Prompt"),
      };
      if (args.title?.trim()) body.title = args.title.trim();
      if (args.source?.trim()) {
        body.sourceContext = {
          source: args.source.trim(),
          ...(args.startingBranch?.trim()
            ? { githubRepoContext: { startingBranch: args.startingBranch.trim() } }
            : {}),
        };
      }
      if (args.requirePlanApproval !== undefined) body.requirePlanApproval = args.requirePlanApproval;
      if (args.automationMode) body.automationMode = args.automationMode;
      return request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    case "deleteSession":
      return request(`/sessions/${getResourceId(required(args.resourceId, "Session"), "sessions")}`, { method: "DELETE" });
    case "listActivities":
      return request(`/sessions/${getResourceId(required(args.resourceId, "Session"), "sessions")}/activities${query}`);
    case "getActivity":
      return request(
        `/sessions/${getResourceId(required(args.resourceId, "Session"), "sessions")}/activities/${getResourceId(required(args.activityId, "Activity"), "activities")}`,
      );
    case "sendMessage":
      return request(`/sessions/${getResourceId(required(args.resourceId, "Session"), "sessions")}:sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: required(args.prompt, "Message") }),
      });
    case "approvePlan":
      return request(`/sessions/${getResourceId(required(args.resourceId, "Session"), "sessions")}:approvePlan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    default:
      throw new Error("Unsupported Jules operation.");
  }
}

