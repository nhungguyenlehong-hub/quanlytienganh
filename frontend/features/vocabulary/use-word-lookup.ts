"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { saveLocalWord } from "./saved-words";
import {
  DictionaryLookup,
  dictionarySenses,
  normalizedWord,
} from "./dictionary";
export function useWordLookup(articleId: string) {
  const [selected, setSelected] = useState<{
    word: string;
    context: string;
  } | null>(null);
  const [lookup, setLookup] = useState<DictionaryLookup | null>(null);
  const [looking, setLooking] = useState(false),
    [lookupError, setLookupError] = useState("");
  const [saved, setSaved] = useState(false),
    [saving, setSaving] = useState(false),
    [saveNotice, setSaveNotice] = useState("");
  const [senseId, setSenseId] = useState(""),
    [version, setVersion] = useState(0);
  const active = useRef(selected);
  active.current = selected;
  useEffect(() => {
    setSelected(null);
  }, [articleId]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setLookup(null);
    setLookupError("");
    setSaved(false);
    setSaving(false);
    setSaveNotice("");
    setSenseId("");
    setLooking(true);
    api<DictionaryLookup>(
      `/dictionary?word=${encodeURIComponent(selected.word)}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setLookup(result);
          setSenseId(dictionarySenses(result)[0]?.id || "");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLookupError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLooking(false);
      });
    return () => controller.abort();
  }, [selected, version]);
  const senses = dictionarySenses(lookup);
  const chosenSense = senses.find((sense) => sense.id === senseId);
  const meaning = chosenSense?.definition || "";
  function selectSense(value: string) {
    setSenseId(value);
    setSaved(false);
    setSaveNotice("");
  }
  function retry() {
    setLooking(true);
    setLookupError("");
    setVersion((v) => v + 1);
  }
  function searchWord(query: string) {
    const word = normalizedWord(query);
    if (word && selected) setSelected({ ...selected, word });
  }
  function pick(event: React.MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('.translation,p[lang="vi"]')) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (
      text &&
      selection?.anchorNode &&
      selection.focusNode &&
      event.currentTarget.contains(selection.anchorNode) &&
      event.currentTarget.contains(selection.focusNode) &&
      text.split(/\s+/).length <= 6
    ) {
      const word = normalizedWord(text);
      if (word)
        setSelected({
          word,
          context: target.closest("p")?.textContent || text,
        });
      return;
    }
    const token = target.closest<HTMLElement>("[data-word]");
    if (token?.dataset.word) {
      token.focus({ preventScroll: true });
      const word = normalizedWord(token.dataset.word);
      if (word)
        setSelected({
          word,
          context: token.closest("p")?.textContent || token.dataset.word,
        });
    }
  }
  async function save() {
    if (!selected || !lookup || looking || saving || !meaning) return;
    const snapshot = selected;
    setSaving(true);
    setSaveNotice("");
    try {
      await api("/words", {
        method: "POST",
        body: JSON.stringify({ ...snapshot, meaning, articleId }),
      });
      if (active.current === snapshot) {
        setSaved(true);
        setSaveNotice("Đã lưu nghĩa bạn chọn cùng câu gốc vào tài khoản.");
      }
    } catch (error) {
      if (active.current !== snapshot) return;
      if (error instanceof ApiError && error.status === 401) {
        try {
          saveLocalWord({ ...snapshot, meaning, articleId });
          setSaved(true);
          setSaveNotice(
            "Đã lưu nghĩa bạn chọn trên trình duyệt này. Đăng nhập Google để lưu vào tài khoản.",
          );
        } catch {
          setSaveNotice(
            "Trình duyệt chưa cho phép lưu dữ liệu. Hãy bật lưu trữ hoặc đăng nhập rồi thử lại.",
          );
        }
      } else
        setSaveNotice(
          error instanceof Error
            ? error.message
            : "Chưa lưu được từ. Vui lòng thử lại.",
        );
    } finally {
      if (active.current === snapshot) setSaving(false);
    }
  }
  return {
    selected,
    setSelected,
    lookup,
    looking,
    lookupError,
    saved,
    saving,
    saveNotice,
    pick,
    meaning,
    save,
    senses,
    senseId,
    selectSense,
    retry,
    searchWord,
  };
}
