import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sachamoyne.soma",
  appName: "Soma",
  webDir: "public",
  ios: {
    scheme: "soma",
  },
  server: {
    url: "https://soma-edu.com/decks?app=1",
    iosScheme: "soma",
    allowNavigation: ["soma-edu.com", "*.soma-edu.com"],
  },
};

export default config;
