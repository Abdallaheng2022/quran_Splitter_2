import { useMemo } from "react";
import { useColorScheme } from "react-native";

import colors from "@/constants/colors";

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Falls back to the light palette when no dark key is defined in
 * constants/colors.ts (the scaffold ships light-only by default).
 * When a sibling web artifact's dark tokens are synced into a `dark`
 * key, this hook will automatically switch palettes based on the
 * device's appearance setting.
 */
export function useColors() {
  const scheme = useColorScheme();
  // Memoize so the returned tokens keep a stable identity across re-renders
  // (only changing when the color scheme does). Components that memoize on `c`
  // — e.g. the per-segment rows that re-render on every playback tick — rely on
  // this to avoid re-rendering the whole list.
  return useMemo(() => {
    const palette =
      scheme === "dark" && "dark" in colors
        ? (colors as Record<string, typeof colors.light>).dark
        : colors.light;
    return { ...palette, radius: colors.radius };
  }, [scheme]);
}
