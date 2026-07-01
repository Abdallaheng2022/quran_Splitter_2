# مُقسّم التلاوة (Quran Recitation Splitter)

An Arabic-first mobile app that splits a Quran recitation audio file into labeled
clips. The user uploads recitation audio, picks ONE surah and a split level
(ayah/page/rub/hizb/juz), and a split method: السكتات (silence, free) or
المحاذاة بالمرجع (reference alignment, subscriber-only). The backend returns
labeled time segments; the user previews each segment, fine-tunes boundaries, then
downloads all clips as a zip.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (audio engine)
- `pnpm --filter @workspace/quran-splitter run dev` — run the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks/Zod from OpenAPI
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only;
  use `run push-force` for non-interactive data-loss pushes, e.g. dropped columns)
- `pnpm --filter @workspace/scripts run seed-revenuecat` — (re)seed the RevenueCat
  entitlement/offering/product (needs the RevenueCat connection)
- Restart workflows by full name: `artifacts/api-server: API Server`, `artifacts/quran-splitter: expo`
- Required env: `DATABASE_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (ESM), ffmpeg/ffprobe for audio, archiver for zips
- App: Expo SDK 54 (expo-router), expo-audio, expo-document-picker, expo-file-system, expo-sharing
- Payments: RevenueCat (react-native-purchases) for the $1/mo subscription
- DB: PostgreSQL + Drizzle ORM
- API codegen: Orval (from OpenAPI spec)

## Where things live

- Audio + Quran engine: `artifacts/api-server/src/lib/{audio,quran,paths}.ts`
- Reference reciter engine: `artifacts/api-server/src/lib/reference.ts` (RECITERS list,
  CDN per-ayah duration probing, disk cache in `artifacts/api-server/ref-cache/{edition}.json`)
- App reciter list: `artifacts/quran-splitter/constants/reciters.ts` (ids must match the API RECITERS)
- Bundled Quran dataset: `artifacts/api-server/src/data/quranMeta.ts` (114 surahs, 6236 ayahs)
- Binary/multipart routes (NOT in OpenAPI): `artifacts/api-server/src/routes/{analyze,clips}.ts`
- OpenAPI contract: `lib/api-spec/openapi.yaml` (title stays "Api")
- DB schema: `lib/db/src/schema/` (users table)
- App screens: `artifacts/quran-splitter/app/(tabs)/index.tsx`
- RevenueCat client + provider: `artifacts/quran-splitter/lib/revenuecat.tsx`
  (`SubscriptionProvider`/`useSubscription`, entitlement "pro", `isRevenueCatTestMode`);
  wired + `Purchases.logIn(clerkUserId)` in `app/_layout.tsx`
- Paywall (RC offering price, purchase/restore): `artifacts/quran-splitter/components/Paywall.tsx`
- RevenueCat seed script: `scripts/src/seedRevenueCat.ts` (+ `revenueCatClient.ts`)
- App-local API helpers (analyze/clips): `artifacts/quran-splitter/lib/recitation.ts`
- Bundled surah list for the app: `artifacts/quran-splitter/constants/surahs.ts`

## Architecture decisions

- Surah/ayah metadata is bundled both in the API (for labeling) and in the app (for the
  range pickers) so the picker works offline and needs no extra round-trip.
- `analyze` and `clips` are plain `fetch` calls, not OpenAPI hooks, because they transfer
  multipart audio and binary zips that Orval/React Query don't model well.
- Clips download is two-step (POST builds a zip on disk → GET streams it) so React
  Native's `FileSystem.downloadAsync` (GET-only) can fetch it.
- `analyze` and `clips` are ASYNC (job + poll), NOT a single long request. POST does
  auth/validation/paywall(402) synchronously, starts an in-memory job
  (`api-server/src/lib/jobs.ts`), runs the heavy ffmpeg work fire-and-forget, and
  returns `202 {jobId}`; the client (`recitation.ts` `pollJob`) polls
  `GET /api/{analyze,clips}/status/:jobId` every 1.5s until done/error. **Why:** the
  full-file silencedetect decode is CPU-bound (~78s for a 37-min recitation on the
  prod 2-vCPU VM, more for hours-long surahs), so a single held request crossed the
  ~60s gateway/client timeout and failed intermittently ("works once, fails another").
  analyze's jobId = the multer upload filename (= audioId). Client function signatures
  (`analyzeAudio`/`createClips`) are unchanged so the UI needs no edits. Trial is
  consumed only on job SUCCESS. Jobs are in-memory (single Reserved-VM instance) with a
  30min TTL; a restart loses in-flight jobs → status 404 → client says retry.
- Silence detection picks the longest pauses and bisects when too few are found, so the
  number of returned segments always matches the requested Quran range count.
- The app sends ONE surah but the backend keeps the 4-field range contract
  (surahStart/ayahStart/surahEnd/ayahEnd); the app fills the whole surah
  (start=end=surah, ayah 1..surah.ayahs). `analyze` also takes `method`
  ('silence'|'refdtw') and `edition` (reciter id, refdtw only).
- Reference alignment (refdtw) derives a reference reciter's per-ayah
  durations from the alquran.cloud CDN (`.../128/{edition}/{globalAyahNum}.mp3`) with a
  lightweight HTTP HEAD, deriving duration ≈ Content-Length / 16000 (128 kbps CBR).
  It scales those proportions onto the user's timeline, then snaps each ayah boundary to
  the user's nearest real pause. Global CDN ayah number = `findGlobalIndex(surah,ayah)+1`.
  (Do NOT ffprobe the remote mp3s — the CDN throttles concurrent media downloads.)
- `getReferenceDurations` (reference.ts) NEVER hard-fails — only relative proportions
  matter (boundaries are snapped to real pauses anyway), so it degrades gracefully via a
  3-step chain: (1) requested reciter's bundled `ref-cache/{edition}.json` topped up by
  live CDN probing where reachable; (2) the DEFAULT_EDITION (ar.alafasy) bundled cache;
  (3) uniform proportions. `probeUrlDuration` returns NaN (never throws); probing runs at
  low concurrency (8) with a 10s per-probe timeout AND a 12s overall budget, and
  `fillMissingFromCdn` does a 4-ayah reachability sample first and skips the rest when the
  CDN is unreachable (fail-fast). **Why:** prod egress to cdn.islamic.network is
  blocked/throttled, so live probing times out there; the old code threw a network error
  that surfaced to users ("تعذر جلب القراءة وخطأ في الشبكة").
- `ref-cache/` is committed (NOT gitignored) so warmed caches ship to prod — prod cannot
  reach the CDN, so a bundled `ar.alafasy.json` is what makes refdtw work there. It covers
  ~common surahs (Al-Fatihah, An-Nahl, Al-Kahf, Ya-Sin, Ar-Rahman, Al-Waqi'ah, Al-Mulk,
  Juz Amma 78-114). Regenerate/extend with `node scripts/warm-ref-cache.mjs` (run from
  `artifacts/api-server`, resumable, low concurrency — a full warm of all reciters is
  infeasible in one pass). After warming, the cache must be committed and the app
  REPUBLISHED for prod to pick it up.
- Monetization model: the silence method is ALWAYS free (no trial, no paywall). The
  reference-alignment (refdtw) method gets 3 free uses (consumes a trial only when
  not subscribed), then requires a subscription. Only refdtw consumes/gates on trials.
- Subscriptions run on RevenueCat (entitlement "pro", offering "default", package
  "$rc_monthly", $1/mo). The app reads `useSubscription().isSubscribed` from RevenueCat
  to gate the UI and forwards it to the API via the `x-subscribed: "true"|"false"` header
  on `analyze`. Trial counting is always server-side (so it can't be reset by clearing
  local state). Subscription gating is server-authoritative WHEN configured: if
  `REVENUECAT_SECRET_API_KEY` is set, the server verifies the "pro" entitlement directly
  against the RevenueCat REST API (`api-server/src/lib/revenuecat.ts`, keyed by the Clerk
  user id = RevenueCat app_user_id) and that result wins; otherwise it falls back to
  trusting the `x-subscribed` header. Verification is fail-soft (RC unreachable/timeout →
  treat as "unknown" → fall back to the header) and cached 60s per user.
  REMAINING RISK: with no secret configured (or during an RC outage), a tampered client
  can still send `x-subscribed: true` to bypass the paywall. Set `REVENUECAT_SECRET_API_KEY`
  (RevenueCat → API keys → secret v1 key) in the api-server env to close that gap in prod.

## Product

- Upload recitation audio → choose surah + split method + split level →
  preview/adjust segments → download labeled clips as a zip.
- Two split methods: السكتات (silence, always free) and المحاذاة بالمرجع (reference
  alignment against a famous reciter, 3 free uses then subscribe).
- Monetization: the app is free overall (silence method unlimited). The
  reference-alignment method gives 3 free uses, then $1/month via RevenueCat.

## Internationalization (i18n)

- The app supports 9 languages: ar, en, tr, hi, ps, es, de, fr, ckb. RTL langs: ar, ps,
  ckb; LTR: en, tr, hi, es, de, fr.
- i18n lives in `artifacts/quran-splitter/lib/i18n/`: `translations.ts` (9 dicts; the `ar`
  dict defines the `TranslationKey` type so every other dict must implement the same keys)
  and `index.tsx` (`LanguageProvider` + `useI18n` → `{ lang, setLang, isRTL, t, languages }`).
- Auto-detects device locale via `expo-localization`, persists choice in AsyncStorage,
  falls back to `ar`. `t(key, params?)` interpolates `{count}/{n}/{path}`.
- NO `I18nManager`: RTL is per-component via dynamic `textAlign`/`flexDirection` from `isRTL`.
- Name display rule: `isRTL ? s.name : s.englishName` for surahs and
  `isRTL ? r.name : r.latinName` for reciters (latinName in `constants/reciters.ts`).
- Adding a user-facing string: add the key to ALL 9 dicts in `translations.ts`, then use
  `t("key")` — never hardcode literals (including filenames shown in the UI).

## User preferences

- App language and UI are Arabic (RTL).

## Gotchas

- The audio engine shells out to `ffprobe`/`ffmpeg` via PATH. They MUST be declared in
  `replit.nix` (`pkgs.ffmpeg`) or production fails with `spawn ffprobe ENOENT` → 500
  ("فشل تحليل الملف الصوتي" / "network request failed") on EVERY analyze (both methods).
  Dev has them via the runtime Nix path, but the deployed image only includes what
  `replit.nix` declares. Manage via the package-management skill, then republish.
- Clip cutting (`cutClip` in `audio.ts`) MUST put `-ss` BEFORE `-i` (fast input seek).
  With `-ss` after `-i`, ffmpeg decodes the whole file from 0 for every clip
  (O(clips × duration)), so SHORT surahs work but LONG ones (Al-Qasas/Al-Baqarah)
  take many minutes and time out → app shows "doesn't work / network request failed".
  Clips are also generated at concurrency 4 (order preserved by index).
- archiver@8 is ESM-only: import `{ ZipArchive }` and use `new ZipArchive(...)` — there is no callable default export.
- `expo-file-system` v19: `downloadAsync` / `cacheDirectory` live in `expo-file-system/legacy`.
- Restart tools need the FULL workflow name (`"<dir>: <title>"`), not the dir alone.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
