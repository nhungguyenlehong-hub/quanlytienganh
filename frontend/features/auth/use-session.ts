"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
type Session = {
  user: null | { name: string; picture?: string };
  configured: boolean;
};
export function useSession() {
  const [auth, setAuth] = useState<Session>({ user: null, configured: false });
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    api<Session>("/auth/me")
      .then((result) => {
        if (alive) setAuth(result);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  function login() {
    if (auth.configured) window.location.assign("/api/auth/google");
    else
      setNotice(
        "Để đăng nhập Google, hãy cấu hình GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET trong backend/.env.",
      );
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setAuth((current) => ({ ...current, user: null }));
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Chưa đăng xuất được. Vui lòng thử lại.",
      );
    }
  }
  return { auth, notice, setNotice, login, logout };
}
