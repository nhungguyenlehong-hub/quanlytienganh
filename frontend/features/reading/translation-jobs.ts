import { api, ApiError } from "@/lib/api";

export type TranslatedSentence = {
  id: string;
  original: string;
  translation: string;
  paragraphIndex?: number;
};
export type TranslationResult = {
  sentences: TranslatedSentence[];
  model?: string;
  cached?: boolean;
};
export type TranslationJob = {
  id: string;
  articleId: string;
  state: "queued" | "running" | "completed" | "failed";
  result?: TranslationResult;
  error?: string;
};
const jobKey = (articleId: string) =>
  `lingopress:translation-job:vi:${articleId}`;

function storedJob(articleId: string) {
  try {
    return sessionStorage.getItem(jobKey(articleId));
  } catch {
    return null;
  }
}
function rememberJob(articleId: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(jobKey(articleId), id);
    else sessionStorage.removeItem(jobKey(articleId));
  } catch {
    /* Storage can be disabled; the server still owns the job. */
  }
}

export function pausePolling(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Starts or resumes one server-owned job. All model retries happen on the backend. */
export async function translateArticle(
  articleId: string,
  signal: AbortSignal,
  onState?: (state: TranslationJob["state"]) => void,
): Promise<TranslationResult> {
  let job: TranslationJob | undefined;
  const previous = storedJob(articleId);
  if (previous) {
    try {
      ({ job } = await api<{ job: TranslationJob }>(
        `/ai/translation-jobs/${encodeURIComponent(previous)}`,
        { signal },
      ));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404)
        rememberJob(articleId, null);
      else throw error;
    }
  }
  if (!job) {
    ({ job } = await api<{ job: TranslationJob }>("/ai/translation-jobs", {
      method: "POST",
      body: JSON.stringify({ articleId, targetLanguage: "vi" }),
      signal,
    }));
    rememberJob(articleId, job.id);
  }
  while (job.state === "queued" || job.state === "running") {
    onState?.(job.state);
    await pausePolling(2000, signal);
    ({ job } = await api<{ job: TranslationJob }>(
      `/ai/translation-jobs/${encodeURIComponent(job.id)}`,
      { signal },
    ));
  }
  onState?.(job.state);
  if (job.state === "failed") {
    rememberJob(articleId, null);
    throw new Error(job.error || "Chưa dịch được bài báo. Bạn có thể thử lại.");
  }
  if (!job.result?.sentences?.length) {
    rememberJob(articleId, null);
    throw new Error(
      "Tác vụ hoàn tất nhưng chưa có bản dịch. Vui lòng thử lại.",
    );
  }
  return job.result;
}
