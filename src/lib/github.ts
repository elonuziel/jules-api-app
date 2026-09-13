const GITHUB_TOKEN_KEY = "jules_github_access_token";

export interface ParsedPullRequestUrl {
  owner: string;
  repo: string;
  pullNumber: number;
}

export interface GitHubPullRequestInfo {
  state: "open" | "closed";
  merged: boolean;
  mergeable: boolean | null;
  mergeableState?: string;
  headRef: string;
  headSha: string;
  title: string;
  htmlUrl: string;
  userLogin: string;
}

export function parsePullRequestUrl(url: string): ParsedPullRequestUrl | null {
  if (!url) return null;
  // Matches https://github.com/:owner/:repo/pull/:number or /pulls/:number
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pulls?\/(\d+)/);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    pullNumber: parseInt(match[3], 10),
  };
}

export function getStoredGitHubToken(): string {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem(GITHUB_TOKEN_KEY) ||
    sessionStorage.getItem(GITHUB_TOKEN_KEY) ||
    ""
  );
}

export function getStoredGitHubTokenStorageType(): "local" | "session" | "none" {
  if (typeof window === "undefined") return "none";
  if (localStorage.getItem(GITHUB_TOKEN_KEY)) return "local";
  if (sessionStorage.getItem(GITHUB_TOKEN_KEY)) return "session";
  return "none";
}

export function saveStoredGitHubToken(token: string, remember: boolean = true): void {
  const trimmed = token.trim();
  if (!trimmed) {
    clearStoredGitHubToken();
    return;
  }
  if (remember) {
    localStorage.setItem(GITHUB_TOKEN_KEY, trimmed);
    sessionStorage.removeItem(GITHUB_TOKEN_KEY);
  } else {
    sessionStorage.setItem(GITHUB_TOKEN_KEY, trimmed);
    localStorage.removeItem(GITHUB_TOKEN_KEY);
  }
}

export function clearStoredGitHubToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GITHUB_TOKEN_KEY);
  sessionStorage.removeItem(GITHUB_TOKEN_KEY);
}

function getHeaders(token?: string): Record<string, string> {
  const effectiveToken = token?.trim() || getStoredGitHubToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (effectiveToken) {
    headers.Authorization = `Bearer ${effectiveToken}`;
  }
  return headers;
}

export async function getPullRequest(
  url: string,
  token?: string,
): Promise<GitHubPullRequestInfo> {
  const parsed = parsePullRequestUrl(url);
  if (!parsed) throw new Error("Invalid GitHub Pull Request URL.");

  const { owner, repo, pullNumber } = parsed;
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
    {
      headers: getHeaders(token),
    },
  );

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(
      errorData.message || `GitHub returned HTTP ${res.status} when fetching PR.`,
    );
  }

  const data = (await res.json()) as {
    state: "open" | "closed";
    merged: boolean;
    mergeable: boolean | null;
    mergeable_state?: string;
    head?: { ref?: string; sha?: string };
    title?: string;
    html_url?: string;
    user?: { login?: string };
  };

  return {
    state: data.state,
    merged: Boolean(data.merged),
    mergeable: data.mergeable,
    mergeableState: data.mergeable_state,
    headRef: data.head?.ref ?? "",
    headSha: data.head?.sha ?? "",
    title: data.title ?? "",
    htmlUrl: data.html_url ?? url,
    userLogin: data.user?.login ?? "jules",
  };
}

export async function approvePullRequest(
  url: string,
  message?: string,
  token?: string,
): Promise<{ id: number }> {
  const effectiveToken = token?.trim() || getStoredGitHubToken();
  if (!effectiveToken) {
    throw new Error("GitHub Personal Access Token is required to approve pull requests.");
  }

  const parsed = parsePullRequestUrl(url);
  if (!parsed) throw new Error("Invalid GitHub Pull Request URL.");

  const { owner, repo, pullNumber } = parsed;
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
    {
      method: "POST",
      headers: {
        ...getHeaders(effectiveToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "APPROVE",
        body: message?.trim() || "Approved via Jules Console",
      }),
    },
  );

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(
      err.message || `Failed to approve PR (GitHub returned ${res.status}).`,
    );
  }

  return (await res.json()) as { id: number };
}

export async function mergePullRequest(
  url: string,
  mergeMethod: "squash" | "merge" | "rebase" = "squash",
  token?: string,
): Promise<{ sha: string; merged: boolean; message: string }> {
  const effectiveToken = token?.trim() || getStoredGitHubToken();
  if (!effectiveToken) {
    throw new Error("GitHub Personal Access Token is required to merge pull requests.");
  }

  const parsed = parsePullRequestUrl(url);
  if (!parsed) throw new Error("Invalid GitHub Pull Request URL.");

  const { owner, repo, pullNumber } = parsed;
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
    {
      method: "PUT",
      headers: {
        ...getHeaders(effectiveToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        merge_method: mergeMethod,
      }),
    },
  );

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(
      err.message || `Failed to merge PR (GitHub returned ${res.status}).`,
    );
  }

  return (await res.json()) as { sha: string; merged: boolean; message: string };
}

export async function deleteBranch(
  url: string,
  branchName: string,
  token?: string,
): Promise<void> {
  const effectiveToken = token?.trim() || getStoredGitHubToken();
  if (!effectiveToken) {
    throw new Error("GitHub Personal Access Token is required to delete branches.");
  }

  const parsed = parsePullRequestUrl(url);
  if (!parsed) throw new Error("Invalid GitHub Pull Request URL.");

  const { owner, repo } = parsed;
  const cleanBranch = branchName.trim().replace(/^refs\/heads\//, "");
  if (!cleanBranch) throw new Error("Branch name is required.");

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(cleanBranch)}`,
    {
      method: "DELETE",
      headers: getHeaders(effectiveToken),
    },
  );

  if (!res.ok && res.status !== 404 && res.status !== 422) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(
      err.message || `Failed to delete branch ${cleanBranch} (HTTP ${res.status}).`,
    );
  }
}

