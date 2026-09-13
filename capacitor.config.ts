import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.elonuziel.julesapp",
  appName: "Jules Console",
  webDir: "dist",
  backgroundColor: "#020617",
  android: {
    backgroundColor: "#020617",
  },
  server: {
    androidScheme: "https",
    // Jules and Convex use HTTPS in production; keep cleartext disabled by default.
    cleartext: false,
  },
};

export default config;
