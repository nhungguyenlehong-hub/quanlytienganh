"use client";
import Link from "next/link";
import {
  X,
  LoaderCircle,
  Volume2,
  Check,
  Bookmark,
  ArrowUpRight,
} from "lucide-react";
import { useWordLookup } from "./use-word-lookup";
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
    saveNotice,
    meaning,
    save,
  } = vocabulary;
  if (!selected) return null;
  return (
    <>
      <div className="dictionary-overlay" onClick={() => setSelected(null)}>
        <aside
          className="dictionary-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Tra từ"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dictionary-top">
            <span>YOUR CONTEXT DICTIONARY</span>
            <button
              className="icon-button"
              aria-label="Đóng tra từ"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
          </div>
          <h2>{selected.word}</h2>
          {looking ? (
            <div className="dictionary-loading">
              <LoaderCircle size={20} className="spin" /> Đang tra nghĩa…
            </div>
          ) : lookupError ? (
            <p className="lookup-error">{lookupError}</p>
          ) : (
            <>
              <div className="phonetic">
                {lookup?.phonetic}
                {lookup?.audio && (
                  <button
                    className="icon-button"
                    title="Nghe phát âm"
                    onClick={() => new Audio(lookup.audio).play()}
                  >
                    <Volume2 size={18} />
                  </button>
                )}
              </div>
              {lookup?.meanings?.length ? (
                lookup.meanings.slice(0, 3).map((m, i) => (
                  <div className="definition" key={i}>
                    <span>{m.partOfSpeech}</span>
                    {m.definitions.slice(0, 2).map((d, j) => (
                      <div key={j}>
                        <p>{d.definition}</p>
                        {d.example && <em>{d.example}</em>}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p>
                  {meaning ||
                    "Chưa có định nghĩa cho cụm từ này. Bạn vẫn có thể lưu lại ngữ cảnh."}
                </p>
              )}
            </>
          )}
          <div className="context">
            <span>TRONG BÀI BẠN ĐANG ĐỌC</span>
            <p>“{selected.context}”</p>
          </div>
          <button
            className="save-word"
            onClick={save}
            disabled={looking || saved}
          >
            {saved ? <Check size={18} /> : <Bookmark size={18} />}{" "}
            {saved ? "Đã lưu từ" : "Lưu vào sổ từ"}
          </button>
          {saveNotice && (
            <p className="save-notice" role="status">
              {saveNotice}
            </p>
          )}
          <Link className="dictionary-words" href="/words">
            Xem sổ từ của bạn <ArrowUpRight size={15} />
          </Link>
        </aside>
      </div>
    </>
  );
}
