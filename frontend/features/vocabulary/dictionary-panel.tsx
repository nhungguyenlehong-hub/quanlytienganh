"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  X,
  LoaderCircle,
  Volume2,
  Check,
  Bookmark,
  ArrowUpRight,
  Search,
  RefreshCw,
} from "lucide-react";
import { useWordLookup } from "./use-word-lookup";
import { partOfSpeechLabel, safeExternalUrl } from "./dictionary";
export function DictionaryPanel({
  vocabulary,
}: {
  vocabulary: ReturnType<typeof useWordLookup>;
}) {
  const {
    selected,
    setSelected,
    lookup,
    looking,
    lookupError,
    saved,
    saving,
    saveNotice,
    meaning,
    save,
    senses,
    senseId,
    selectSense,
    retry,
    searchWord,
  } = vocabulary;
  const [query, setQuery] = useState(""),
    [audioError, setAudioError] = useState("");
  const panel = useRef<HTMLElement>(null),
    audio = useRef<HTMLAudioElement | null>(null);
  const open = Boolean(selected);
  useEffect(() => {
    setQuery(selected?.word || "");
    setAudioError("");
    audio.current?.pause();
  }, [selected?.word]);
  useEffect(() => {
    if (!open) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelected(null);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not(:disabled),input:not(:disabled),[tabindex="0"]',
        ) || [],
      );
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (!first) {
        event.preventDefault();
        panel.current?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      audio.current?.pause();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, setSelected]);
  if (!selected) return null;
  async function playAudio() {
    const url = safeExternalUrl(lookup?.audio);
    if (!url) return;
    setAudioError("");
    audio.current?.pause();
    try {
      audio.current = new Audio(url);
      await audio.current.play();
    } catch {
      setAudioError("Chưa phát được âm thanh. Hãy thử lại.");
    }
  }
  const sources = lookup?.attributions?.length
    ? lookup.attributions
    : lookup?.source
      ? [
          {
            name: lookup.source,
            url: lookup.sourceUrl || "",
            license: lookup.license,
          },
        ]
      : [];
  return (
    <div className="dictionary-overlay" onClick={() => setSelected(null)}>
      <aside
        ref={panel}
        tabIndex={-1}
        className="dictionary-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dictionary-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dictionary-top">
          <span>ENGLISH IN CONTEXT</span>
          <button
            className="icon-button"
            aria-label="Đóng từ điển"
            onClick={() => setSelected(null)}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="dictionary-title" className="dictionary-title">
          Từ điển Anh–Việt
        </h2>
        <form
          className="dictionary-search"
          onSubmit={(event) => {
            event.preventDefault();
            searchWord(query);
          }}
        >
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Từ tiếng Anh cần tra"
            placeholder="Nhập từ tiếng Anh…"
            maxLength={100}
          />
          <button type="submit" disabled={!query.trim()} aria-label="Tra từ">
            <ArrowUpRight size={18} />
          </button>
        </form>
        <div className="dictionary-result" aria-busy={looking}>
          {looking ? (
            <div className="dictionary-loading" role="status">
              <LoaderCircle size={20} className="spin" /> Đang tra nghĩa tiếng
              Việt…
            </div>
          ) : lookupError ? (
            <div className="lookup-error" role="alert">
              <p>{lookupError}</p>
              <button className="dictionary-retry" onClick={retry}>
                <RefreshCw size={14} /> Thử tra lại
              </button>
              <p className="dictionary-hint">
                Bạn có thể sửa từ hoặc tra dạng nguyên mẫu ở ô phía trên.
              </p>
            </div>
          ) : (
            lookup && (
              <>
                <div className="dictionary-headword">
                  <h3 lang="en">
                    {lookup.headword || lookup.word || selected.word}
                  </h3>
                  <span>
                    {lookup.language === "en" ? "ANH–ANH" : "ANH–VIỆT"}
                  </span>
                </div>
                {(lookup.phonetic || safeExternalUrl(lookup.audio)) && (
                  <div className="phonetic">
                    <span>{lookup.phonetic}</span>
                    {safeExternalUrl(lookup.audio) && (
                      <button
                        className="icon-button"
                        aria-label="Nghe phát âm"
                        onClick={playAudio}
                      >
                        <Volume2 size={18} />
                      </button>
                    )}
                  </div>
                )}
                {audioError && (
                  <p className="dictionary-hint" role="status">
                    {audioError}
                  </p>
                )}
                {lookup.language === "en" && (
                  <p className="dictionary-fallback">
                    Chưa có nghĩa tiếng Việt cho từ này. Dưới đây là định nghĩa
                    tiếng Anh để bạn tham khảo.
                  </p>
                )}
                {senses.length ? (
                  <fieldset className="dictionary-senses">
                    <legend>Chọn nghĩa phù hợp với bài đọc</legend>
                    {senses.map((sense) => (
                      <label
                        className={`dictionary-sense ${senseId === sense.id ? "selected" : ""}`}
                        key={sense.id}
                      >
                        <input
                          type="radio"
                          name="dictionary-sense"
                          value={sense.id}
                          checked={senseId === sense.id}
                          onChange={() => selectSense(sense.id)}
                          disabled={saving}
                        />
                        <div>
                          {sense.partOfSpeech && (
                            <span className="dictionary-pos">
                              {partOfSpeechLabel(sense.partOfSpeech)}
                            </span>
                          )}
                          <p lang={lookup.language || "vi"}>
                            {sense.definition}
                          </p>
                          {sense.example && (
                            <blockquote>{sense.example}</blockquote>
                          )}
                        </div>
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <p className="dictionary-hint">
                    Chưa có định nghĩa. Thử tra dạng nguyên mẫu của từ.
                  </p>
                )}
              </>
            )
          )}
        </div>
        <div className="context">
          <span>CÂU GỐC TRONG BÀI ĐỌC</span>
          <p lang="en">“{selected.context}”</p>
        </div>
        <button
          className="save-word"
          onClick={save}
          disabled={
            looking || saving || saved || !meaning || Boolean(lookupError)
          }
        >
          {saving ? (
            <LoaderCircle size={18} className="spin" />
          ) : saved ? (
            <Check size={18} />
          ) : (
            <Bookmark size={18} />
          )}{" "}
          {saving
            ? "Đang lưu…"
            : saved
              ? "Đã lưu nghĩa này"
              : "Lưu từ và nghĩa đã chọn"}
        </button>
        {saveNotice && (
          <p className="save-notice" role="status">
            {saveNotice}
          </p>
        )}
        <Link className="dictionary-words" href="/words">
          Xem sổ từ của bạn <ArrowUpRight size={15} />
        </Link>
        {sources.length > 0 && (
          <div className="dictionary-sources">
            <span>NGUỒN TỪ ĐIỂN</span>
            {sources.map((source, index) => (
              <div key={index}>
                {safeExternalUrl(source.url) ? (
                  <a
                    href={safeExternalUrl(source.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.name} <ArrowUpRight size={11} />
                  </a>
                ) : (
                  <strong>{source.name}</strong>
                )}
                {source.license && <small>{source.license}</small>}
              </div>
            ))}
            {lookup?.license &&
              !sources.some((source) => source.license === lookup.license) && (
                <small>{lookup.license}</small>
              )}
            <p>
              Ví dụ mang tính tham khảo; hãy đối chiếu với ngữ cảnh bài đọc.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
