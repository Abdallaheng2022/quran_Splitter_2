import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Feather, Ionicons } from "@expo/vector-icons";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import Purchases from "react-native-purchases";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Alert, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LanguageProvider } from "@/lib/i18n";
import {
  initializeRevenueCat,
  isRevenueCatConfigured,
  SubscriptionProvider,
} from "@/lib/revenuecat";

// On web, expo-font's JS FontFace loader can intermittently fail inside the
// embedded preview iframe, leaving icon glyphs as empty boxes (tofu). Injecting
// real CSS @font-face rules lets the browser load and cache the fonts itself,
// which is far more reliable than the one-shot JS loader.
if (Platform.OS === "web" && typeof document !== "undefined") {
  const { Asset } = require("expo-asset");
  const iconFonts = [
    {
      family: "Ionicons",
      mod: require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf"),
    },
    {
      family: "Feather",
      mod: require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf"),
    },
  ];
  const css = iconFonts
    .map(
      (f) =>
        `@font-face{font-family:"${f.family}";src:url("${Asset.fromModule(f.mod).uri}") format("truetype");font-display:block;}`,
    )
    .join("");
  const style = document.createElement("style");
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}

// Expo bundles run outside the web proxy and need absolute URLs to reach the API.
if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
} else if (Platform.OS !== "web" && !__DEV__) {
  // A standalone (EAS) build with no API host baked in will send relative URLs
  // that resolve to nothing on device — surface it instead of failing silently.
  console.error(
    "EXPO_PUBLIC_DOMAIN is not set for this build — every API request will fail. " +
      "Set it in eas.json (build.base.env) to the deployed api-server host and rebuild.",
  );
}

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Configure RevenueCat once at startup. On web (where the native purchases
// module is unavailable) this throws — degrade gracefully so the rest of the
// app (silence method, free trials) keeps working.
try {
  initializeRevenueCat();
} catch (err) {
  const msg = err instanceof Error ? err.message : "Unknown error";
  if (Platform.OS === "web") {
    console.warn("RevenueCat unavailable:", msg);
  } else {
    Alert.alert("RevenueCat Unavailable", msg);
  }
}

// Associate RevenueCat purchases with the signed-in Clerk user so a
// subscription can be restored across devices/reinstalls for that account.
function RevenueCatAuthSync() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId || !isRevenueCatConfigured()) return;
    Purchases.logIn(userId)
      .then(() => qc.invalidateQueries({ queryKey: ["revenuecat"] }))
      .catch(() => {});
  }, [userId, qc]);
  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    // Preload the icon glyph fonts so icons never render as empty boxes (tofu)
    // while the font is still loading, especially on native (Expo Go).
    ...Ionicons.font,
    ...Feather.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      tokenCache={tokenCache}
      proxyUrl={proxyUrl}
    >
      <ClerkLoaded>
        <LanguageProvider>
          <SafeAreaProvider>
            <ErrorBoundary>
              <QueryClientProvider client={queryClient}>
                <SubscriptionProvider>
                  <RevenueCatAuthSync />
                  <GestureHandlerRootView>
                    <KeyboardProvider>
                      <RootLayoutNav />
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </SubscriptionProvider>
              </QueryClientProvider>
            </ErrorBoundary>
          </SafeAreaProvider>
        </LanguageProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
