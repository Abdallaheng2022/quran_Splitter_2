import React, { createContext, useContext } from "react";
import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import { useMutation, useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

// Entitlement created by the seed script (scripts/src/seedRevenueCat.ts).
export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro";

// True when running against the RevenueCat test store rather than a real
// app/play store build. Used to gate a purchase confirmation modal.
export const isRevenueCatTestMode =
  __DEV__ ||
  Platform.OS === "web" ||
  Constants.executionEnvironment === "storeClient";

// Pick the single API key that matches the current mode/platform. Only that
// key needs to exist — an Android-only release shouldn't require an iOS key,
// and vice versa.
function getRevenueCatApiKey(): string | null {
  if (isRevenueCatTestMode) return REVENUECAT_TEST_API_KEY ?? null;
  if (Platform.OS === "ios") return REVENUECAT_IOS_API_KEY ?? null;
  if (Platform.OS === "android") return REVENUECAT_ANDROID_API_KEY ?? null;
  return REVENUECAT_TEST_API_KEY ?? null;
}

// Set to true once Purchases.configure() succeeds. On web and in Expo Go the
// native module is unavailable and configure throws, so this stays false and
// the subscription queries below are disabled (no noisy errors; the free
// silence method keeps working).
let _isConfigured = false;
export function isRevenueCatConfigured() {
  return _isConfigured;
}

export function initializeRevenueCat() {
  if (_isConfigured) return;

  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    const target = isRevenueCatTestMode ? "test mode" : Platform.OS;
    throw new Error(
      `RevenueCat API key missing for ${target}. ` +
        `Set the matching EXPO_PUBLIC_REVENUECAT_*_API_KEY ` +
        `(TEST / IOS / ANDROID) for this build.`,
    );
  }

  Purchases.setLogLevel(__DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.WARN);
  Purchases.configure({ apiKey });

  _isConfigured = true;
  console.log("Configured RevenueCat");
}

function useSubscriptionContext() {
  const enabled = isRevenueCatConfigured();

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    enabled,
    queryFn: async () => {
      const info = await Purchases.getCustomerInfo();
      return info;
    },
    staleTime: 60 * 1000,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    enabled,
    queryFn: async () => {
      const offerings = await Purchases.getOfferings();
      return offerings;
    },
    staleTime: 300 * 1000,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (
      packageToPurchase: Parameters<typeof Purchases.purchasePackage>[0],
    ) => {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      return customerInfo;
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      return Purchases.restorePurchases();
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const isSubscribed =
    customerInfoQuery.data?.entitlements.active?.[
      REVENUECAT_ENTITLEMENT_IDENTIFIER
    ] !== undefined;

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    isSubscribed,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return ctx;
}
