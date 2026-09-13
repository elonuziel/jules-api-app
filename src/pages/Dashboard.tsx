import { useAuth } from "@/hooks/use-auth";
import { callJules } from "@/lib/jules";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Command,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  Github,
  Inbox,
  Key,
  Layers3,
  ListOrdered,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Session {
  name?: string;
  id?: string;
  title?: string;
  prompt?: string;
  state?: string;
  url?: string;
  createTime?: string;
  updateTime?: string;
  outputs?: Array<{ pullRequest?: { url?: string; title?: string; description?: string } }>;
}
interface Source {
  name?: string;
  id?: string;
  githubRepo?: {
    owner?: string;
    repo?: string;
    isPrivate?: boolean;
    defaultBranch?: { displayName?: string };
    branches?: Array<{ displayName?: string }>;
  };
}
interface ActivityItem {
  name?: string;
  id?: string;
  originator?: string;
  description?: string;
  createTime?: string;
  planGenerated?: { plan?: { steps?: Array<{ title?: string; description?: string }> } };
  agentMessaged?: { agentMessage?: string };
  userMessaged?: { userMessage?: string };
  progressUpdated?: { title?: string; description?: string };
  sessionFailed?: { reason?: string };
}
type View = "overview" | "sessions" | "sources";
type Operation =
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

