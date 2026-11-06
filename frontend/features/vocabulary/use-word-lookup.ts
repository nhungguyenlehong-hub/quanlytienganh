"use client";
import { useEffect, useState } from "react";
import { api, Word } from "@/lib/api";
type Lookup = {
  word: string;
  phonetic?: string;
  meanings?: {
    partOfSpeech: string;
    definitions: { definition: string; example?: string }[];
  }[];
  meaning?: string;
  definitions?: string[];
  audio?: string;
};
export function useWordLookup(id: string) {
  const [selected, setSelected] = useState<{
      word: string;
      context: string;
    } | null>(null),
    [lookup, setLookup] = useState<Lookup | null>(null),
    [looking, setLooking] = useState(false),
    [lookupError, setLookupError] = useState(""),
    [saved, setSaved] = useState(false),
    [saveNotice, setSaveNotice] = useState("");
  useEffect(() => {
    setSelected(null);
  }, [id]);
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setLookup(null);
    setLookupError("");
    setSaved(false);
    setSaveNotice("");
    setLooking(true);
    api<Lookup>(`/dictionary?word=${encodeURIComponent(selected.word)}`)
      .then((d) => alive && setLookup(d))
      .catch((e) => alive && setLookupError(e.message))
      .finally(() => alive && setLooking(false));
    return () => {
      alive = false;
    };
  }, [selected]);
  function pick(e: React.MouseEvent<HTMLElement>) {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.split(/\s+/).length <= 6) {
      const p = (e.target as HTMLElement).closest("p");
      setSelected({ word: selection, context: p?.textContent || selection });
      return;
    }
    const target = e.target as HTMLElement;
    if (target.dataset.word) {
      setSelected({
        word: target.dataset.word,
        context: target.closest("p")?.textContent || target.dataset.word,
      });
    }
  }
  const meaning =
    lookup?.meaning ||
    lookup?.meanings?.[0]?.definitions?.[0]?.definition ||
    lookup?.definitions?.[0] ||
    "";
  async function save() {
    if (!selected) return;
    try {
      await api("/words", {
        method: "POST",
        body: JSON.stringify({ ...selected, meaning, articleId: id }),
      });
      setSaved(true);
      setSaveNotice("Đã lưu vào tài khoản của bạn.");
    } catch (e) {
      const words: Word[] = JSON.parse(
        localStorage.getItem("lingopress-words") || "[]",
      );
      if (
        !words.some((w) => w.word.toLowerCase() === selected.word.toLowerCase())
      ) {
        words.unshift({
          id: crypto.randomUUID(),
          ...selected,
          meaning,
          articleId: id,
          createdAt: new Date().toISOString(),
        });
        localStorage.setItem("lingopress-words", JSON.stringify(words));
      }
      setSaved(true);
      setSaveNotice(
        "Đã lưu trên trình duyệt này. Đăng nhập Google để lưu vào tài khoản.",
      );
    }
  }
  return {
    selected,
    setSelected,
    lookup,
    looking,
    lookupError,
    saved,
    saveNotice,
    pick,
    meaning,
    save,
  };
}
