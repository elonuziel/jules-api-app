"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

const BASE_URL = "https://jules.googleapis.com/v1alpha";

const operationValidator = v.union(
  v.literal("status"),
  v.literal("listSources"),
  v.literal("getSource"),
  v.literal("listSessions"),
  v.literal("getSession"),
  v.literal("createSession"),
  v.literal("deleteSession"),
  v.literal("listActivities"),
  v.literal("getActivity"),
  v.literal("sendMessage"),
  v.literal("approvePlan"),
);

function required(value: string | undefined, label: string) {
  if (!value?.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function getResourceId(value: string, prefix: string) {
  const cleaned = value.trim();
  return cleaned.startsWith(`${prefix}/`) ? cleaned.slice(prefix.length + 1) : cleaned;
}

export const call = action({
  args: {
    operation: operationValidator,
    resourceId: v.optional(v.string()),
    activityId: v.optional(v.string()),
    prompt: v.optional(v.string()),
    title: v.optional(v.string()),
    source: v.optional(v.string()),
    startingBranch: v.optional(v.string()),
    requirePlanApproval: v.optional(v.boolean()),
    automationMode: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    pageToken: v.optional(v.string()),
    filter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to connect to Jules.");

    const apiKey = process.env.JULES_API_KEY;
    if (args.operation === "status") {
      return { configured: Boolean(apiKey) };
    }
    if (!apiKey) {
      throw new Error("JULES_API_KEY is not configured. Add it in your project Keys/API keys tab.");
    }

    const headers: Record<string, string> = {
      "x-goog-api-key": apiKey,
      Accept: "application/json",
    };
    const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: { ...headers, ...(init?.headers ?? {}) },
      });
      if (!response.ok) {
        let message = `Jules returned ${response.status}.`;
        try {
          const body = (await response.json()) as { error?: { message?: string } };
          message = body.error?.message ?? message;
        } catch {
          // Keep the status message when Jules does not return JSON.
        }
        throw new Error(message);
      }
      if (response.status === 204) return {} as T;
      return (await response.json()) as T;
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
  },
});