const stateMeta: Record<string, { label: string; tone: string; dot: string }> = {
  COMPLETED: { label: "Completed", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  IN_PROGRESS: { label: "In progress", tone: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  PLANNING: { label: "Planning", tone: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
  AWAITING_PLAN_APPROVAL: { label: "Needs approval", tone: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  AWAITING_USER_FEEDBACK: { label: "Needs input", tone: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  QUEUED: { label: "Queued", tone: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  FAILED: { label: "Failed", tone: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  PAUSED: { label: "Paused", tone: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
};

function shortDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
function sessionId(session?: Session | null) {
  return session?.name ?? session?.id ?? "";
}
function sourceId(source?: Source | null) {
  return source?.name ?? source?.id ?? "";
}
function stateFor(state?: string) {
  return (
    stateMeta[state ?? ""] ?? {
      label: state?.split("_").join(" ") ?? "Unknown",
      tone: "bg-slate-100 text-slate-600 border-slate-200",
      dot: "bg-slate-400",
    }
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [view, setView] = useState<View>("overview");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [sessionNextPageToken, setSessionNextPageToken] = useState<string | null>(null);
  const [sourceNextPageToken, setSourceNextPageToken] = useState<string | null>(null);
  const [loadingMoreSessions, setLoadingMoreSessions] = useState(false);
  const [loadingMoreSources, setLoadingMoreSources] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return (
      localStorage.getItem("jules_custom_api_key") ||
      sessionStorage.getItem("jules_custom_api_key") ||
      ""
    );
  });
  const [keyStorageType, setKeyStorageType] = useState<"local" | "session" | "none">(() => {
    if (typeof window === "undefined") return "none";
    if (localStorage.getItem("jules_custom_api_key")) return "local";
    if (sessionStorage.getItem("jules_custom_api_key")) return "session";
    return "none";
  });
  const [keySource, setKeySource] = useState<"client" | "env" | "none">("none");
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;

  async function run(
    operation: Operation,
    args: Record<string, unknown> = {},
    keyOverride?: string,
  ) {
    const currentKey = keyOverride !== undefined ? keyOverride : apiKeyRef.current;
    const effectiveApiKey = currentKey ? currentKey.trim() : undefined;
    return callJules({ operation, apiKey: effectiveApiKey, ...args } as never) as Promise<unknown>;
  }

  async function loadWorkspace(keyOverride?: string) {
    setLoading(true);
    setError(null);
    try {
      const status = (await run("status", {}, keyOverride)) as {
        configured?: boolean;
        source?: "client" | "env" | "none";
      };
      setConfigured(Boolean(status.configured));
      setKeySource(status.source ?? "none");
      if (!status.configured) {
        setLoading(false);
        return;
      }
      const [sessionResponse, sourceResponse] = await Promise.all([
        run("listSessions", { pageSize: 30 }, keyOverride),
        run("listSources", { pageSize: 30 }, keyOverride),
      ]);
      const sRes = sessionResponse as { sessions?: Session[]; nextPageToken?: string };
      const srcRes = sourceResponse as { sources?: Source[]; nextPageToken?: string };

      setSessions(
        (sRes.sessions ?? []).sort((a, b) => (b.updateTime ?? "").localeCompare(a.updateTime ?? "")),
      );
      setSessionNextPageToken(sRes.nextPageToken ?? null);

      setSources(srcRes.sources ?? []);
      setSourceNextPageToken(srcRes.nextPageToken ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to Jules.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveKey(newKey: string, remember: boolean) {
    const trimmed = newKey.trim();
    if (!trimmed) {
      toast.error("Please enter a valid API key");
      return;
    }
    if (remember) {
      localStorage.setItem("jules_custom_api_key", trimmed);
      sessionStorage.removeItem("jules_custom_api_key");
      setKeyStorageType("local");
    } else {
      sessionStorage.setItem("jules_custom_api_key", trimmed);
      localStorage.removeItem("jules_custom_api_key");
      setKeyStorageType("session");
    }
    apiKeyRef.current = trimmed;
    setApiKey(trimmed);
    setKeyModalOpen(false);

    toast.loading("Testing connection...", { id: "test-key" });
    try {
      await loadWorkspace(trimmed);
      toast.success("Jules API connected!", { id: "test-key" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect with this key", {
        id: "test-key",
      });
    }
  }

  async function handleClearKey() {
    localStorage.removeItem("jules_custom_api_key");
    sessionStorage.removeItem("jules_custom_api_key");
    apiKeyRef.current = "";
    setApiKey("");
    setKeyStorageType("none");
    setKeyModalOpen(false);
    toast.info("API key removed");
    await loadWorkspace("");
  }

  useEffect(() => {
    void loadWorkspace();
  }, []);

  async function loadMoreSessions() {
    if (!sessionNextPageToken || loadingMoreSessions) return;
    setLoadingMoreSessions(true);
    try {
      const res = (await run("listSessions", {
        pageSize: 30,
        pageToken: sessionNextPageToken,
      })) as { sessions?: Session[]; nextPageToken?: string };
      if (res.sessions?.length) {
        setSessions((prev) =>
          [...prev, ...res.sessions!].sort((a, b) =>
            (b.updateTime ?? "").localeCompare(a.updateTime ?? ""),
          ),
        );
      }
      setSessionNextPageToken(res.nextPageToken ?? null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not load more sessions.");
    } finally {
      setLoadingMoreSessions(false);
    }
  }

  async function loadMoreSources() {
    if (!sourceNextPageToken || loadingMoreSources) return;
    setLoadingMoreSources(true);
    try {
      const res = (await run("listSources", {
        pageSize: 30,
        pageToken: sourceNextPageToken,
      })) as { sources?: Source[]; nextPageToken?: string };
      if (res.sources?.length) {
        setSources((prev) => [...prev, ...res.sources!]);
      }
      setSourceNextPageToken(res.nextPageToken ?? null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not load more sources.");
    } finally {
      setLoadingMoreSources(false);
    }
  }

  async function openSession(session: Session) {
    setSelectedSource(null);
    setSelectedSession(session);
    try {
      const [detail, activityResponse] = await Promise.all([
        run("getSession", { resourceId: sessionId(session) }),
        run("listActivities", { resourceId: sessionId(session), pageSize: 100 }),
      ]);
      setSelectedSession(detail as Session);
      setActivities(
        ((activityResponse as { activities?: ActivityItem[] }).activities ?? []).sort((a, b) =>
          (a.createTime ?? "").localeCompare(b.createTime ?? ""),
        ),
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not load the session.");
    }
  }

  async function openSource(source: Source) {
    setSelectedSession(null);
    setSelectedSource(source);
    try {
      setSelectedSource((await run("getSource", { resourceId: sourceId(source) })) as Source);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not load the source.");
    }
  }

  async function refresh() {
    await loadWorkspace();
    toast.success("Workspace refreshed");
  }

  async function deleteCurrentSession() {
    if (!selectedSession) return;
    try {
      await run("deleteSession", { resourceId: sessionId(selectedSession) });
      setSessions((items) => items.filter((item) => sessionId(item) !== sessionId(selectedSession)));
      setSelectedSession(null);
      toast.success("Session deleted");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not delete session.");
    }
  }

  async function sendMessage() {
    if (!selectedSession || !message.trim()) return;
    setSending(true);
    try {
      await run("sendMessage", { resourceId: sessionId(selectedSession), prompt: message.trim() });
      setMessage("");
      toast.success("Message sent to Jules");
      await openSession(selectedSession);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  async function approvePlan() {
    if (!selectedSession) return;
    try {
      await run("approvePlan", { resourceId: sessionId(selectedSession) });
      toast.success("Plan approved");
      await openSession(selectedSession);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not approve plan.");
    }
  }

  // Determine active status for smart auto-polling
  const isSelectedSessionActive = Boolean(
    selectedSession &&
      ["IN_PROGRESS", "PLANNING", "QUEUED", "AWAITING_PLAN_APPROVAL"].includes(
        selectedSession.state ?? "",
      ),
  );

  const hasActiveBackgroundSessions = useMemo(
    () => sessions.some((s) => ["IN_PROGRESS", "PLANNING", "QUEUED"].includes(s.state ?? "")),
    [sessions],
  );

  // 1. Auto-poll selected session when active (every 5 seconds)
  useEffect(() => {
    if (!selectedSession || !isSelectedSessionActive) return;
    const currentId = sessionId(selectedSession);

    const timer = setInterval(async () => {
      try {
        const [detail, activityResponse] = await Promise.all([
          run("getSession", { resourceId: currentId }),
          run("listActivities", { resourceId: currentId, pageSize: 100 }),
        ]);
        const updatedSession = detail as Session;
        setSelectedSession(updatedSession);
        setActivities(
          ((activityResponse as { activities?: ActivityItem[] }).activities ?? []).sort((a, b) =>
            (a.createTime ?? "").localeCompare(b.createTime ?? ""),
          ),
        );
        setSessions((prev) =>
          prev.map((item) => (sessionId(item) === currentId ? updatedSession : item)),
        );
      } catch {
        // Silently ignore transient background polling errors
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [selectedSession?.name, selectedSession?.id, selectedSession?.state, isSelectedSessionActive]);

  // 2. Auto-poll sessions list when in overview/sessions and background tasks are running (every 8 seconds)
  useEffect(() => {
    if (selectedSession || !hasActiveBackgroundSessions) return;

    const timer = setInterval(async () => {
      try {
        const sessionResponse = (await run("listSessions", { pageSize: 30 })) as {
          sessions?: Session[];
          nextPageToken?: string;
        };
        if (sessionResponse.sessions) {
          setSessions((prev) => {
            const updatedMap = new Map(sessionResponse.sessions!.map((s) => [sessionId(s), s]));
            const merged = prev.map((s) => updatedMap.get(sessionId(s)) ?? s);
            sessionResponse.sessions!.forEach((s) => {
              if (!prev.some((p) => sessionId(p) === sessionId(s))) merged.unshift(s);
            });
            return merged.sort((a, b) => (b.updateTime ?? "").localeCompare(a.updateTime ?? ""));
          });
        }
      } catch {
        // Silently ignore transient background polling errors
      }
    }, 8000);

    return () => clearInterval(timer);
  }, [selectedSession, hasActiveBackgroundSessions]);

  const filteredSessions = useMemo(
    () =>
      sessions.filter((item) =>
        `${item.title ?? ""} ${item.prompt ?? ""} ${item.state ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [sessions, search],
  );

  const filteredSources = useMemo(
    () =>
      sources.filter((item) =>
        `${item.githubRepo?.owner ?? ""}/${item.githubRepo?.repo ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [sources, search],
  );

  const activeCount = sessions.filter((item) =>
    ["IN_PROGRESS", "PLANNING", "QUEUED"].includes(item.state ?? ""),
  ).length;
  const completedCount = sessions.filter((item) => item.state === "COMPLETED").length;
  const isLiveSyncing = isSelectedSessionActive || hasActiveBackgroundSessions;

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <aside
        className={`${
          mobileNav ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0`}
      >
        <div className="flex h-[72px] items-center gap-3 border-b border-slate-100 px-6">
          <div className="flex size-8 items-center justify-center rounded-[10px] bg-slate-950 text-white">
            <Sparkles className="size-4" />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">Julespace</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Personal console
            </div>
          </div>
          <button
            className="ml-auto rounded-md p-1 text-slate-400 lg:hidden"
            onClick={() => setMobileNav(false)}
          >
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-7 px-3 py-7">
          <div>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Workspace
            </div>
            <div className="space-y-1">
              <SidebarItem
                icon={Layers3}
                label="Overview"
                active={view === "overview" && !selectedSession && !selectedSource}
                onClick={() => {
                  setView("overview");
                  setSelectedSession(null);
                  setSelectedSource(null);
                  setMobileNav(false);
                }}
              />
              <SidebarItem
                icon={Activity}
                label="Sessions"
                count={sessions.length}
                active={view === "sessions" || Boolean(selectedSession)}
                onClick={() => {
                  setView("sessions");
                  setSelectedSession(null);
                  setSelectedSource(null);
                  setMobileNav(false);
                }}
              />
              <SidebarItem
                icon={Github}
                label="Sources"
                count={sources.length}
                active={view === "sources" || Boolean(selectedSource)}
                onClick={() => {
                  setView("sources");
                  setSelectedSession(null);
                  setSelectedSource(null);
                  setMobileNav(false);
                }}
              />
            </div>
          </div>
          <div>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Reference
            </div>
            <div className="space-y-1">
              <SidebarItem
                icon={BookOpen}
                label="API reference"
                href="https://jules.google/docs/api/reference/"
              />
              <SidebarItem
                icon={Key}
                label={configured ? "API Key (Active)" : "Connect API Key"}
                onClick={() => setKeyModalOpen(true)}
              />
            </div>
          </div>
        </nav>
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {(user?.name ?? user?.email ?? "J").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{user?.name ?? "Just you"}</div>
              <div className="truncate text-[11px] text-slate-400">{user?.email ?? "Personal workspace"}</div>
            </div>
            <button
              onClick={async () => {
                await signOut();
                window.location.href = "/";
              }}
              className="text-slate-400 hover:text-slate-700"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/20 lg:hidden"
          onClick={() => setMobileNav(false)}
        />
      )}

      <main className="min-h-screen lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-[#f7f8fa]/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg border border-slate-200 bg-white p-2 lg:hidden"
              onClick={() => setMobileNav(true)}
            >
              <Menu className="size-4" />
            </button>
            <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
              <Command className="size-3.5" />
              <span>/</span>
              <span className="text-slate-600">
                {selectedSession ? "Session" : selectedSource ? "Source" : view[0].toUpperCase() + view.slice(1)}
              </span>
            </div>
            {isLiveSyncing && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                Live sync
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-2.5 size-3.5 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search workspace"
                className="h-9 w-52 rounded-lg border-slate-200 bg-white pl-9 text-xs shadow-none"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className={`h-9 gap-2 rounded-lg text-xs transition-colors ${
                configured
                  ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
              }`}
              onClick={() => setKeyModalOpen(true)}
              title={configured ? "Jules API key connected" : "Jules API key not configured"}
            >
              <Key className={`size-3.5 ${configured ? "text-emerald-500" : "text-amber-600"}`} />
              <span className="hidden md:inline">
                {configured ? "API Key" : "Connect Key"}
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-lg border-slate-200 bg-white text-xs"
              onClick={refresh}
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              className="h-9 gap-2 rounded-lg bg-slate-950 text-xs hover:bg-slate-800"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-3.5" />
              New session
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8 lg:px-10">
          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <ShieldCheck className="size-4" />
              <span>{error}</span>
              <button className="ml-auto text-xs font-semibold underline" onClick={refresh}>
                Try again
              </button>
            </div>
          )}
          {configured === false && (
            <ConnectionBanner
              onConnect={handleSaveKey}
              onRefresh={refresh}
              loading={loading}
            />
          )}
          {selectedSession ? (
            <SessionDetail
              session={selectedSession}
              activities={activities}
              message={message}
              setMessage={setMessage}
              sending={sending}
              onSend={sendMessage}
              onApprove={approvePlan}
              onDelete={deleteCurrentSession}
              onBack={() => setSelectedSession(null)}
              isPollingActive={isSelectedSessionActive}
            />
          ) : selectedSource ? (
            <SourceDetail source={selectedSource} onBack={() => setSelectedSource(null)} />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                  <div>
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
                      <span className="size-1.5 rounded-full bg-blue-500" />
                      Jules control room
                    </div>
                    <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[38px]">
                      {view === "overview"
                        ? "Good to see you."
                        : view === "sessions"
                        ? "Your sessions."
                        : "Connected sources."}
                    </h1>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                      {view === "overview"
                        ? "A clear view of every task Jules is running across your repositories."
                        : view === "sessions"
                        ? "Create, inspect, guide, and ship coding work from one focused place."
                        : "Repositories Jules can read and work against. Sources are managed in Jules."}
                    </p>
                  </div>
                  {view !== "overview" && (
                    <div className="relative sm:hidden">
                      <Search className="absolute left-3 top-2.5 size-3.5 text-slate-400" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={`Search ${view}`}
                        className="h-9 rounded-lg border-slate-200 bg-white pl-9 text-xs shadow-none"
                      />
                    </div>
                  )}
                </div>
                {loading ? (
                  <LoadingState />
                ) : view === "overview" ? (
                  <Overview
                    sessions={sessions}
                    sources={sources}
                    activeCount={activeCount}
                    completedCount={completedCount}
                    onSession={openSession}
                    onSource={openSource}
                    onCreate={() => setCreateOpen(true)}
                    onViewSessions={() => setView("sessions")}
                    onViewSources={() => setView("sources")}
                  />
                ) : view === "sessions" ? (
                  <SessionsView
                    sessions={filteredSessions}
                    onSession={openSession}
                    onCreate={() => setCreateOpen(true)}
                    hasMore={Boolean(sessionNextPageToken)}
                    loadingMore={loadingMoreSessions}
                    onLoadMore={loadMoreSessions}
                  />
                ) : (
                  <SourcesView
                    sources={filteredSources}
                    onSource={openSource}
                    hasMore={Boolean(sourceNextPageToken)}
                    loadingMore={loadingMoreSources}
                    onLoadMore={loadMoreSources}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>
      <AnimatePresence>
        {createOpen && (
          <CreateSessionModal
            sources={sources}
            onClose={() => setCreateOpen(false)}
            onCreated={async (session) => {
              setCreateOpen(false);
              setSessions((items) => [session, ...items]);
              await openSession(session);
              toast.success("Session created");
            }}
            run={run}
          />
        )}
        {keyModalOpen && (
          <ApiKeyModal
            isOpen={keyModalOpen}
            onClose={() => setKeyModalOpen(false)}
            configured={configured}
            keySource={keySource}
            currentKey={apiKey}
            keyStorageType={keyStorageType}
            onSave={handleSaveKey}
            onDisconnect={handleClearKey}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  count,
  active,
  onClick,
  href,
}: {
  icon: typeof Activity;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <>
      <Icon className="size-4" />
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && (
        <span className={`${active ? "text-blue-600" : "text-slate-400"} text-[11px]`}>{count}</span>
      )}
    </>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
    >
      {content}
      <ArrowUpRight className="size-3" />
    </a>
  ) : (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors ${
        active ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {content}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[400px] items-center justify-center text-slate-400">
      <div className="flex items-center gap-2 text-sm">
        <RefreshCw className="size-4 animate-spin" />
        Loading Jules workspace
      </div>
    </div>
  );
}

function ConnectionBanner({
  onConnect,
  onRefresh,
  loading,
}: {
  onConnect: (key: string, remember: boolean) => Promise<void>;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [remember, setRemember] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyInput.trim()) {
      toast.error("Please enter a Jules API key");
      return;
    }
    setSubmitting(true);
    try {
      await onConnect(keyInput, remember);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-8 rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 via-white to-blue-50/40 p-5 sm:p-6 shadow-xs">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
            <Key className="size-5" />
          </div>
          <div className="max-w-xl">
            <div className="text-base font-semibold tracking-tight text-slate-900">
              Connect Google Jules API
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Paste your Jules API key below to access your repositories and sessions. You can save it on this device or keep it for this session only.
            </p>
            <div className="mt-2.5 flex items-center gap-3 text-xs">
              <a
                href="https://jules.google.com/settings#api"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
              >
                <span>Get your key from Jules settings</span>
                <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 lg:max-w-md">
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste your Jules API key..."
              className="h-10 rounded-xl border-slate-200 bg-white pr-10 text-xs shadow-none"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Remember on this device</span>
            </label>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-slate-500 hover:bg-slate-100"
                onClick={onRefresh}
                disabled={loading}
              >
                <RefreshCw className={`size-3 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Check backend
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || !keyInput.trim()}
                className="h-8 gap-1.5 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-700"
              >
                {submitting && <RefreshCw className="size-3 animate-spin" />}
                Connect
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ApiKeyModal({
  isOpen: _isOpen,
  onClose,
  configured,
  keySource,
  currentKey,
  keyStorageType,
  onSave,
  onDisconnect,
}: {
  isOpen: boolean;
  onClose: () => void;
  configured: boolean | null;
  keySource: "client" | "env" | "none";
  currentKey: string;
  keyStorageType: "local" | "session" | "none";
  onSave: (key: string, remember: boolean) => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const [newKey, setNewKey] = useState("");
  const [remember, setRemember] = useState(keyStorageType !== "session");
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [isEditing, setIsEditing] = useState(!configured);

  const maskedKey = useMemo(() => {
    if (!currentKey) return "";
    if (currentKey.length <= 8) return "••••••••";
    return currentKey.slice(0, 6) + "••••••••" + currentKey.slice(-4);
  }, [currentKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim()) {
      toast.error("Please enter an API key");
      return;
    }
    setSubmitting(true);
    try {
      await onSave(newKey, remember);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await onDisconnect();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 sm:rounded-2xl sm:p-8"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Key className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Jules API Key</h2>
              <p className="text-xs text-slate-400">Manage connection credentials for Google Jules</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Connection status</span>
              {configured ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  Not configured
                </span>
              )}
            </div>

            {configured && (
              <div className="mt-3 border-t border-slate-200/60 pt-3 text-xs text-slate-600 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Source:</span>
                  <span className="font-medium">
                    {keySource === "client"
                      ? keyStorageType === "local"
                        ? "Saved on this device"
                        : "Current session only"
                      : "Server environment variable"}
                  </span>
                </div>
                {keySource === "client" && maskedKey && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Key:</span>
                    <span className="font-mono text-[11px] text-slate-700">{maskedKey}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {!configured || isEditing ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  {configured ? "Enter new API key" : "Jules API key"}
                </label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="Paste your Jules API key..."
                    required
                    className="h-10 rounded-xl border-slate-200 pr-10 text-xs shadow-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <label className="flex cursor-pointer items-start gap-2.5 text-xs text-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="mt-0.5 size-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium text-slate-700">Remember on this device</div>
                    <div className="text-[11px] text-slate-400">
                      Keeps your key saved on this device. If unchecked, the key is cleared when the app closes.
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-between pt-2">
                <a
                  href="https://jules.google.com/settings#api"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <span>Get Jules API key</span>
                  <ExternalLink className="size-3" />
                </a>

                <div className="flex items-center gap-2">
                  {configured && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 text-xs"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submitting || !newKey.trim()}
                    className="h-9 gap-1.5 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-700"
                  >
                    {submitting && <RefreshCw className="size-3 animate-spin" />}
                    {configured ? "Update key" : "Connect"}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 flex-1 rounded-lg text-xs"
                  onClick={() => setIsEditing(true)}
                >
                  Change API Key
                </Button>
                {keySource === "client" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disconnecting}
                    className="h-9 rounded-lg border-rose-200 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={handleDisconnect}
                  >
                    {disconnecting && <RefreshCw className="size-3 animate-spin mr-1.5" />}
                    Disconnect key
                  </Button>
                )}
              </div>
              <a
                href="https://jules.google.com/settings#api"
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-blue-600"
              >
                <span>Manage keys in Jules settings</span>
                <ExternalLink className="size-3" />
              </a>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Overview({
  sessions,
  sources,
  activeCount,
  completedCount,
  onSession,
  onSource,
  onCreate,
  onViewSessions,
  onViewSources,
}: {
  sessions: Session[];
  sources: Source[];
  activeCount: number;
  completedCount: number;
  onSession: (session: Session) => void;
  onSource: (source: Source) => void;
  onCreate: () => void;
  onViewSessions: () => void;
  onViewSources: () => void;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total sessions" value={sessions.length} icon={Activity} note="All time" />
        <Metric label="Active now" value={activeCount} icon={Play} note="Queued or running" accent="blue" />
        <Metric label="Completed" value={completedCount} icon={Check} note="Ready to review" accent="green" />
        <Metric label="Sources" value={sources.length} icon={Github} note="Connected repos" />
      </div>
      <div className="mt-8 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <SectionHeader title="Recent sessions" action="View all" onAction={onViewSessions} />
          <div className="divide-y divide-slate-100">
            {sessions.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No sessions yet"
                description="Start your first coding task with Jules."
                action="Create session"
                onAction={onCreate}
              />
            ) : (
              sessions.slice(0, 5).map((session) => (
                <SessionRow key={sessionId(session)} session={session} onClick={() => onSession(session)} />
              ))
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white">
          <SectionHeader title="Connected sources" action="View all" onAction={onViewSources} />
          <div className="divide-y divide-slate-100">
            {sources.length === 0 ? (
              <EmptyState
                icon={Github}
                title="No sources found"
                description="Connect a GitHub repository in Jules to see it here."
              />
            ) : (
              sources.slice(0, 4).map((source) => (
                <SourceRow key={sourceId(source)} source={source} onClick={() => onSource(source)} />
              ))
            )}
          </div>
        </section>
      </div>
      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white sm:p-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <Badge className="border-white/10 bg-white/10 text-blue-200">Jules API</Badge>
            <h2 className="mt-4 max-w-md text-2xl font-semibold tracking-tight">
              Move from idea to pull request, without leaving your flow.
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-400">
              Give Jules a task, follow its plan, answer questions, and review the output when it is ready.
            </p>
          </div>
          <Button onClick={onCreate} className="w-fit rounded-lg bg-white text-slate-950 hover:bg-slate-100">
            <Plus className="size-4" />
            Start a session
          </Button>
        </div>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  note,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  note: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div
          className={`flex size-9 items-center justify-center rounded-xl ${
            accent === "blue"
              ? "bg-blue-50 text-blue-600"
              : accent === "green"
              ? "bg-emerald-50 text-emerald-600"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          <Icon className="size-4" />
        </div>
        <MoreHorizontal className="size-4 text-slate-300" />
      </div>
      <div className="mt-5 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs font-medium text-slate-700">{label}</div>
      <div className="mt-1 text-[11px] text-slate-400">{note}</div>
    </div>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <button className="text-[11px] font-semibold text-blue-600 hover:text-blue-700" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

function SessionRow({ session, onClick }: { session: Session; onClick: () => void }) {
  const meta = stateFor(session.state);
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Code2 className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-800">
          {session.title || session.prompt || "Untitled session"}
        </div>
        <div className="mt-1 truncate text-xs text-slate-400">{session.prompt || sessionId(session)}</div>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <Badge variant="outline" className={`${meta.tone} text-[10px]`}>
          <span className={`size-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </Badge>
        <span className="w-24 text-right text-[11px] text-slate-400">
          {shortDate(session.updateTime ?? session.createTime)}
        </span>
      </div>
      <ChevronRight className="size-4 text-slate-300 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function SourceRow({ source, onClick }: { source: Source; onClick: () => void }) {
  const repo = source.githubRepo;
  return (
    <button onClick={onClick} className="group flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-slate-50">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Github className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-800">
          {repo?.owner}/{repo?.repo}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
          <GitBranch className="size-3" />
          {repo?.defaultBranch?.displayName ?? "main"}
          {repo?.isPrivate && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">Private</span>}
        </div>
      </div>
      <ChevronRight className="size-4 text-slate-300" />
    </button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: typeof Inbox;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="size-5" />
      </div>
      <div className="mt-4 text-sm font-semibold">{title}</div>
      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">{description}</p>
      {action && (
        <Button onClick={onAction} size="sm" className="mt-5 rounded-lg bg-slate-950 text-xs">
          {action}
        </Button>
      )}
    </div>
  );
}

function SessionsView({
  sessions,
  onSession,
  onCreate,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  sessions: Session[];
  onSession: (session: Session) => void;
  onCreate: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">All sessions</h2>
          <p className="mt-1 text-xs text-slate-400">{sessions.length} results</p>
        </div>
        <Button onClick={onCreate} size="sm" className="rounded-lg bg-slate-950 text-xs">
          <Plus className="size-3.5" />
          New session
        </Button>
      </div>
      {sessions.length ? (
        <div className="divide-y divide-slate-100">
          {sessions.map((session) => (
            <SessionRow key={sessionId(session)} session={session} onClick={() => onSession(session)} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Inbox}
          title="No matching sessions"
          description="Try a different search or create a new session."
          action="Create session"
          onAction={onCreate}
        />
      )}
      {hasMore && (
        <div className="border-t border-slate-100 p-4 text-center">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="rounded-lg border-slate-200 text-xs"
          >
            {loadingMore && <RefreshCw className="mr-2 size-3 animate-spin" />}
            Load more sessions
          </Button>
        </div>
      )}
    </div>
  );
}

function SourcesView({
  sources,
  onSource,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  sources: Source[];
  onSource: (source: Source) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold">All connected sources</h2>
        <p className="mt-1 text-xs text-slate-400">Read-only from Jules · {sources.length} results</p>
      </div>
      {sources.length ? (
        <div className="divide-y divide-slate-100">
          {sources.map((source) => (
            <SourceRow key={sourceId(source)} source={source} onClick={() => onSource(source)} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Github}
          title="No matching sources"
          description="Connect a GitHub repository to Jules first."
        />
      )}
      {hasMore && (
        <div className="border-t border-slate-100 p-4 text-center">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="rounded-lg border-slate-200 text-xs"
          >
            {loadingMore && <RefreshCw className="mr-2 size-3 animate-spin" />}
            Load more sources
          </Button>
        </div>
      )}
    </div>
  );
}

function FormattedMessage({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-2 text-xs leading-relaxed text-slate-700">
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.slice(3, -3).trim().split("\n");
          let lang = "";
          let code = part.slice(3, -3).trim();
          if (lines[0] && !lines[0].includes(" ") && lines.length > 1) {
            lang = lines[0];
            code = lines.slice(1).join("\n");
          }
          return (
            <div key={i} className="my-2 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-100">
              {lang && (
                <div className="border-b border-slate-800 bg-slate-900/80 px-3 py-1 text-[10px] font-mono text-slate-400">
                  {lang}
                </div>
              )}
              <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-slate-200">{code}</pre>
            </div>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {part.split(/(`[^`]+`)/g).map((subPart, j) => {
              if (subPart.startsWith("`") && subPart.endsWith("`")) {
                return (
                  <code key={j} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">
                    {subPart.slice(1, -1)}
                  </code>
                );
              }
              return subPart;
            })}
          </p>
        );
      })}
    </div>
  );
}

function PlanStepsView({ steps }: { steps: Array<{ title?: string; description?: string }> }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="mt-2.5 overflow-hidden rounded-xl border border-blue-100 bg-blue-50/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between border-b border-blue-100/80 bg-blue-50/80 px-3.5 py-2.5 text-left text-xs font-semibold text-blue-900 transition-colors hover:bg-blue-100/60"
      >
        <span className="flex items-center gap-2">
          <ListOrdered className="size-3.5 text-blue-600" />
          Plan formulated ({steps.length} {steps.length === 1 ? "step" : "steps"})
        </span>
        <span className="text-[11px] font-normal text-blue-600 underline">
          {expanded ? "Collapse" : "Expand"}
        </span>
      </button>
      {expanded && (
        <div className="divide-y divide-blue-100/60 p-3 space-y-2.5">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2.5 pt-2 first:pt-0">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-[10px] font-bold text-blue-800">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-800">{step.title || `Step ${idx + 1}`}</div>
                {step.description && (
                  <p className="mt-0.5 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {step.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityLine({ item }: { item: ActivityItem }) {
  const isAgent = item.originator === "agent";
  const title =
    item.progressUpdated?.title ??
    (item.agentMessaged ? "Jules" : item.userMessaged ? "You" : item.originator ?? "System");
  const rawText =
    item.agentMessaged?.agentMessage ??
    item.userMessaged?.userMessage ??
    item.progressUpdated?.description ??
    item.sessionFailed?.reason ??
    item.description;
  const steps = item.planGenerated?.plan?.steps;

  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      <div
        className={`relative z-10 mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full border-4 border-white ${
          item.sessionFailed
            ? "bg-rose-500"
            : isAgent
            ? "bg-blue-500"
            : item.userMessaged
            ? "bg-slate-700"
            : "bg-slate-300"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-800">{title}</span>
            {item.sessionFailed && (
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700">
                Failed
              </Badge>
            )}
            {item.planGenerated && (
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[9px] text-blue-700">
                Plan
              </Badge>
            )}
          </div>
          <div className="shrink-0 text-[10px] text-slate-400">{shortDate(item.createTime)}</div>
        </div>

        {item.sessionFailed && item.sessionFailed.reason && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="size-4 shrink-0 text-rose-600 mt-0.5" />
            <div className="whitespace-pre-wrap font-mono text-[11px]">{item.sessionFailed.reason}</div>
          </div>
        )}

        {steps && steps.length > 0 && <PlanStepsView steps={steps} />}

        {rawText && !item.sessionFailed && (
          <div className="mt-1">
            <FormattedMessage text={rawText} />
          </div>
        )}
      </div>
    </div>
  );
}

function SessionDetail({
  session,
  activities,
  message,
  setMessage,
  sending,
  onSend,
  onApprove,
  onDelete,
  onBack,
  isPollingActive,
}: {
  session: Session;
  activities: ActivityItem[];
  message: string;
  setMessage: (value: string) => void;
  sending: boolean;
  onSend: () => void;
  onApprove: () => void;
  onDelete: () => void;
  onBack: () => void;
  isPollingActive?: boolean;
}) {
  const meta = stateFor(session.state);
  return (
    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="mx-auto max-w-[1100px]">
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900"
      >
        <ChevronRight className="size-4 rotate-180" />
        Back to sessions
      </button>
      <div className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-start">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="outline" className={`${meta.tone} text-[10px]`}>
              <span className={`size-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </Badge>
            <span className="text-[11px] text-slate-400">{sessionId(session)}</span>
            {isPollingActive && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live updating
              </span>
            )}
          </div>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-[-0.04em]">
            {session.title || "Untitled session"}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{session.prompt}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-lg border-slate-200 bg-white text-xs" onClick={onDelete}>
            <Trash2 className="size-3.5 text-rose-500" />
            Delete
          </Button>
          {session.url && (
            <Button asChild size="sm" className="rounded-lg bg-slate-950 text-xs">
              <a href={session.url} target="_blank" rel="noreferrer">
                Open in Jules
                <ArrowUpRight className="size-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>
      <div className="mt-7 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Activity</h2>
              <p className="mt-1 text-xs text-slate-400">A live record of what Jules is doing</p>
            </div>
            <Activity className="size-4 text-slate-300" />
          </div>
          <div className="px-5 py-5">
            {activities.length ? (
              <div className="relative space-y-0 before:absolute before:bottom-5 before:left-[9px] before:top-5 before:w-px before:bg-slate-200">
                {activities.map((item, index) => (
                  <ActivityLine key={item.name ?? item.id ?? index} item={item} />
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-slate-400">No activities returned yet.</div>
            )}
          </div>
        </div>
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="size-4 text-blue-600" />
              Guide this session
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Send feedback or another instruction while Jules is active.
            </p>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell Jules what to do next…"
              className="mt-4 min-h-[104px] resize-none border-slate-200 text-sm shadow-none"
            />
            <Button
              onClick={onSend}
              disabled={sending || !message.trim()}
              className="mt-3 w-full rounded-lg bg-slate-950 text-xs"
            >
              {sending ? <RefreshCw className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Send message
            </Button>
          </div>
          {session.state === "AWAITING_PLAN_APPROVAL" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <ShieldCheck className="size-4" />
                Plan ready for review
              </div>
              <p className="mt-2 text-xs leading-5 text-amber-800/70">
                Jules is waiting for your approval before it starts making changes.
              </p>
              <Button
                onClick={onApprove}
                size="sm"
                className="mt-4 rounded-lg bg-amber-900 text-xs text-white hover:bg-amber-800"
              >
                <Check className="size-3.5" />
                Approve plan
              </Button>
            </div>
          )}
          {session.outputs?.map(
            (output, index) =>
              output.pullRequest && (
                <a
                  key={index}
                  href={output.pullRequest.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-emerald-200 bg-emerald-50 p-5 hover:bg-emerald-100"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                      <Github className="size-4" />
                      Pull request ready
                    </div>
                    <ArrowUpRight className="size-4 text-emerald-700" />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-emerald-800/70">
                    {output.pullRequest.title ?? "Open the pull request Jules created."}
                  </p>
                </a>
              ),
          )}
        </div>
      </div>
    </motion.div>
  );
}

function SourceDetail({ source, onBack }: { source: Source; onBack: () => void }) {
  const repo = source.githubRepo;
  return (
    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="mx-auto max-w-[900px]">
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900"
      >
        <ChevronRight className="size-4 rotate-180" />
        Back to sources
      </button>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row">
          <div className="flex gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Github className="size-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400">GitHub repository</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {repo?.owner}/{repo?.repo}
              </h1>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <GitBranch className="size-3.5" />
                Default branch: {repo?.defaultBranch?.displayName ?? "main"}
              </div>
            </div>
          </div>
          <Badge variant="outline" className="h-fit border-slate-200 text-[10px]">
            {repo?.isPrivate ? "Private" : "Public"}
          </Badge>
        </div>
        <div className="mt-8 border-t border-slate-100 pt-6">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Available branches</div>
          <div className="flex flex-wrap gap-2">
            {(repo?.branches ?? []).map((branch) => (
              <span
                key={branch.displayName}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600"
              >
                <GitBranch className="size-3.5 text-slate-400" />
                {branch.displayName}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CreateSessionModal({
  sources,
  onClose,
  onCreated,
  run,
}: {
  sources: Source[];
  onClose: () => void;
  onCreated: (session: Session) => void;
  run: (operation: Operation, args?: Record<string, unknown>) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState("");
  const [branch, setBranch] = useState("");
  const [approval, setApproval] = useState(false);
  const [automation, setAutomation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const selected = sources.find((item) => sourceId(item) === source);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const session = await run("createSession", {
        title,
        prompt,
        source,
        startingBranch: branch,
        requirePlanApproval: approval,
        ...(automation ? { automationMode: "AUTO_CREATE_PR" } : {}),
      });
      await onCreated(session as Session);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not create session.");
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-h-[92vh] w-full max-w-[620px] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 sm:rounded-2xl sm:p-8"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-2 flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Sparkles className="size-4" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Start a Jules session</h2>
            <p className="mt-1 text-xs text-slate-400">Describe the work. Jules will plan and execute it.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={submit} className="mt-7 space-y-5">
          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-700">
              Task prompt <span className="text-blue-600">*</span>
            </label>
            <Textarea
              required
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. Add comprehensive unit tests for the authentication module"
              className="min-h-[120px] resize-none border-slate-200 text-sm shadow-none"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-700">
              Session title <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add auth tests"
              className="border-slate-200 text-sm shadow-none"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-700">
                Repository <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <select
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setBranch("");
                }}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Repoless session</option>
                {sources.map((item) => (
                  <option key={sourceId(item)} value={sourceId(item)}>
                    {item.githubRepo?.owner}/{item.githubRepo?.repo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-700">Starting branch</label>
              <select
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                disabled={!selected}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none disabled:bg-slate-50"
              >
                <option value="">
                  {selected ? selected.githubRepo?.defaultBranch?.displayName ?? "main" : "Select a repository"}
                </option>
                {selected?.githubRepo?.branches?.map((item) => (
                  <option key={item.displayName} value={item.displayName}>
                    {item.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-3 rounded-xl bg-slate-50 p-4">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-xs font-semibold text-slate-700">Require plan approval</span>
                <span className="mt-1 block text-[11px] text-slate-400">Pause before Jules makes changes.</span>
              </span>
              <input
                type="checkbox"
                checked={approval}
                onChange={(event) => setApproval(event.target.checked)}
                className="size-4 accent-blue-600"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-xs font-semibold text-slate-700">Auto-create pull request</span>
                <span className="mt-1 block text-[11px] text-slate-400">Ask Jules to open a PR when ready.</span>
              </span>
              <input
                type="checkbox"
                checked={automation}
                onChange={(event) => setAutomation(event.target.checked)}
                className="size-4 accent-blue-600"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
            <Button type="button" variant="outline" className="rounded-lg border-slate-200 text-xs" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !prompt.trim()}
              className="rounded-lg bg-slate-950 text-xs"
            >
              {submitting ? <RefreshCw className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              Create session
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
