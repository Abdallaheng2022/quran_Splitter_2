// Helpers for the analyze / clips endpoints. These transfer multipart audio and
// binary zips, so they are called with manual fetch rather than the generated
// OpenAPI hooks.

import { Platform } from "react-native";

function apiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) throw new Error("EXPO_PUBLIC_DOMAIN غير متوفر");
  return `https://${domain}`;
}

// The analyze/clips endpoints use manual fetch, so the Clerk bearer token must
// be attached here too (the generated OpenAPI client handles its own auth).
type TokenGetter = () => Promise<string | null> | string | null;
let _tokenGetter: TokenGetter | null = null;

export function setRecitationTokenGetter(getter: TokenGetter | null): void {
  _tokenGetter = getter;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!_tokenGetter) return {};
  const token = await _tokenGetter();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Thrown when the server returns 402: the free trial is exhausted and the user
// is not subscribed. Callers surface the paywall instead of a generic error.
export class PaywallError extends Error {
  constructor(message = "انتهت المحاولات المجانية") {
    super(message);
    this.name = "PaywallError";
  }
}

export type SplitLevel = "ayah" | "page" | "rub" | "hizb" | "juz";

export interface Segment {
  index: number;
  labelAr: string;
  startSec: number;
  endSec: number;
}

export interface AnalyzeResult {
  audioId: string;
  duration: number;
  targetCount: number;
  segments: Segment[];
}

export type SplitMethod = "silence" | "refdtw";

export interface AnalyzeParams {
  uri: string;
  fileName: string;
  mimeType: string;
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
  level: SplitLevel;
  method: SplitMethod;
  edition?: string;
  // Subscription entitlement as verified by RevenueCat on the client. The
  // server trusts this to decide whether to consume a free alignment trial.
  subscribed?: boolean;
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === "string") return data.error;
  } catch {
    // ignore
  }
  return `خطأ في الخادم (${res.status})`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// analyze and clips run as background jobs on the server (the ffmpeg work can
// exceed the request timeout for long recitations). The POST returns a jobId
// and we poll a status endpoint until the job is done. Each poll is a fast
// request, so a long-running job never trips a network/gateway timeout.
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

interface JobEnvelope {
  status: "processing" | "done" | "error";
  error?: string;
  statusCode?: number;
}

async function pollJob<T>(statusPath: string): Promise<T> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(`${apiBase()}${statusPath}`, {
      headers: await authHeaders(),
    });
    if (res.status === 404) {
      throw new Error("انتهت صلاحية المهمة، يرجى إعادة المحاولة");
    }
    if (!res.ok) throw new Error(await readError(res));
    const data = (await res.json()) as JobEnvelope & T;
    if (data.status === "processing") continue;
    if (data.status === "error") {
      if (data.statusCode === 402) throw new PaywallError(data.error);
      throw new Error(data.error ?? "فشلت العملية");
    }
    return data;
  }
  throw new Error("استغرقت العملية وقتاً طويلاً، يرجى المحاولة مرة أخرى");
}

export async function analyzeAudio(params: AnalyzeParams): Promise<AnalyzeResult> {
  const form = new FormData();
  if (Platform.OS === "web") {
    // On web, the RN {uri,name,type} file shape serializes to "[object Object]"
    // instead of a real file, so fetch the blob and append it directly.
    const blob = await (await fetch(params.uri)).blob();
    form.append("audio", blob, params.fileName);
  } else {
    // React Native FormData file shape.
    form.append("audio", {
      uri: params.uri,
      name: params.fileName,
      type: params.mimeType || "audio/mpeg",
    } as unknown as Blob);
  }
  form.append("surahStart", String(params.surahStart));
  form.append("ayahStart", String(params.ayahStart));
  form.append("surahEnd", String(params.surahEnd));
  form.append("ayahEnd", String(params.ayahEnd));
  form.append("level", params.level);
  form.append("method", params.method);
  if (params.method === "refdtw" && params.edition) {
    form.append("edition", params.edition);
  }

  const res = await fetch(`${apiBase()}/api/analyze`, {
    method: "POST",
    headers: {
      ...(await authHeaders()),
      "x-subscribed": params.subscribed ? "true" : "false",
    },
    body: form,
  });
  // The paywall (402) is returned synchronously from the POST.
  if (res.status === 402) throw new PaywallError(await readError(res));
  if (!res.ok) throw new Error(await readError(res));
  const { jobId } = (await res.json()) as { jobId: string };
  return pollJob<AnalyzeResult>(`/api/analyze/status/${jobId}`);
}

export interface ClipsResult {
  downloadId: string;
  count: number;
}

export async function createClips(
  audioId: string,
  segments: { label: string; startSec: number; endSec: number }[],
): Promise<ClipsResult> {
  const res = await fetch(`${apiBase()}/api/clips`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ audioId, segments }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const { jobId } = (await res.json()) as { jobId: string };
  return pollJob<ClipsResult>(`/api/clips/status/${jobId}`);
}

export function downloadUrl(downloadId: string): string {
  return `${apiBase()}/api/clips/download/${downloadId}`;
}

// URL of the bundled demo recitation (Surah An-Nahl) served by the API.
export function sampleAudioUrl(): string {
  return `${apiBase()}/api/sample-audio`;
}
