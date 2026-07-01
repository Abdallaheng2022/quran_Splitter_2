import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useI18n, type Lang } from "@/lib/i18n";

import { PickerModal, type PickerOption } from "./PickerModal";

// A self-contained language switcher pill that opens the language picker.
// Used on screens (like auth) that are outside the main app header.
export function LanguageSwitcher({ style }: { style?: ViewStyle }) {
  const c = useColors();
  const { t, isRTL, lang, setLang, languages } = useI18n();
  const [open, setOpen] = useState(false);

  const options: PickerOption[] = useMemo(
    () => languages.map((l) => ({ label: l.name, value: l.code })),
    [languages],
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={[styles.btn, { borderColor: c.border, backgroundColor: c.card }, style]}
      >
        <Ionicons name="language-outline" size={16} color={c.mutedForeground} />
        <Text style={[styles.btnText, { color: c.mutedForeground }]}>
          {languages.find((l) => l.code === lang)?.name ?? lang}
        </Text>
      </Pressable>

      <PickerModal
        visible={open}
        title={t("chooseLanguage")}
        options={options}
        selected={lang}
        isRTL={isRTL}
        onSelect={(v) => setLang(v as Lang)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnText: { fontSize: 12, fontWeight: "600" },
});
