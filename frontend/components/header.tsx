"use client";
import Link from "next/link";
import { BookOpen, Bookmark, ArrowUpRight, LogOut } from "lucide-react";
import { useSession } from "@/features/auth/use-session";
export function Header() {
  const { auth, notice, setNotice, login, logout } = useSession();
  return (
    <>
      <div className="utility">
        <span>YOUR DAILY DOSE OF ENGLISH</span>
        <span>
          Powered by BBC journalism <span className="dot" /> Built for curious
          minds
        </span>
      </div>
      <header className="header">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <BookOpen size={22} />
          </span>
          Lingo<span>Press</span>
          <i>ENGLISH, IN CONTEXT.</i>
        </Link>
        <nav className="header-links">
          <Link href="/" className="current">
            Khám phá
          </Link>
          <Link href="/words">
            <Bookmark size={16} /> Từ đã lưu
          </Link>
        </nav>
        {auth.user ? (
          <div className="user">
            <span>{auth.user.name}</span>
            <button className="icon-button" title="Đăng xuất" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        ) : (
          <button className="login" onClick={login}>
            <span className="google-g">G</span> Đăng nhập{" "}
            <ArrowUpRight size={15} />
          </button>
        )}
      </header>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>Đóng</button>
        </div>
      )}
    </>
  );
}
export function Footer() {
  return (
    <footer>
      <Link className="footer-brand" href="/">
        LingoPress
      </Link>
      <p>Read the world. Learn the language.</p>
      <span>Nội dung từ BBC · Luôn dẫn nguồn bài viết gốc</span>
    </footer>
  );
}
