import { Ionicons } from "@expo/vector-icons";
import type { PurchasesPackage } from "react-native-purchases";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/lib/i18n";
import { isRevenueCatTestMode, useSubscription } from "@/lib/revenuecat";

export function Paywall({
  visible,
  onClose,
  onSubscribed,
}: {
  visible: boolean;
  onClose: () => void;
  onSubscribed: () => void;
}) {
  const c = useColors();
  const { t, isRTL } = useI18n();
  const PERKS = [t("perk1"), t("perk2"), t("perk3")];
  const insets = useSafeAreaInsets();
  const { offerings, purchase, restore, isPurchasing, isRestoring } =
    useSubscription();
  const [confirming, setConfirming] = useState(false);

  const pkg: PurchasesPackage | undefined =
    offerings?.current?.availablePackages?.[0];
  const priceString = pkg?.product.priceString;

  async function doPurchase() {
    if (!pkg) return;
    setConfirming(false);
    try {
      await purchase(pkg);
      onSubscribed();
    } catch {
      // User cancelled or the purchase failed; keep the sheet open for retry.
    }
  }

  function onSubscribePress() {
    if (!pkg) return;
    // In the RevenueCat test store there is no native store sheet, so confirm
    // the (simulated) purchase explicitly before charging.
    if (isRevenueCatTestMode) {
      setConfirming(true);
    } else {
      void doPurchase();
    }
  }

  async function onRestore() {
    try {
      await restore();
      onSubscribed();
    } catch {
      // Nothing to restore or it failed; leave the sheet as-is.
    }
  }

  const busy = isPurchasing || isRestoring;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: c.background, paddingBottom: insets.bottom + 20 },
          ]}
        >
          <Pressable onPress={onClose} style={styles.close} hitSlop={10}>
            <Ionicons name="close" size={24} color={c.mutedForeground} />
          </Pressable>

          <View style={[styles.crest, { backgroundColor: c.primary }]}>
            <Ionicons name="sparkles" size={30} color={c.accent} />
          </View>

          <Text style={[styles.title, { color: c.primary }]}>{t("paywallTitle")}</Text>
          <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
            {t("paywallSubtitle")}
          </Text>

          {priceString ? (
            <View style={[styles.priceTag, { borderColor: c.accent }]}>
              <Text style={[styles.price, { color: c.foreground }]}>{priceString}</Text>
              <Text style={[styles.per, { color: c.mutedForeground }]}>{t("perMonth")}</Text>
            </View>
          ) : null}

          <View style={styles.perks}>
            {PERKS.map((p) => (
              <View
                key={p}
                style={[styles.perkRow, { flexDirection: isRTL ? "row" : "row-reverse" }]}
              >
                <Text style={[styles.perkText, { color: c.foreground, textAlign: isRTL ? "right" : "left" }]}>
                  {p}
                </Text>
                <Ionicons name="checkmark-circle" size={20} color={c.primary} />
              </View>
            ))}
          </View>

          <Pressable
            onPress={onSubscribePress}
            disabled={busy || !pkg}
            style={[
              styles.cta,
              { backgroundColor: c.primary, opacity: busy || !pkg ? 0.7 : 1 },
            ]}
          >
            {isPurchasing ? (
              <ActivityIndicator color={c.primaryForeground} />
            ) : (
              <Text style={[styles.ctaText, { color: c.primaryForeground }]}>{t("subscribeNow")}</Text>
            )}
          </Pressable>

          <Pressable onPress={onRestore} disabled={busy} style={styles.restore}>
            {isRestoring ? (
              <ActivityIndicator color={c.mutedForeground} />
            ) : (
              <Text style={[styles.restoreText, { color: c.primary }]}>
                {t("restorePurchases")}
              </Text>
            )}
          </Pressable>

          <Pressable onPress={onClose} style={styles.later}>
            <Text style={[styles.laterText, { color: c.mutedForeground }]}>{t("notNow")}</Text>
          </Pressable>

          {confirming ? (
            <View style={styles.confirmOverlay}>
              <View style={[styles.confirmCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.confirmTitle, { color: c.foreground }]}>
                  {t("paywallTitle")}
                </Text>
                <Text style={[styles.confirmBody, { color: c.mutedForeground }]}>
                  {t("confirmTestPurchase")}
                </Text>
                <View style={styles.confirmRow}>
                  <Pressable
                    onPress={() => setConfirming(false)}
                    style={[styles.confirmBtn, { backgroundColor: c.secondary }]}
                  >
                    <Text style={[styles.confirmBtnText, { color: c.secondaryForeground }]}>
                      {t("notNow")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={doPurchase}
                    style={[styles.confirmBtn, { backgroundColor: c.primary }]}
                  >
                    <Text style={[styles.confirmBtnText, { color: c.primaryForeground }]}>
                      {t("confirm")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(16,38,29,0.55)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    alignItems: "center",
  },
  close: { position: "absolute", top: 16, left: 16, padding: 4 },
  crest: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 },
  priceTag: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 22,
  },
  price: { fontSize: 36, fontWeight: "900" },
  per: { fontSize: 15, marginBottom: 6 },
  perks: { alignSelf: "stretch", marginTop: 24, gap: 14 },
  perkRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 },
  perkText: { fontSize: 15, textAlign: "right", flexShrink: 1 },
  cta: {
    alignSelf: "stretch",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 28,
  },
  ctaText: { fontSize: 17, fontWeight: "700" },
  restore: { marginTop: 16, padding: 6, minHeight: 24, justifyContent: "center" },
  restoreText: { fontSize: 14, fontWeight: "600" },
  later: { marginTop: 8, padding: 6 },
  laterText: { fontSize: 14 },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(16,38,29,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  confirmCard: {
    alignSelf: "stretch",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
  },
  confirmTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  confirmBody: { fontSize: 14, textAlign: "center", marginTop: 10, lineHeight: 20 },
  confirmRow: { flexDirection: "row", gap: 12, marginTop: 22 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmBtnText: { fontSize: 15, fontWeight: "700" },
});
