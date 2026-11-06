"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  RefreshCw,
  Globe2,
  BookOpen,
  Languages,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
} from "lucide-react";
import { Header, Footer } from "@/components/header";
import {
  api,
  ApiError,
  Article,
  Category,
  imageOf,
  dateLabel,
} from "@/lib/api";
const categoryNames: Record<string, string> = {
  world: "Thế giới",
  business: "Kinh doanh",
  technology: "Công nghệ",
  science: "Khoa học",
  science_and_environment: "Khoa học",
  health: "Sức khỏe",
  entertainment: "Văn hóa",
  entertainment_and_arts: "Văn hóa",
  education: "Giáo dục",
  sport: "Thể thao",
  uk: "Anh quốc",
  all: "Tất cả",
};
function Photo({
  article,
  className = "",
}: {
  article: Article;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return imageOf(article) && !failed ? (
    <img
      className={className}
      src={imageOf(article)}
      alt={article.title}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`photo-fallback ${className}`}>
      <Globe2 size={48} />
      <span>BBC NEWS</span>
    </div>
  );
}
type NewsJob = {
  state: "idle" | "queued" | "running" | "completed" | "failed";
  progress: {
    discovered: number;
    processed: number;
    saved: number;
    failed: number;
    deleted: number;
  };
  error?: string;
  feedErrors?: string[];
};
function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === "DATABASE_UNAVAILABLE")
    return (
      "Chưa kết nối được cơ sở dữ liệu. Kiểm tra thông tin kết nối trong backend/.env, bật dịch vụ database, rồi thử lại. " +
      error.message
    );
  return error instanceof Error
    ? error.message
    : "Không thể cập nhật thư viện. Vui lòng thử lại.";
}
export default function NewsRoom() {
  const [categories, setCategories] = useState<Category[]>([]),
    [category, setCategory] = useState("world"),
    [articles, setArticles] = useState<Article[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState(""),
    [refreshMessage, setRefreshMessage] = useState(""),
    [revision, setRevision] = useState(0);
  const refreshController = useRef<AbortController | null>(null);
  useEffect(() => () => refreshController.current?.abort(), []);
  useEffect(() => {
    api<{ categories: Category[] }>("/categories")
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api<{ articles: Article[]; total: number }>(
      `/articles?category=${encodeURIComponent(category)}&q=${encodeURIComponent(search)}&page=${page}`,
    )
      .then((d) => {
        if (alive) {
          setArticles(d.articles);
          setTotal(d.total);
        }
      })
      .catch((e) => {
        if (alive) {
          setArticles([]);
          setTotal(0);
          setError(errorMessage(e));
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [category, page, search, revision]);
  async function refresh() {
    const controller = new AbortController();
    refreshController.current?.abort();
    refreshController.current = controller;
    setRefreshing(true);
    setError("");
    setRefreshMessage("Đang xếp lịch cập nhật bài đọc…");
    try {
      let { job } = await api<{ job: NewsJob }>("/feeds/refresh", {
        method: "POST",
        signal: controller.signal,
      });
      const deadline = Date.now() + 10 * 60 * 1000;
      while (job.state === "queued" || job.state === "running") {
        setRefreshMessage(
          job.state === "queued"
            ? "Đang chờ cập nhật thư viện…"
            : `Đang cập nhật thư viện: đã xử lý ${job.progress.processed}/${job.progress.discovered} bài, lưu ${job.progress.saved} bài.`,
        );
        if (Date.now() > deadline)
          throw new Error(
            "Tác vụ vẫn đang chạy trên máy chủ. Bạn có thể quay lại thư viện sau và kiểm tra bài đã lưu.",
          );
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          };
          const timer = setTimeout(() => {
            controller.signal.removeEventListener("abort", abort);
            resolve();
          }, 1500);
          controller.signal.addEventListener("abort", abort, { once: true });
        });
        ({ job } = await api<{ job: NewsJob }>("/jobs/news", {
          signal: controller.signal,
        }));
      }
      if (job.state !== "completed")
        throw new Error(
          job.error ||
            "Tác vụ cập nhật chưa hoàn tất. Vui lòng kiểm tra kết nối database và thử lại.",
        );
      setRefreshMessage(
        `Đã cập nhật: lưu ${job.progress.saved} bài${job.progress.failed ? `, ${job.progress.failed} bài chưa lấy được` : ""}.${job.feedErrors?.length ? " Một số danh mục chưa cập nhật được." : ""}`,
      );
      setPage(1);
      setRevision((v) => v + 1);
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(errorMessage(e));
        setRefreshMessage("");
        if (e instanceof ApiError && e.code === "DATABASE_UNAVAILABLE") {
          setArticles([]);
          setTotal(0);
        }
      }
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }
  const featured = articles[0];
  const side = articles.slice(1, 3);
  const rest = articles.slice(3);
  return (
    <>
      <Header />
      <main className="container">
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="dot" /> THE READING ROOM
            </div>
            <h1>
              Mở thế giới.
              <br />
              <em>Mở vốn từ.</em>
            </h1>
            <p>Đọc điều bạn quan tâm. Hiểu từng câu. Giữ lại mỗi từ mới.</p>
          </div>
          <div className="intro-note">
            <span className="note-icon">
              <Compass size={25} />
            </span>
            <p>
              Good stories.
              <br />
              <strong>Better English.</strong>
            </p>
            <span>
              Tin tức thật. Tiếng Anh thật.
              <br />
              Một thói quen nhỏ mỗi ngày.
            </span>
          </div>
          <div className="edition">
            <span>THE DAILY EDITION</span>
            <strong>
              {new Date().toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </strong>
            <span className="live-label">
              <span className="dot" /> BBC · DAILY SYNC
            </span>
          </div>
        </section>
        <section className="learning-strip">
          <span>
            <Languages size={18} />
            <strong>Đọc song ngữ</strong>
            <small>Hiểu sâu từng câu</small>
          </span>
          <span>
            <Search size={18} />
            <strong>Tra từ tức thì</strong>
            <small>Không rời bài đọc</small>
          </span>
          <Link href="/words">
            <Bookmark size={18} />
            <strong>Lưu từ trong ngữ cảnh</strong>
            <small>Nhớ từ theo cách tự nhiên</small>
            <ArrowUpRight size={17} />
          </Link>
        </section>
        <div className="section-top">
          <div>
            <span className="section-kicker">CURATED FOR YOUR CURIOSITY</span>
            <h2>Thế giới đang kể gì?</h2>
          </div>
          <button
            className="refresh-button"
            disabled={refreshing}
            onClick={refresh}
          >
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            {refreshing ? "Đang cập nhật…" : "Cập nhật tin"}
          </button>
        </div>
        <div className="filter-row">
          <nav className="category-nav" aria-label="Danh mục">
            {categories.map((c) => (
              <button
                className={category === c.id ? "active" : ""}
                key={c.id}
                onClick={() => {
                  setCategory(c.id);
                  setPage(1);
                }}
              >
                {categoryNames[c.id] || c.label}
              </button>
            ))}
          </nav>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query);
              setPage(1);
            }}
          >
            <Search size={17} />
            <input
              aria-label="Tìm bài đọc"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm bài đọc…"
            />
            <button aria-label="Tìm kiếm">
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
        {refreshMessage && (
          <div className="notice" role="status" aria-live="polite">
            {refreshMessage}
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            <strong>Chưa kết nối được thư viện</strong>
            <p>{error}</p>
            <button onClick={refresh}>Thử cập nhật lại</button>
          </div>
        )}
        {loading ? (
          <div className="loading-grid">
            <div className="skeleton large" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        ) : error ? null : !articles.length ? (
          <div className="empty">
            <BookOpen size={40} />
            <h3>
              {search
                ? "Chưa tìm thấy bài phù hợp"
                : "Thư viện đang chờ tin mới"}
            </h3>
            <p>
              {search
                ? "Thử một từ khóa khác hoặc chọn danh mục khác."
                : "Chưa có bài đã lưu trong danh mục này. Nhấn Cập nhật tin và chờ tác vụ hoàn tất."}
            </p>
          </div>
        ) : (
          <>
            {featured && (
              <section className="lead-grid">
                <Link className="lead-story" href={`/read/${featured.id}`}>
                  <div className="lead-image">
                    <Photo article={featured} />
                    <span className="image-tag">
                      <span className="dot" /> THE BIG READ
                    </span>
                    <span className="round-arrow">
                      <ArrowUpRight size={22} />
                    </span>
                  </div>
                  <div className="story-meta">
                    <span>
                      {categoryNames[featured.category] || featured.category}
                    </span>
                    <b>BBC</b>
                    <span>{dateLabel(featured.publishedAt)}</span>
                  </div>
                  <h2>{featured.title}</h2>
                  <p>{featured.description}</p>
                  <div className="read-link">
                    Khám phá bài đọc <ArrowRight size={16} />
                  </div>
                </Link>
                <div className="secondary-stories">
                  {side.map((a) => (
                    <Link
                      className="secondary-story"
                      key={a.id}
                      href={`/read/${a.id}`}
                    >
                      <Photo article={a} />
                      <div className="story-meta">
                        <span>{categoryNames[a.category] || a.category}</span>
                        <span>{dateLabel(a.publishedAt)}</span>
                      </div>
                      <h3>{a.title}</h3>
                      <span className="mini-source">
                        BBC NEWS <ArrowUpRight size={15} />
                      </span>
                    </Link>
                  ))}
                </div>
                <aside className="reading-aside">
                  <div className="aside-top">
                    <BookOpen size={24} />
                    <span>MAKE IT A DAILY RITUAL</span>
                  </div>
                  <h3>
                    Mỗi bài báo,
                    <br />
                    một bước tiến.
                  </h3>
                  <p>
                    Không cần hiểu mọi từ ngay từ đầu. Cứ đọc, khám phá và lưu
                    lại những điều mới.
                  </p>
                  <div className="step">
                    <span>01</span>
                    <div>
                      <strong>Chọn điều bạn thích</strong>
                      <p>Công nghệ, đời sống hay thế giới.</p>
                    </div>
                  </div>
                  <div className="step">
                    <span>02</span>
                    <div>
                      <strong>Đọc theo nhịp của bạn</strong>
                      <p>Chạm từ để tra, bật song ngữ khi cần.</p>
                    </div>
                  </div>
                  <div className="step">
                    <span>03</span>
                    <div>
                      <strong>Mang từ mới theo mình</strong>
                      <p>Lưu từ cùng câu văn đã gặp.</p>
                    </div>
                  </div>
                  <Link href="/words">
                    Mở sổ từ của bạn <ArrowUpRight size={17} />
                  </Link>
                  <div className="aside-bottom">
                    <span className="dot" /> SMALL HABITS. BIG POSSIBILITIES.
                  </div>
                </aside>
              </section>
            )}
            {rest.length > 0 && (
              <section className="latest">
                <div className="latest-heading">
                  <h2>Tiếp tục khám phá</h2>
                  <span>
                    {total} bài trong danh mục <ArrowDownIcon />
                  </span>
                </div>
                <div className="article-grid">
                  {rest.map((a) => (
                    <Link
                      className="article-card"
                      href={`/read/${a.id}`}
                      key={a.id}
                    >
                      <div className="card-image">
                        <Photo article={a} />
                        <span>
                          <ArrowUpRight size={18} />
                        </span>
                      </div>
                      <div className="story-meta">
                        <span>{categoryNames[a.category] || a.category}</span>
                        <span>{dateLabel(a.publishedAt)}</span>
                      </div>
                      <h3>{a.title}</h3>
                      <p>{a.description}</p>
                      <span className="mini-source">
                        BBC NEWS <BookOpen size={14} />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <div className="pagination">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={17} /> Trước
              </button>
              <span>Trang {page}</span>
              <button
                disabled={articles.length === 0 || page * 24 >= total}
                onClick={() => {
                  setPage((p) => p + 1);
                  window.scrollTo({ top: 300, behavior: "smooth" });
                }}
              >
                Tiếp <ChevronRight size={17} />
              </button>
            </div>
          </>
        )}
        <section className="bottom-banner">
          <Globe2 size={35} />
          <div>
            <span>A WORLD OF STORIES. A LANGUAGE OF POSSIBILITIES.</span>
            <h3>Đọc để hiểu thế giới. Học để kết nối.</h3>
          </div>
          <span className="banner-mark">
            L<span>P</span>
          </span>
        </section>
      </main>
      <Footer />
    </>
  );
}
function ArrowDownIcon() {
  return <span aria-hidden="true">↓</span>;
}
