import { useColors } from "@/hooks/useColors";
import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export interface PickerOption {
  label: string;
  value: number | string;
  sub?: string;
}

interface Props {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selected: number | string;
  searchable?: boolean;
  searchPlaceholder?: string;
  isRTL?: boolean;
  onSelect: (value: number | string) => void;
  onClose: () => void;
}

export function PickerModal({
  visible,
  title,
  options,
  selected,
  searchable,
  searchPlaceholder,
  isRTL = true,
  onSelect,
  onClose,
}: Props) {
  const c = useColors();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchable || query.trim() === "") return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sub ?? "").toLowerCase().includes(q) ||
        String(o.value).includes(q),
    );
  }, [options, query, searchable]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: c.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: c.border }]} />
          </View>
          <Text style={[styles.title, { color: c.foreground }]}>{title}</Text>
          {searchable && (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder ?? "بحث…"}
              placeholderTextColor={c.mutedForeground}
              style={[
                styles.search,
                {
                  borderColor: c.border,
                  color: c.foreground,
                  backgroundColor: c.background,
                  textAlign: isRTL ? "right" : "left",
                },
              ]}
            />
          )}
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.value)}
            initialNumToRender={20}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active = item.value === selected;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.value);
                    setQuery("");
                    onClose();
                  }}
                  style={[
                    styles.row,
                    { borderBottomColor: c.border, flexDirection: isRTL ? "row" : "row-reverse" },
                    active && { backgroundColor: c.secondary },
                  ]}
                >
                  <Text
                    style={[
                      styles.rowLabel,
                      { color: active ? c.primary : c.foreground, textAlign: isRTL ? "right" : "left" },
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.sub ? (
                    <Text style={[styles.rowSub, { color: c.mutedForeground }]}>
                      {item.sub}
                    </Text>
                  ) : null}
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "80%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  handleRow: { alignItems: "center", paddingVertical: 10 },
  handle: { width: 44, height: 5, borderRadius: 3 },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  search: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 10,
    textAlign: "right",
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: { fontSize: 17, fontWeight: "600", textAlign: "right", flex: 1 },
  rowSub: { fontSize: 13, marginLeft: 10 },
});
