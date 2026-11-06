"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bookmark,
  ArrowUpRight,
  Trash2,
  Search,
  LoaderCircle,
} from "lucide-react";
import { Header, Footer } from "@/components/header";
import { api, Word } from "@/lib/api";
export default function WordBook() {
  const [words, setWords] = useState<Word[]>([]),
    [local, setLocal] = useState(false),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ words: Word[] }>("/words")
      .then((d) => setWords(d.words))
      .catch(() => {
        setLocal(true);
        try {
          setWords(
            JSON.parse(localStorage.getItem("lingopress-words") || "[]"),
          );
        } catch {
          setWords([]);
        }
      })
      .finally(() => setLoading(false));
  }, []);
  async function remove(id: string) {
    try {
      if (local) {
        localStorage.setItem(
          "lingopress-words",
          JSON.stringify(words.filter((w) => w.id !== id)),
        );
      } else await api(`/words/${id}`, { method: "DELETE" });
      setWords((w) => w.filter((x) => x.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const filtered = words.filter((w) =>
    `${w.word} ${w.meaning}`.toLowerCase().includes(query.toLowerCase()),
  );
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
          Mỗi từ là một câu chuyện bạn đã đọc. Quay lại ngữ cảnh để nhớ lâu hơn.
        </p>
        <div className="words-top">
          <span>
            {words.length} từ đã lưu{" "}
            {local && <small>· Lưu trên trình duyệt này</small>}
          </span>
          <div className="search">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm trong sổ từ…"
              aria-label="Tìm từ đã lưu"
            />
          </div>
        </div>
        {local && (
          <div className="notice">
            Bạn đang xem sổ từ trên thiết bị này. Đăng nhập Google để lưu từ vào
            tài khoản.
          </div>
        )}
        {error && <div className="error-box">{error}</div>}
        {loading ? (
          <div className="reader-loading">
            <LoaderCircle className="spin" />
          </div>
        ) : filtered.length ? (
          <div className="word-grid">
            {filtered.map((w) => (
              <article className="word-card" key={w.id}>
                <div>
                  <h2>{w.word}</h2>
                  <button
                    className="icon-button"
                    title={`Xóa ${w.word}`}
                    onClick={() => remove(w.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <p>{w.meaning || "Chưa có định nghĩa"}</p>
                {w.context && <blockquote>{w.context}</blockquote>}
                {w.articleId && (
                  <Link href={`/read/${w.articleId}`}>
                    Về bài đọc gốc <ArrowUpRight size={15} />
                  </Link>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <Bookmark size={42} />
            <h2>
              {query
                ? "Chưa tìm thấy từ này"
                : "Sổ từ đang đợi câu chuyện đầu tiên"}
            </h2>
            <p>Mở một bài đọc, chạm vào từ mới và lưu lại cùng ngữ cảnh.</p>
            <Link className="primary-button" href="/">
              Tìm bài đọc <ArrowUpRight size={17} />
            </Link>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
