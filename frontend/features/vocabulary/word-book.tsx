"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bookmark,
  ArrowUpRight,
  Trash2,
  Search,
  LoaderCircle,
  CheckCircle2,
  Circle,
  RotateCcw,
} from "lucide-react";
import { Header, Footer } from "@/components/header";
import { api, ApiError, Word } from "@/lib/api";
import {
  readLocalWords,
  markLocalWord,
  deleteLocalWord,
  filterWords,
  WORDS_STORAGE_KEY,
  type WordFilter,
} from "./saved-words";

export default function WordBook() {
  const [words, setWords] = useState<Word[]>([]);
  const [local, setLocal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WordFilter>("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setLocal(false);
    api<{ words: Word[] }>("/words", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setWords(
            data.words.map((word) => ({ ...word, known: word.known === true })),
          );
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          setLocal(true);
          try {
            setWords(readLocalWords());
          } catch {
            setWords([]);
            setError(
              "Chưa đọc được sổ từ trên trình duyệt. Dữ liệu của bạn chưa bị thay đổi.",
            );
          }
        } else {
          setWords([]);
          setError(
            error instanceof Error
              ? error.message
              : "Chưa tải được sổ từ. Hãy thử lại.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [version]);
  useEffect(() => {
    if (!local) return;
    function sync(event: StorageEvent) {
      if (event.key !== WORDS_STORAGE_KEY && event.key !== null) return;
      try {
        setWords(readLocalWords());
      } catch {
        setError("Chưa đọc được thay đổi từ tab khác. Hãy tải lại sổ từ.");
      }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [local]);

  async function changeKnown(word: Word) {
    if (busy.includes(word.id)) return;
    setBusy((previous) => [...previous, word.id]);
    setError("");
    try {
      const known = word.known !== true;
      if (local) setWords(markLocalWord(word.id, known));
      else {
        const data = await api<{ word: Word }>(
          `/words/${encodeURIComponent(word.id)}`,
          { method: "PATCH", body: JSON.stringify({ known }) },
        );
        setWords((previous) =>
          previous.map((entry) => (entry.id === word.id ? data.word : entry)),
        );
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Chưa đổi được trạng thái từ. Hãy thử lại.",
      );
    } finally {
      setBusy((previous) => previous.filter((id) => id !== word.id));
    }
  }
  async function remove(id: string) {
    if (busy.includes(id)) return;
    setBusy((previous) => [...previous, id]);
    setError("");
    try {
      if (local) setWords(deleteLocalWord(id));
      else {
        await api(`/words/${encodeURIComponent(id)}`, { method: "DELETE" });
        setWords((previous) => previous.filter((word) => word.id !== id));
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Chưa xóa được từ. Hãy thử lại.",
      );
    } finally {
      setBusy((previous) => previous.filter((value) => value !== id));
    }
  }
  const knownCount = words.filter((word) => word.known === true).length;
  const unknownCount = words.length - knownCount;
  const filtered = filterWords(words, filter, query);
  const tabs: { id: WordFilter; label: string; count: number }[] = [
    { id: "all", label: "Tất cả", count: words.length },
    { id: "unknown", label: "Chưa biết", count: unknownCount },
    { id: "known", label: "Đã biết", count: knownCount },
  ];
  return (
    <>
      <Header />
      <main className="container words-page">
        <div className="eyebrow">
          <Bookmark size={16} /> YOUR PERSONAL WORD COLLECTION
        </div>
        <h1>
          Những từ mới.
          <br />
          <em>Của riêng bạn.</em>
        </h1>
        <p className="words-description">
          Lưu từ từ bài đọc, học theo ngữ cảnh và đánh dấu những từ bạn đã biết.
        </p>
        <div className="wordbook-summary" aria-label="Thống kê sổ từ">
          <div>
            <Bookmark size={19} />
            <strong>{words.length}</strong>
            <span>Từ đã lưu</span>
          </div>
          <div>
            <Circle size={19} />
            <strong>{unknownCount}</strong>
            <span>Chưa biết</span>
          </div>
          <div>
            <CheckCircle2 size={19} />
            <strong>{knownCount}</strong>
            <span>Đã biết</span>
          </div>
        </div>
        <div className="words-top">
          <div className="wordbook-filters" aria-label="Lọc trạng thái từ">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                aria-pressed={filter === tab.id}
                className={filter === tab.id ? "active" : ""}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
                <span>{tab.count}</span>
              </button>
            ))}
          </div>
          <div className="search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm từ hoặc nghĩa…"
              aria-label="Tìm từ đã lưu"
            />
          </div>
        </div>
        {local && (
          <div className="notice">
            Sổ từ đang lưu trên trình duyệt này. Trạng thái đã biết và các từ
            bạn lưu sẽ được giữ lại khi mở lại trang. Đăng nhập Google để dùng
            sổ từ trong tài khoản.
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            <p>{error}</p>
            <button onClick={() => setVersion((value) => value + 1)}>
              Thử tải lại
            </button>
          </div>
        )}
        {loading ? (
          <div className="reader-loading" role="status">
            <LoaderCircle className="spin" />
            <span>Đang mở sổ từ…</span>
          </div>
        ) : filtered.length ? (
          <>
            <p className="wordbook-results" role="status">
              Hiển thị {filtered.length} từ
              {query.trim() ? ` khớp với “${query.trim()}”` : ""}.
            </p>
            <div className="word-grid">
              {filtered.map((word) => (
                <article
                  className={`word-card ${word.known ? "word-card-known" : ""}`}
                  key={word.id}
                >
                  <div className="word-card-heading">
                    <h2>{word.word}</h2>
                    <button
                      className="icon-button"
                      title={`Xóa ${word.word}`}
                      aria-label={`Xóa ${word.word}`}
                      disabled={busy.includes(word.id)}
                      onClick={() => remove(word.id)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <span
                    className={`word-status ${word.known ? "known" : "unknown"}`}
                  >
                    {word.known ? (
                      <CheckCircle2 size={13} />
                    ) : (
                      <Circle size={13} />
                    )}
                    {word.known ? "Đã biết" : "Chưa biết"}
                  </span>
                  <p>{word.meaning || "Chưa có định nghĩa"}</p>
                  {word.context && <blockquote>{word.context}</blockquote>}
                  <div className="word-card-actions">
                    <button
                      className="word-known-button"
                      aria-label={`${word.known ? "Đánh dấu chưa biết" : "Đánh dấu đã biết"}: ${word.word}`}
                      disabled={busy.includes(word.id)}
                      onClick={() => changeKnown(word)}
                    >
                      {busy.includes(word.id) ? (
                        <LoaderCircle size={15} className="spin" />
                      ) : word.known ? (
                        <RotateCcw size={15} />
                      ) : (
                        <CheckCircle2 size={15} />
                      )}
                      {word.known ? "Học lại từ này" : "Đánh dấu đã biết"}
                    </button>
                    {word.articleId && (
                      <Link href={`/read/${word.articleId}`}>
                        Bài đọc gốc <ArrowUpRight size={14} />
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="empty">
            <Bookmark size={42} />
            <h2>
              {words.length === 0
                ? "Sổ từ đang đợi từ đầu tiên"
                : query
                  ? "Chưa tìm thấy từ phù hợp"
                  : filter === "known"
                    ? "Chưa có từ được đánh dấu đã biết"
                    : "Bạn đã biết hết các từ trong sổ"}
            </h2>
            <p>
              {words.length === 0
                ? "Mở bài đọc, bấm một từ và lưu nghĩa bạn muốn học."
                : "Bạn có thể đổi bộ lọc hoặc tìm bằng từ khóa khác."}
            </p>
            {words.length === 0 ? (
              <Link className="primary-button" href="/">
                Tìm bài đọc <ArrowUpRight size={17} />
              </Link>
            ) : (
              <button
                className="primary-button"
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                Xem tất cả từ
              </button>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
