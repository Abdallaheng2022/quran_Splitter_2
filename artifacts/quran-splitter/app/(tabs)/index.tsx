import { Paywall } from "@/components/Paywall";
import { PickerModal, type PickerOption } from "@/components/PickerModal";
import { AboutModal } from "@/components/AboutModal";
import { RECITERS, DEFAULT_RECITER } from "@/constants/reciters";
import { SURAHS } from "@/constants/surahs";
import { useColors } from "@/hooks/useColors";
import { useSegmentPlayer } from "@/hooks/useSegmentPlayer";
import { useI18n, type Lang } from "@/lib/i18n";
import {
  analyzeAudio,
  createClips,
  downloadUrl,
  PaywallError,
  type Segment,
  type SplitLevel,
  type SplitMethod,
} from "@/lib/recitation";
import { useAuth } from "@clerk/expo";
import { useGetMe } from "@workspace/api-client-react";
import { useSubscription } from "@/lib/revenuecat";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { setAudioModeAsync } from "expo-audio";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LEVELS: { value: SplitLevel; key: "level_ayah" | "level_page" | "level_rub" | "level_hizb" | "level_juz" }[] = [
  { value: "ayah", key: "level_ayah" },
  { value: "page", key: "level_page" },
  { value: "rub", key: "level_rub" },
  { value: "hizb", key: "level_hizb" },
  { value: "juz", key: "level_juz" },
];

type Phase = "setup" | "analyzing" | "review";

interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Precise marker (with tenths of a second) shown next to each boundary control
// so the user can see the exact point they are fine-tuning.
function fmtPrecise(sec: number): string {
  // Round to tenths first so a value like 59.97 carries into the next minute
  // instead of rendering as "0:60.0".
  const tenths = Math.round(sec * 10);
  const m = Math.floor(tenths / 600);
  const s = (tenths % 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL, lang, setLang, languages } = useI18n();
  const { signOut } = useAuth();
  const me = useGetMe();
  const account = me.data;
  const { isSubscribed } = useSubscription();

  const [showPaywall, setShowPaywall] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const [phase, setPhase] = useState<Phase>("setup");
  const [file, setFile] = useState<PickedFile | null>(null);

  const [surah, setSurah] = useState(1);
  const [level, setLevel] = useState<SplitLevel>("ayah");
  const [method, setMethod] = useState<SplitMethod>("silence");
  const [edition, setEdition] = useState(DEFAULT_RECITER);

  const [picker, setPicker] = useState<null | "surah" | "reciter" | "language">(null);

  const [audioId, setAudioId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [downloading, setDownloading] = useState(false);

  const player = useSegmentPlayer(file?.uri ?? null);
  const { stop: playerStop, seek: playerSeek, toggle: playerToggle } = player;

  // Live segments without re-creating callbacks: lets the row callbacks stay
  // stable so memoized rows don't all re-render on every drag/playback tick.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  const surahOptions: PickerOption[] = useMemo(
    () =>
      SURAHS.map((s) => ({
        label: `${s.number}. ${isRTL ? s.name : s.englishName}`,
        value: s.number,
        sub: `${isRTL ? s.englishName : s.name} · ${s.ayahs} ${t("ayahs")}`,
      })),
    [isRTL, t],
  );

  const reciterOptions: PickerOption[] = useMemo(
    () => RECITERS.map((r) => ({ label: isRTL ? r.name : (r.latinName ?? r.name), value: r.id })),
    [isRTL],
  );

  const languageOptions: PickerOption[] = useMemo(
    () => languages.map((l) => ({ label: l.name, value: l.code })),
    [languages],
  );

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    setFile({
      uri: a.uri,
      name: a.name ?? t("defaultRecitationFile"),
      mimeType: a.mimeType ?? "audio/mpeg",
    });
  }

  async function analyzeFile(target: PickedFile, surahNum: number) {
    const isPro = isSubscribed;
    // Both split methods get a few free uses, then need a subscription.
    // Surface the paywall before upload once those free uses are exhausted.
    if (account && !isPro && account.trialsRemaining <= 0) {
      setPhase("setup");
      setShowPaywall(true);
      return;
    }
    const ayahCount = SURAHS[surahNum - 1]?.ayahs ?? 1;
    setPhase("analyzing");
    try {
      const res = await analyzeAudio({
        uri: target.uri,
        fileName: target.name,
        mimeType: target.mimeType,
        surahStart: surahNum,
        ayahStart: 1,
        surahEnd: surahNum,
        ayahEnd: ayahCount,
        level,
        method,
        edition,
        subscribed: isSubscribed,
      });
      setAudioId(res.audioId);
      setDuration(res.duration);
      setSegments(res.segments);
      setPhase("review");
      void me.refetch();
    } catch (err) {
      setPhase("setup");
      if (err instanceof PaywallError) {
        void me.refetch();
        setShowPaywall(true);
        return;
      }
      Alert.alert(t("analyzeFailed"), err instanceof Error ? err.message : t("genericError"));
    }
  }

  async function runAnalyze() {
    if (!file) {
      Alert.alert(t("alertNotice"), t("chooseFileFirst"));
      return;
    }
    await analyzeFile(file, surah);
  }

  const nudge = useCallback(
    (index: number, edge: "start" | "end", delta: number) => {
      playerStop();
      setSegments((prev) =>
        prev.map((seg, i) => {
          if (i !== index) return seg;
          if (edge === "start") {
            const min = i > 0 ? prev[i - 1]!.endSec : 0;
            const next = Math.max(min, Math.min(seg.endSec - 0.3, seg.startSec + delta));
            return { ...seg, startSec: Math.round(next * 100) / 100 };
          } else {
            const max = i < prev.length - 1 ? prev[i + 1]!.startSec : duration;
            const next = Math.min(max, Math.max(seg.startSec + 0.3, seg.endSec + delta));
            return { ...seg, endSec: Math.round(next * 100) / 100 };
          }
        }),
      );
    },
    [duration, playerStop],
  );

  // Absolute set used by the draggable slider handles. Same neighbour clamps as
  // `nudge`, but takes the exact target value coming from the gesture position.
  const setBoundary = useCallback(
    (index: number, edge: "start" | "end", value: number) => {
      setSegments((prev) =>
        prev.map((seg, i) => {
          if (i !== index) return seg;
          if (edge === "start") {
            const min = i > 0 ? prev[i - 1]!.endSec : 0;
            const next = Math.max(min, Math.min(seg.endSec - 0.3, value));
            return { ...seg, startSec: Math.round(next * 100) / 100 };
          } else {
            const max = i < prev.length - 1 ? prev[i + 1]!.startSec : duration;
            const next = Math.min(max, Math.max(seg.startSec + 0.3, value));
            return { ...seg, endSec: Math.round(next * 100) / 100 };
          }
        }),
      );
    },
    [duration],
  );

  const onToggleSegment = useCallback(
    (i: number) => {
      const s = segmentsRef.current[i];
      if (s) playerToggle(i, s.startSec, s.endSec);
    },
    [playerToggle],
  );

  const onScrubSegment = useCallback(() => playerStop(), [playerStop]);
  const onSeekSegment = useCallback((value: number) => playerSeek(value), [playerSeek]);

  async function downloadClips() {
    if (!audioId) return;
    setDownloading(true);
    player.stop();
    try {
      const res = await createClips(
        audioId,
        segments.map((s) => ({ label: s.labelAr, startSec: s.startSec, endSec: s.endSec })),
      );
      if (Platform.OS === "web") {
        // Native FileSystem/Sharing don't exist on web. The GET route sets
        // Content-Disposition: attachment, so opening the URL downloads the zip.
        // Open in a new tab first (works inside the sandboxed preview iframe),
        // and fall back to an anchor click if popups are blocked.
        const url = downloadUrl(res.downloadId);
        const win = window.open(url, "_blank", "noopener,noreferrer");
        if (!win) {
          const a = document.createElement("a");
          a.href = url;
          a.download = `quran_clips_${Date.now()}.zip`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        return;
      }
      const target = `${FileSystem.cacheDirectory}quran_clips_${Date.now()}.zip`;
      const dl = await FileSystem.downloadAsync(downloadUrl(res.downloadId), target);
      if (dl.status !== 200) throw new Error(t("downloadFailed"));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dl.uri, {
          mimeType: "application/zip",
          dialogTitle: t("saveClipsDialog"),
        });
      } else {
        Alert.alert(t("done"), t("savedClips", { count: res.count, path: dl.uri }));
      }
    } catch (err) {
      Alert.alert(t("downloadFailed"), err instanceof Error ? err.message : t("genericError"));
    } finally {
      setDownloading(false);
    }
  }

  function reset() {
    player.stop();
    setPhase("setup");
    setSegments([]);
    setAudioId(null);
  }

  const surahName = (n: number) => {
    const s = SURAHS[n - 1];
    if (!s) return t("surahNum", { n });
    return isRTL ? s.name : s.englishName;
  };

  return (
    <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => signOut()} hitSlop={8} style={styles.signOut}>
              <Ionicons name="log-out-outline" size={22} color={c.mutedForeground} />
            </Pressable>
            <Pressable
              onPress={() => setPicker("language")}
              hitSlop={8}
              style={[styles.langBtn, { borderColor: c.border }]}
            >
              <Ionicons name="language-outline" size={16} color={c.mutedForeground} />
              <Text style={[styles.langBtnText, { color: c.mutedForeground }]}>
                {languages.find((l) => l.code === lang)?.name ?? lang}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowAbout(true)}
              hitSlop={8}
              style={styles.signOut}
              accessibilityLabel={t("aboutTitle")}
            >
              <Ionicons name="information-circle-outline" size={22} color={c.mutedForeground} />
            </Pressable>
          </View>
          {account ? (
            <Pressable
              onPress={() => {
                if (!isSubscribed) setShowPaywall(true);
              }}
              style={[
                styles.statusChip,
                {
                  backgroundColor: isSubscribed ? c.primary : c.secondary,
                  borderColor: isSubscribed ? c.primary : c.accent,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  { color: isSubscribed ? c.primaryForeground : c.secondaryForeground },
                ]}
              >
                {isSubscribed
                  ? t("subscribed")
                  : t("freeUsesLeft", { count: account.trialsRemaining })}
              </Text>
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>
        <Text style={[styles.appTitle, { color: c.primary }]}>{t("appTitle")}</Text>
        <Text style={[styles.appSub, { color: c.mutedForeground }]}>{t("appSubtitle")}</Text>
      </View>

      {phase === "review" ? (
        <ReviewView
          c={c}
          t={t}
          isRTL={isRTL}
          segments={segments}
          duration={duration}
          insetsBottom={insets.bottom}
          playingIndex={player.playingIndex}
          position={player.position}
          onToggle={onToggleSegment}
          onNudge={nudge}
          onSet={setBoundary}
          onScrub={onScrubSegment}
          onSeek={onSeekSegment}
          onBack={reset}
          onDownload={downloadClips}
          downloading={downloading}
          fmt={fmt}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={pickFile}
            disabled={phase === "analyzing"}
            style={[
              styles.uploadCard,
              { borderColor: file ? c.primary : c.border, backgroundColor: c.card },
            ]}
          >
            <Ionicons
              name={file ? "musical-note" : "cloud-upload-outline"}
              size={34}
              color={file ? c.primary : c.mutedForeground}
            />
            <Text style={[styles.uploadTitle, { color: c.foreground }]}>
              {file ? file.name : t("chooseAudio")}
            </Text>
            <Text style={[styles.uploadSub, { color: c.mutedForeground }]}>
              {file ? t("tapToChange") : t("audioFormats")}
            </Text>
          </Pressable>

          <Text style={[styles.sectionLabel, { color: c.foreground, textAlign: isRTL ? "right" : "left" }]}>{t("surah")}</Text>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <RangeRow
              c={c}
              isRTL={isRTL}
              label={`${SURAHS[surah - 1]?.ayahs ?? 0} ${t("ayahs")} · ${
                isRTL ? (SURAHS[surah - 1]?.englishName ?? "") : (SURAHS[surah - 1]?.name ?? "")
              }`}
              value={surahName(surah)}
              onPress={() => setPicker("surah")}
              last
            />
          </View>

          <Text style={[styles.sectionLabel, { color: c.foreground, textAlign: isRTL ? "right" : "left" }]}>{t("splitMethod")}</Text>
          <View style={styles.methodCol}>
            <MethodCard
              c={c}
              isRTL={isRTL}
              active={method === "silence"}
              icon="pulse-outline"
              title={t("method_silence_title")}
              subtitle={
                isSubscribed
                  ? t("silenceDesc")
                  : `${t("silenceDesc")} · ${t("freeUsesLeft", { count: account?.trialsRemaining ?? 0 })}`
              }
              onPress={() => setMethod("silence")}
            />
            <MethodCard
              c={c}
              isRTL={isRTL}
              active={method === "refdtw"}
              icon="git-compare-outline"
              title={t("method_refdtw_title")}
              subtitle={
                isSubscribed
                  ? `${t("refdtwDesc")} ${t("approximateNote")}`
                  : `${t("refdtwDesc")} · ${t("freeUsesLeft", { count: account?.trialsRemaining ?? 0 })}`
              }
              onPress={() => setMethod("refdtw")}
            />
          </View>

          {method === "refdtw" ? (
            <View
              style={[
                styles.card,
                { backgroundColor: c.card, borderColor: c.border, marginTop: 10 },
              ]}
            >
              <RangeRow
                c={c}
                isRTL={isRTL}
                label={t("referenceReciter")}
                value={
                  isRTL
                    ? (RECITERS.find((r) => r.id === edition)?.name ?? edition)
                    : (RECITERS.find((r) => r.id === edition)?.latinName ?? edition)
                }
                onPress={() => setPicker("reciter")}
                last
              />
            </View>
          ) : null}

          <Text style={[styles.sectionLabel, { color: c.foreground, textAlign: isRTL ? "right" : "left" }]}>{t("splitLevel")}</Text>
          <View style={[styles.levelRow, { justifyContent: isRTL ? "flex-end" : "flex-start" }]}>
            {LEVELS.map((l) => {
              const active = l.value === level;
              return (
                <Pressable
                  key={l.value}
                  onPress={() => setLevel(l.value)}
                  style={[
                    styles.levelChip,
                    {
                      backgroundColor: active ? c.primary : c.card,
                      borderColor: active ? c.primary : c.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.levelText,
                      { color: active ? c.primaryForeground : c.foreground },
                    ]}
                  >
                    {t(l.key)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={runAnalyze}
            disabled={phase === "analyzing"}
            style={[
              styles.primaryBtn,
              { backgroundColor: c.primary, opacity: phase === "analyzing" ? 0.7 : 1 },
            ]}
          >
            {phase === "analyzing" ? (
              <>
                <ActivityIndicator color={c.primaryForeground} />
                <Text style={[styles.primaryBtnText, { color: c.primaryForeground }]}>
                  {t("analyzing")}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="cut-outline" size={20} color={c.primaryForeground} />
                <Text style={[styles.primaryBtnText, { color: c.primaryForeground }]}>
                  {t("analyzeSplit")}
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      )}

      <PickerModal
        visible={picker === "surah"}
        title={t("chooseSurah")}
        searchPlaceholder={t("search")}
        options={surahOptions}
        selected={surah}
        searchable
        isRTL={isRTL}
        onSelect={(v) => setSurah(v as number)}
        onClose={() => setPicker(null)}
      />
      <PickerModal
        visible={picker === "reciter"}
        title={t("chooseReciter")}
        searchPlaceholder={t("search")}
        options={reciterOptions}
        selected={edition}
        isRTL={isRTL}
        onSelect={(v) => setEdition(v as string)}
        onClose={() => setPicker(null)}
      />
      <PickerModal
        visible={picker === "language"}
        title={t("chooseLanguage")}
        options={languageOptions}
        selected={lang}
        isRTL={isRTL}
        onSelect={(v) => setLang(v as Lang)}
        onClose={() => setPicker(null)}
      />

      <Paywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSubscribed={() => {
          void me.refetch();
          setShowPaywall(false);
        }}
      />

      <AboutModal visible={showAbout} onClose={() => setShowAbout(false)} />
    </View>
  );
}

function RangeRow({
  c,
  isRTL,
  label,
  value,
  onPress,
  last,
}: {
  c: ReturnType<typeof useColors>;
  isRTL: boolean;
  label: string;
  value: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.rangeRow,
        { flexDirection: isRTL ? "row" : "row-reverse" },
        !last && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={c.mutedForeground} />
      <View style={{ alignItems: isRTL ? "flex-end" : "flex-start" }}>
        <Text style={[styles.rangeValue, { color: c.primary }]}>{value}</Text>
        <Text style={[styles.rangeLabel, { color: c.mutedForeground }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

function MethodCard({
  c,
  isRTL,
  active,
  icon,
  title,
  subtitle,
  badge,
  onPress,
}: {
  c: ReturnType<typeof useColors>;
  isRTL: boolean;
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.methodCard,
        { flexDirection: isRTL ? "row" : "row-reverse" },
        {
          backgroundColor: c.card,
          borderColor: active ? c.primary : c.border,
          borderWidth: active ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View
        style={[
          styles.methodIcon,
          { backgroundColor: active ? c.primary : c.secondary },
        ]}
      >
        <Ionicons
          name={icon}
          size={22}
          color={active ? c.primaryForeground : c.secondaryForeground}
        />
      </View>
      <View style={styles.methodText}>
        <View style={[styles.methodTitleRow, { justifyContent: isRTL ? "flex-end" : "flex-start" }]}>
          <Text style={[styles.methodTitle, { color: c.foreground, textAlign: isRTL ? "right" : "left" }]}>
            {title}
          </Text>
          {badge ? (
            <Text style={[styles.methodBadge, { color: c.accent }]}>{badge}</Text>
          ) : null}
        </View>
        <Text style={[styles.methodSub, { color: c.mutedForeground, textAlign: isRTL ? "right" : "left" }]}>
          {subtitle}
        </Text>
      </View>
      <Ionicons
        name={active ? "radio-button-on" : "radio-button-off"}
        size={20}
        color={active ? c.primary : c.mutedForeground}
      />
    </Pressable>
  );
}

function ReviewView({
  c,
  segments,
  duration,
  insetsBottom,
  playingIndex,
  position,
  onToggle,
  onNudge,
  onSet,
  onScrub,
  onSeek,
  onBack,
  onDownload,
  downloading,
  fmt,
  t,
  isRTL,
}: {
  c: ReturnType<typeof useColors>;
  t: ReturnType<typeof useI18n>["t"];
  isRTL: boolean;
  segments: Segment[];
  duration: number;
  insetsBottom: number;
  playingIndex: number | null;
  position: number;
  onToggle: (i: number) => void;
  onNudge: (i: number, edge: "start" | "end", delta: number) => void;
  onSet: (i: number, edge: "start" | "end", value: number) => void;
  onScrub: () => void;
  onSeek: (value: number) => void;
  onBack: () => void;
  onDownload: () => void;
  downloading: boolean;
  fmt: (s: number) => string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.reviewBar}>
        <Pressable onPress={onBack} style={[styles.backBtn, { flexDirection: isRTL ? "row" : "row-reverse" }]}>
          <Ionicons name={isRTL ? "arrow-forward" : "arrow-back"} size={20} color={c.primary} />
          <Text style={[styles.backText, { color: c.primary }]}>{t("editRange")}</Text>
        </Pressable>
        <Text style={[styles.reviewCount, { color: c.mutedForeground }]}>
          {t("segmentCount", { count: segments.length })}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insetsBottom + 100 }}>
        {segments.map((seg, i) => {
          const playing = playingIndex === i;
          return (
            <SegmentRow
              key={seg.index}
              c={c}
              index={i}
              seg={seg}
              min={i > 0 ? segments[i - 1]!.endSec : 0}
              max={i < segments.length - 1 ? segments[i + 1]!.startSec : duration}
              playing={playing}
              // Only the playing row receives the live position; every other
              // row gets a constant 0 so React.memo skips re-rendering them on
              // each 100ms playback tick.
              positionSec={playing ? position : 0}
              onToggle={onToggle}
              onNudge={onNudge}
              onSet={onSet}
              onScrub={onScrub}
              onSeek={onSeek}
              fmt={fmt}
              t={t}
              isRTL={isRTL}
            />
          );
        })}
      </ScrollView>

      <View
        style={[
          styles.downloadBar,
          { backgroundColor: c.card, borderTopColor: c.border, paddingBottom: insetsBottom + 12 },
        ]}
      >
        <Pressable
          onPress={onDownload}
          disabled={downloading}
          style={[styles.primaryBtn, { backgroundColor: c.primary, opacity: downloading ? 0.7 : 1, marginTop: 0 }]}
        >
          {downloading ? (
            <>
              <ActivityIndicator color={c.primaryForeground} />
              <Text style={[styles.primaryBtnText, { color: c.primaryForeground }]}>
                {t("preparing")}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="download-outline" size={20} color={c.primaryForeground} />
              <Text style={[styles.primaryBtnText, { color: c.primaryForeground }]}>
                {t("downloadZip")}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Adjust({
  c,
  title,
  value,
  onMinus,
  onPlus,
}: {
  c: ReturnType<typeof useColors>;
  title: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={[styles.adjust, { borderColor: c.border }]}>
      <Pressable onPress={onMinus} style={styles.adjustBtn} hitSlop={8}>
        <Ionicons name="remove" size={18} color={c.foreground} />
      </Pressable>
      <View style={styles.adjustCenter}>
        <Text style={[styles.adjustTitle, { color: c.mutedForeground }]}>{title}</Text>
        <Text style={[styles.adjustValue, { color: c.foreground }]}>{value}</Text>
      </View>
      <Pressable onPress={onPlus} style={styles.adjustBtn} hitSlop={8}>
        <Ionicons name="add" size={18} color={c.foreground} />
      </Pressable>
    </View>
  );
}

// One segment card. Memoized so that, on each 100ms playback tick, only the
// currently-playing row (whose `positionSec` changes) re-renders — the rest keep
// their previous render because every other prop they receive is stable.
const SegmentRow = memo(function SegmentRow({
  c,
  index,
  seg,
  min,
  max,
  playing,
  positionSec,
  onToggle,
  onNudge,
  onSet,
  onScrub,
  onSeek,
  fmt,
  t,
  isRTL,
}: {
  c: ReturnType<typeof useColors>;
  index: number;
  seg: Segment;
  min: number;
  max: number;
  playing: boolean;
  positionSec: number;
  onToggle: (i: number) => void;
  onNudge: (i: number, edge: "start" | "end", delta: number) => void;
  onSet: (i: number, edge: "start" | "end", value: number) => void;
  onScrub: () => void;
  onSeek: (value: number) => void;
  fmt: (s: number) => string;
  t: ReturnType<typeof useI18n>["t"];
  isRTL: boolean;
}) {
  return (
    <View
      style={[
        styles.segCard,
        { backgroundColor: c.card, borderColor: playing ? c.primary : c.border },
      ]}
    >
      <View style={[styles.segHead, { flexDirection: isRTL ? "row" : "row-reverse" }]}>
        <Pressable
          onPress={() => onToggle(index)}
          style={[styles.playBtn, { backgroundColor: playing ? c.accent : c.primary }]}
        >
          <Ionicons
            name={playing ? "pause" : "play"}
            size={20}
            color={playing ? c.accentForeground : c.primaryForeground}
          />
        </Pressable>
        <View style={[styles.segLabelWrap, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
          <Text
            style={[styles.segLabel, { color: c.foreground, textAlign: isRTL ? "right" : "left" }]}
            numberOfLines={2}
          >
            {seg.labelAr}
          </Text>
          <Text style={[styles.segTime, { color: c.mutedForeground }]}>
            {fmt(seg.startSec)} ← {fmt(seg.endSec)} ·{" "}
            {(seg.endSec - seg.startSec).toFixed(1)} {t("secondsShort")}
          </Text>
        </View>
      </View>

      <SegmentSlider
        c={c}
        startSec={seg.startSec}
        endSec={seg.endSec}
        min={min}
        max={max}
        playing={playing}
        positionSec={positionSec}
        onScrubStart={onScrub}
        onSet={(edge, value) => onSet(index, edge, value)}
        onSeek={onSeek}
      />

      <View style={styles.adjustRow}>
        <Adjust
          c={c}
          title={t("startLabel")}
          value={fmtPrecise(seg.startSec)}
          onMinus={() => onNudge(index, "start", -0.3)}
          onPlus={() => onNudge(index, "start", 0.3)}
        />
        <Adjust
          c={c}
          title={t("endLabel")}
          value={fmtPrecise(seg.endSec)}
          onMinus={() => onNudge(index, "end", -0.3)}
          onPlus={() => onNudge(index, "end", 0.3)}
        />
      </View>
    </View>
  );
});

const HANDLE = 26;

// Draggable range bar for one segment. The track maps the segment's allowed
// window [min, max] (bounded by its neighbours) to pixels; two handles set the
// start and end. Kept LTR so time always flows left→right even in the RTL UI.
// Uses PanResponder (works on web + native) and reads live values from refs so
// a single responder instance survives re-renders mid-drag.
function SegmentSlider({
  c,
  startSec,
  endSec,
  min,
  max,
  playing,
  positionSec,
  onScrubStart,
  onSet,
  onSeek,
}: {
  c: ReturnType<typeof useColors>;
  startSec: number;
  endSec: number;
  min: number;
  max: number;
  playing: boolean;
  positionSec: number;
  onScrubStart: () => void;
  onSet: (edge: "start" | "end", value: number) => void;
  onSeek: (value: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const startRef = useRef(startSec);
  const endRef = useRef(endSec);
  const grantRef = useRef(0);
  const cbRef = useRef({ onScrubStart, onSet, onSeek });
  minRef.current = min;
  maxRef.current = max;
  startRef.current = startSec;
  endRef.current = endSec;
  cbRef.current = { onScrubStart, onSet, onSeek };

  const responders = useMemo(() => {
    const make = (edge: "start" | "end") =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          grantRef.current = edge === "start" ? startRef.current : endRef.current;
          cbRef.current.onScrubStart();
        },
        onPanResponderMove: (_e, g) => {
          const w = widthRef.current || 1;
          const range = Math.max(0.001, maxRef.current - minRef.current);
          const value = grantRef.current + (g.dx / w) * range;
          cbRef.current.onSet(edge, value);
        },
      });
    return { start: make("start"), end: make("end") };
  }, []);

  // Seeks playback by tapping/dragging anywhere on the track. Active only while
  // this segment plays; clamps the target to [startSec, endSec] so you can only
  // jump within the segment's own window.
  const seekResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const w = widthRef.current || 1;
          const range = Math.max(0.001, maxRef.current - minRef.current);
          const x = e.nativeEvent.locationX;
          const value = minRef.current + (x / w) * range;
          const clamped = Math.max(startRef.current, Math.min(endRef.current, value));
          grantRef.current = clamped;
          cbRef.current.onSeek(clamped);
        },
        onPanResponderMove: (_e, g) => {
          const w = widthRef.current || 1;
          const range = Math.max(0.001, maxRef.current - minRef.current);
          const value = grantRef.current + (g.dx / w) * range;
          const clamped = Math.max(startRef.current, Math.min(endRef.current, value));
          cbRef.current.onSeek(clamped);
        },
      }),
    [],
  );

  const range = Math.max(0.001, max - min);
  const startLeft = width ? ((startSec - min) / range) * width : 0;
  const endLeft = width ? ((endSec - min) / range) * width : 0;
  const clampedPos = Math.max(startSec, Math.min(endSec, positionSec));
  const playheadLeft = width ? ((clampedPos - min) / range) * width : 0;

  return (
    <View style={styles.sliderWrap}>
      <View
        style={[styles.sliderTrack, { backgroundColor: c.secondary }]}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          widthRef.current = w;
          setWidth(w);
        }}
      >
        {/* Transparent overlay that captures taps/drags to seek, active only
            while playing. Sits under the handles (declared first) so the start/
            end handles still win the gesture when grabbed. */}
        {playing ? (
          <View
            {...seekResponder.panHandlers}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          pointerEvents="none"
          style={[
            styles.sliderFill,
            {
              left: startLeft,
              width: Math.max(0, endLeft - startLeft),
              backgroundColor: c.primary,
            },
          ]}
        />
        {playing ? (
          <View
            pointerEvents="none"
            style={[styles.sliderPlayhead, { left: playheadLeft - 1, backgroundColor: c.accent }]}
          />
        ) : null}
        <View
          {...responders.start.panHandlers}
          style={[
            styles.sliderHandle,
            { left: startLeft - HANDLE / 2, borderColor: c.primary, backgroundColor: c.card },
          ]}
        >
          <View style={[styles.sliderHandleDot, { backgroundColor: c.primary }]} />
        </View>
        <View
          {...responders.end.panHandlers}
          style={[
            styles.sliderHandle,
            { left: endLeft - HANDLE / 2, borderColor: c.primary, backgroundColor: c.card },
          ]}
        >
          <View style={[styles.sliderHandleDot, { backgroundColor: c.primary }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  signOut: { padding: 2 },
  langBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  langBtnText: { fontSize: 12, fontWeight: "600" },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusText: { fontSize: 13, fontWeight: "700" },
  appTitle: { fontSize: 26, fontWeight: "800", textAlign: "center" },
  appSub: { fontSize: 13, textAlign: "center", marginTop: 4 },
  body: { padding: 16 },
  uploadCard: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 18,
    paddingVertical: 28,
    alignItems: "center",
    gap: 6,
  },
  uploadTitle: { fontSize: 16, fontWeight: "700", marginTop: 6, textAlign: "center", paddingHorizontal: 16 },
  uploadSub: { fontSize: 13 },
  sampleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sampleText: { fontSize: 14, fontWeight: "600" },
  sectionLabel: { fontSize: 16, fontWeight: "700", marginTop: 22, marginBottom: 10, textAlign: "right" },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 14 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  rangeRight: { alignItems: "flex-end" },
  rangeValue: { fontSize: 16, fontWeight: "700" },
  rangeLabel: { fontSize: 12, marginTop: 2 },
  methodCol: { gap: 10 },
  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    padding: 14,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  methodText: { flex: 1 },
  methodTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  methodTitle: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  methodBadge: { fontSize: 14, fontWeight: "800" },
  methodSub: { fontSize: 12, marginTop: 3, textAlign: "right" },
  levelRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  levelChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  levelText: { fontSize: 15, fontWeight: "600" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 26,
  },
  primaryBtnText: { fontSize: 17, fontWeight: "700" },
  reviewBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { fontSize: 15, fontWeight: "600" },
  reviewCount: { fontSize: 14, fontWeight: "600" },
  segCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  segHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  playBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  segLabelWrap: { flex: 1, alignItems: "flex-end" },
  segLabel: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  segTime: { fontSize: 13, marginTop: 4 },
  adjustRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  adjust: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sliderWrap: { paddingHorizontal: HANDLE / 2, marginTop: 14, direction: "ltr" },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
    marginVertical: HANDLE / 2,
    justifyContent: "center",
  },
  sliderFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  sliderPlayhead: {
    position: "absolute",
    top: -5,
    bottom: -5,
    width: 2,
    borderRadius: 1,
  },
  sliderHandle: {
    position: "absolute",
    top: -(HANDLE / 2) + 3,
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sliderHandleDot: { width: 8, height: 8, borderRadius: 4 },
  adjustBtn: { padding: 4 },
  adjustCenter: { alignItems: "center", gap: 1 },
  adjustTitle: { fontSize: 12, fontWeight: "600" },
  adjustValue: { fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  downloadBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
