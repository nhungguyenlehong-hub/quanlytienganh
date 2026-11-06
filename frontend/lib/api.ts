export type Category = { id: string; label: string; feedUrl: string };
export type Article = {
  id: string;
  title: string;
  description: string;
  url: string;
  image?: string;
  imageUrl?: string;
  publishedAt: string;
  category: string;
  source?: string;
  author?: string;
  paragraphs?: string[];
  images?: { url: string; alt?: string; caption?: string }[];
  sentences?: { id: string; text: string; paragraphIndex?: number }[];
  contentStatus?: string;
};
export type Word = {
  id: string;
  word: string;
  meaning: string;
  context?: string;
  articleId?: string;
  createdAt?: string;
  known?: boolean;
  knownAt?: string;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new ApiError(
      data.error?.message ||
        data.error ||
        data.message ||
        `Yêu cầu thất bại (${r.status})`,
      r.status,
      data.code,
    );
  return data;
}
export function imageOf(a: Article) {
  return a.image || a.imageUrl;
}
export function readTime(a: Article) {
  return Math.max(
    1,
    Math.ceil(
      (a.paragraphs?.join(" ") || a.description || "").split(/\s+/).length /
        180,
    ),
  );
}
export function dateLabel(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "BBC News"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
