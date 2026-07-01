import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/lib/i18n";

export function AboutModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const c = useColors();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();

  const features: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string }[] = [
    { icon: "cut-outline", title: t("aboutFeature1Title"), desc: t("aboutFeature1Desc") },
    { icon: "film-outline", title: t("aboutFeature2Title"), desc: t("aboutFeature2Desc") },
    { icon: "globe-outline", title: t("aboutFeature3Title"), desc: t("aboutFeature3Desc") },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: c.background, paddingBottom: insets.bottom + 20 },
          ]}
        >
          <Pressable onPress={onClose} style={[styles.close, isRTL ? styles.closeRTL : styles.closeLTR]} hitSlop={10}>
            <Ionicons name="close" size={24} color={c.mutedForeground} />
          </Pressable>

          <View style={styles.headerArea}>
            <View style={[styles.crest, { backgroundColor: c.primary }]}>
              <Ionicons name="book" size={30} color={c.accent} />
            </View>
            <Text style={[styles.title, { color: c.primary }]}>{t("aboutTitle")}</Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollBody}
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={[
                styles.intro,
                { color: c.foreground, textAlign: isRTL ? "right" : "left" },
              ]}
            >
              {t("aboutIntro")}
            </Text>

            <View style={styles.features}>
              {features.map((f) => (
                <View
                  key={f.title}
                  style={[
                    styles.featureRow,
                    { flexDirection: isRTL ? "row-reverse" : "row" },
                  ]}
                >
                  <View style={[styles.featureIcon, { backgroundColor: c.secondary }]}>
                    <Ionicons name={f.icon} size={20} color={c.primary} />
                  </View>
                  <View style={styles.featureText}>
                    <Text
                      style={[
                        styles.featureTitle,
                        { color: c.foreground, textAlign: isRTL ? "right" : "left" },
                      ]}
                    >
                      {f.title}
                    </Text>
                    <Text
                      style={[
                        styles.featureDesc,
                        { color: c.mutedForeground, textAlign: isRTL ? "right" : "left" },
                      ]}
                    >
                      {f.desc}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          <Pressable onPress={onClose} style={[styles.cta, { backgroundColor: c.primary }]}>
            <Text style={[styles.ctaText, { color: c.primaryForeground }]}>{t("gotIt")}</Text>
          </Pressable>
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
    maxHeight: "88%",
  },
  close: { position: "absolute", top: 16, padding: 4, zIndex: 2 },
  closeLTR: { left: 16 },
  closeRTL: { right: 16 },
  headerArea: { alignItems: "center" },
  crest: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  scroll: { alignSelf: "stretch", marginTop: 20 },
  scrollBody: { paddingBottom: 8 },
  intro: { fontSize: 15, lineHeight: 23 },
  features: { marginTop: 24, gap: 18 },
  featureRow: { alignItems: "flex-start", gap: 14 },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 16, fontWeight: "700" },
  featureDesc: { fontSize: 14, lineHeight: 20, marginTop: 3 },
  cta: {
    alignSelf: "stretch",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
  },
  ctaText: { fontSize: 17, fontWeight: "700" },
});
