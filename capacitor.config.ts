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
    cleartext: false,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
