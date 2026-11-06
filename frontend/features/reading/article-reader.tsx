"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "./use-translation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Languages,
  Minus,
  Plus,
  LoaderCircle,
  BookOpen,
  ImageIcon,
} from "lucide-react";
import { Header, Footer } from "@/components/header";
import { api, Article, imageOf, dateLabel } from "@/lib/api";
import { useWordLookup } from "@/features/vocabulary/use-word-lookup";
import { DictionaryPanel } from "@/features/vocabulary/dictionary-panel";

export default function ArticleReader({ id }: { id: string }) {
  const {
    bilingual,
    translating,
    sentences,
    translationError,
    translationState,
    toggleTranslation,
  } = useTranslation(id);
  const vocabulary = useWordLookup(id);
  const { pick } = vocabulary;
  const [article, setArticle] = useState<Article | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [size, setSize] = useState(20);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setArticle(null);
    setError("");
    api<{ article: Article }>(`/articles/${id}`)
      .then((d) => {
        if (alive) setArticle(d.article);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);
  function renderText(text: string) {
    return text.split(/(\s+)/).map((part, index) =>
      /\s/.test(part) ? (
        part
      ) : (
        <span
          className="lookup-word"
          role="button"
          tabIndex={0}
          aria-label={`Tra từ ${part}`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.currentTarget.click();
            }
          }}
          data-word={part.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, "")}
          key={index}
        >
          {part}
        </span>
      ),
    );
  }
  return (
    <>
      <Header />
      <main className="reader-container">
        <Link className="back-link" href="/">
          <ArrowLeft size={16} /> Về phòng đọc
        </Link>
        {loading ? (
          <div className="reader-loading">
            <LoaderCircle className="spin" />
            <p>Đang mở bài đọc đã lưu…</p>
          </div>
        ) : error ? (
          <div className="error-box">
            <h2>Chưa mở được bài đọc</h2>
            <p>{error}</p>
            <Link href="/">Quay lại thư viện</Link>
          </div>
        ) : (
          article && (
            <>
              <div className="reader-heading">
                <div className="eyebrow">
                  BBC NEWS <span> / </span> {article.category.toUpperCase()}
                </div>
                <h1>{article.title}</h1>
                <p className="reader-deck">{article.description}</p>
                <div className="reader-byline">
                  <span className="bbc-logo">BBC</span>
                  <div>
                    <strong>{article.author || "BBC News"}</strong>
                    <span>{dateLabel(article.publishedAt)}</span>
                  </div>
                  <a href={article.url} target="_blank" rel="noreferrer">
                    Bài viết gốc <ArrowUpRight size={15} />
                  </a>
                </div>
              </div>
              <div className="reader-toolbar">
                <div className="reader-help">
                  <BookOpen size={17} />
                  <span>Chạm từ hoặc chọn cụm từ để tra nghĩa</span>
                </div>
                <div className="reader-tools">
                  <button
                    onClick={() => setSize((s) => Math.max(16, s - 1))}
                    title="Giảm cỡ chữ"
                  >
                    <Minus size={15} />
                  </button>
                  <span>Aa</span>
                  <button
                    onClick={() => setSize((s) => Math.min(28, s + 1))}
                    title="Tăng cỡ chữ"
                  >
                    <Plus size={15} />
                  </button>
                  <span className="toolbar-divider" />
                  <button
                    className={`bilingual-button ${bilingual ? "enabled" : ""}`}
                    onClick={toggleTranslation}
                    disabled={
                      translating || article.contentStatus === "summary_only"
                    }
                  >
                    {translating ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Languages size={17} />
                    )}{" "}
                    {translating
                      ? "Đang dịch bài báo…"
                      : bilingual
                        ? "Ẩn bản dịch"
                        : sentences.length
                          ? "Hiện bản dịch"
                          : translationError
                            ? "Thử dịch lại"
                            : "Dịch bài báo"}
                  </button>
                </div>
              </div>
              {translating && (
                <p role="status">
                  {translationState === "queued"
                    ? "Bài báo đang chờ dịch. Bạn có thể tiếp tục đọc trong khi chờ."
                    : "Đang dịch toàn bộ bài báo. Bạn có thể tiếp tục đọc trong khi chờ."}
                </p>
              )}
              {translationError && (
                <div className="notice" role="alert">
                  <span>{translationError}</span>
                  <button onClick={toggleTranslation} disabled={translating}>
                    Thử dịch lại
                  </button>
                </div>
              )}
              {imageOf(article) && (
                <figure className="reader-hero">
                  <img src={imageOf(article)} alt={article.title} />
                  {article.images?.[0]?.caption && (
                    <figcaption>{article.images[0].caption}</figcaption>
                  )}
                </figure>
              )}
              <div
                className="article-body"
                style={{ fontSize: size }}
                onClick={pick}
              >
                {article.contentStatus === "summary_only" && (
                  <div className="summary-warning">
                    Hiện chỉ lấy được phần tóm tắt từ BBC.{" "}
                    <a href={article.url} target="_blank" rel="noreferrer">
                      Đọc toàn văn tại nguồn <ArrowUpRight size={13} />
                    </a>
                  </div>
                )}
                {bilingual
                  ? sentences.map((s) => (
                      <div className="sentence-pair" key={s.id}>
                        <p>{renderText(s.original)}</p>
                        <p className="translation" lang="vi">
                          {s.translation}
                        </p>
                      </div>
                    ))
                  : (article.paragraphs?.length
                      ? article.paragraphs
                      : [article.description]
                    ).map((p, i) => <p key={i}>{renderText(p)}</p>)}
                <div className="article-end">
                  <span />
                  <BookOpen size={20} />
                  <span />
                </div>
              </div>
              {(article.images?.filter(
                (im) => im.url && im.url !== imageOf(article),
              ).length || 0) > 0 && (
                <section className="article-gallery">
                  <h2>
                    <ImageIcon size={20} /> Hình ảnh trong bài
                  </h2>
                  {article
                    .images!.filter(
                      (im) => Boolean(im.url) && im.url !== imageOf(article),
                    )
                    .map((im, i) => (
                      <figure key={`${im.url}-${i}`}>
                        <img
                          src={im.url}
                          alt={im.alt || im.caption || article.title}
                        />
                        {im.caption && <figcaption>{im.caption}</figcaption>}
                      </figure>
                    ))}
                </section>
              )}
              <div className="reader-finish">
                <span>ONE STORY. A LITTLE MORE ENGLISH.</span>
                <h2>Một bài đọc nữa, một góc nhìn mới.</h2>
                <Link href="/">
                  Khám phá bài tiếp theo <ArrowUpRight size={18} />
                </Link>
              </div>
            </>
          )
        )}
      </main>
      <DictionaryPanel vocabulary={vocabulary} />
      <Footer />
    </>
  );
}
