import { useAuth } from "@clerk/expo";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { type Href, Redirect, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { setRecitationTokenGetter } from "@/lib/recitation";

// IMPORTANT: iOS 26 uses NativeTabs for native tabs with liquid glass support.
// NativeTabs intentionally does NOT use custom design tokens — liquid glass
// is a system-level appearance provided by iOS and cannot be overridden.
// Custom brand colors are applied only on the ClassicTabLayout path (older iOS / Android / web).
function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
    </Tabs>
  );
}

function TabsInner() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

export default function TabLayout() {
  const c = useColors();
  const { isLoaded, isSignedIn, getToken } = useAuth();

  // The analyze/clips calls (manual fetch) and the generated OpenAPI client both
  // need the Clerk bearer token; register the getter once authenticated.
  useEffect(() => {
    if (isSignedIn) {
      setAuthTokenGetter(() => getToken());
      setRecitationTokenGetter(() => getToken());
    } else {
      setAuthTokenGetter(null);
      setRecitationTokenGetter(null);
    }
  }, [isSignedIn, getToken]);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!isSignedIn) return <Redirect href={"/sign-in" as Href} />;

  return <TabsInner />;
}
