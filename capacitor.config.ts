import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sachamoyne.soma",
  appName: "Soma",
  webDir: "public",
  ios: {
    scheme: "soma",
    contentInset: "automatic",
    allowsLinkPreview: false,
  },
  server: {
    url: "https://soma-edu.com/decks?app=1",
    iosScheme: "soma",
    allowNavigation: ["soma-edu.com", "*.soma-edu.com"],
  },
  plugins: {
    // resize: "none" → the WebView frame does NOT shrink when the keyboard appears.
    // The keyboard renders over the app content instead of compressing it.
    // This eliminates the #1 cause of modal jumping: viewport-height recalculation.
    // Note: run `npx cap sync ios` after changing this config.
    Keyboard: {
      resize: "none",
    },
  },
};

export default config;
