"use client";
import { useEffect, useRef, useState } from "react";
import {
  translateArticle,
  TranslatedSentence,
  TranslationJob,
} from "./translation-jobs";

export function useTranslation(articleId: string) {
  const [bilingual, setBilingual] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [sentences, setSentences] = useState<TranslatedSentence[]>([]);
  const [translationError, setTranslationError] = useState("");
  const [translationState, setTranslationState] = useState<
    TranslationJob["state"] | null
  >(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setBilingual(false);
    setTranslating(false);
    setSentences([]);
    setTranslationError("");
    setTranslationState(null);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [articleId]);

  async function toggleTranslation() {
    if (request.current) return;
    if (bilingual) {
      setBilingual(false);
      return;
    }
    if (sentences.length) {
      setBilingual(true);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setTranslating(true);
    setTranslationError("");
    setTranslationState("queued");
    try {
      const result = await translateArticle(
        articleId,
        controller.signal,
        (state) => {
          if (!controller.signal.aborted) setTranslationState(state);
        },
      );
      if (!controller.signal.aborted) {
        setSentences(result.sentences);
        setBilingual(true);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setTranslationError(
          error instanceof Error
            ? error.message
            : "Không thể tải bản dịch. Vui lòng thử lại.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setTranslating(false);
      }
    }
  }
  return {
    bilingual,
    translating,
    sentences,
    translationError,
    translationState,
    toggleTranslation,
  };
}
