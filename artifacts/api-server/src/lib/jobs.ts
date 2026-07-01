// In-memory job registry for long-running audio operations (analyze, clips).
//
// The heavy work (full-file ffmpeg decode for silence detection, cutting many
// clips) is CPU-bound and on the deployment VM can take longer than the gateway
// / client request timeout (~60s). A long surah recitation can be 30+ minutes
// of audio. So routes start a job, return its id immediately, and the client
// polls a status endpoint for the result. Each poll is a fast request, so it
// never trips a timeout no matter how long the processing takes.

export type JobStatus = "processing" | "done" | "error";

interface Job {
  userId: string;
  status: JobStatus;
  result?: unknown;
  error?: string;
  statusCode?: number;
  createdAt: number;
}

const jobs = new Map<string, Job>();
const JOB_TTL_MS = 30 * 60 * 1000;

function sweep(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

export function startJob(id: string, userId: string): void {
  sweep();
  jobs.set(id, { userId, status: "processing", createdAt: Date.now() });
}

export function finishJob(id: string, result: unknown): void {
  const job = jobs.get(id);
  if (job) {
    job.status = "done";
    job.result = result;
  }
}

export function failJob(id: string, error: string, statusCode = 500): void {
  const job = jobs.get(id);
  if (job) {
    job.status = "error";
    job.error = error;
    job.statusCode = statusCode;
  }
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}
