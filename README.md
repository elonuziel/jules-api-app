# Jules Console (Google Jules Web & Mobile Dashboard)

A personal control room and mobile-ready console for the **Google Jules API**, built with React 19, Vite, Tailwind CSS v4, and Capacitor (Android APK).

---

## 🏛️ Pure Client-Side Standalone Architecture

Jules Console operates **100% client-side**. The Android app and web client connect directly to Google's Jules API (`https://jules.googleapis.com/v1alpha`), requiring no intermediate cloud servers, databases, or third-party hosting platforms.

```
📱 Android APK (CapacitorHttp) ──▶ 🌐 Google Jules API
💻 Web Browser (Vite dev proxy) ──▶ 🌐 Google Jules API
```

### 1. Direct API Engine (`src/lib/jules.ts`)
* **Direct Communication:** Client requests communicate directly with `https://jules.googleapis.com/v1alpha` using your Google Jules API key (`x-goog-api-key` header).
* **Native Android Networking:** Configured with `CapacitorHttp` (`capacitor.config.ts`), routing Android WebView requests through Android's native HTTP stack to completely bypass browser CORS restrictions.
* **Local Web Dev Proxy:** In desktop browser development mode (`bun run dev`), Vite proxies `/jules-api` to Google's endpoint to prevent local browser CORS friction.
* **Built-in Resilience:** Implements jittered exponential backoff (600ms, 1200ms, 2400ms + random jitter) and inspects `Retry-After` headers to automatically handle HTTP `429 (Too Many Requests)` and transient server errors (`500`, `502`, `503`, `504`).
* **Pagination Support:** Seamlessly handles `pageToken` / `nextPageToken` across sessions and connected GitHub source repositories.

### 2. Private & Secure BYOK (Bring Your Own Key)
* **Zero Server Storage:** Your API key is stored strictly on your device/browser and is never sent to any server other than `jules.googleapis.com`.
* **Storage Options:**
  * **Remember on this device (default):** Saves to device `localStorage` so sessions persist across app restarts.
  * **Session-only:** Stores in `sessionStorage`, destroyed immediately when closed.
* **Quick Key Generation:** Connect easily with a key from [jules.google.com/settings#api](https://jules.google.com/settings#api).

### 3. Client-Side GitHub PR Actions (`src/lib/github.ts`)
* **Approve Pull Requests:** Submits a GitHub review with `event: "APPROVE"` directly from the session drawer.
* **Merge Pull Requests:** Squash-and-merges the PR directly from your phone.
* **Delete Feature Branch:** One-tap button to delete the remote branch on GitHub once the PR is merged or closed.
* **GitHub Personal Access Token (PAT):** Saved securely in client device storage with no server middleman.

### 4. Reconfiguring Repositories Shared with Jules
* **GitHub App Permissions:** Jules accesses code through the Google Jules GitHub App. You can add or remove repositories anytime via GitHub settings (`https://github.com/settings/installations`).
* **In-App Management & Sync:** Use the "Manage Repositories" button in the Sources view or Create Session dialog to jump directly to GitHub permissions, and use "Refresh Sources" to sync newly added repositories immediately.

---

## 🚀 Android APK Build Pipeline

The repository includes an automated GitHub Actions CI/CD workflow (`.github/workflows/build-apk.yml`) that builds an Android APK and publishes releases on GitHub.

### Building Locally:
```bash
# 1. Install dependencies
bun install   # or npm install

# 2. Build the web app
bun run build

# 3. Add Android platform (if not already added)
bun run cap:add:android

# 4. Sync assets to Android native project
bun run cap:sync

# 5. Build debug APK
cd android && ./gradlew assembleDebug
```

---

## 🛠️ Tech Stack

* **Frontend:** React 19, TypeScript, Vite
* **Routing:** React Router v7
* **Styling & UI:** Tailwind CSS v4, Radix UI, Lucide Icons, Framer Motion
* **Mobile / Native:** Capacitor v8 (with CapacitorHttp)
* **PWA:** Vite PWA with offline web manifest
