import type { Word } from "@/lib/api";

export const WORDS_STORAGE_KEY = "lingopress-words";
export type WordFilter = "all" | "unknown" | "known";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const keyOf = (word: string) =>
  word.normalize("NFKC").trim().toLocaleLowerCase("en");

export function readLocalWords(storage: Storage = localStorage): Word[] {
  const data: unknown = JSON.parse(storage.getItem(WORDS_STORAGE_KEY) || "[]");
  if (!Array.isArray(data))
    throw new Error(
      "Dữ liệu sổ từ chưa đọc được. Không có từ nào bị thay đổi.",
    );
  return data
    .filter((value): value is Word =>
      Boolean(
        value && typeof value.id === "string" && typeof value.word === "string",
      ),
    )
    .map((word) => ({
      ...word,
      meaning: typeof word.meaning === "string" ? word.meaning : "",
      known: word.known === true,
    }));
}

function writeLocalWords(words: Word[], storage: Storage): Word[] {
  storage.setItem(WORDS_STORAGE_KEY, JSON.stringify(words));
  return words;
}

// Read fresh storage before each mutation so actions in another tab are preserved.
export function saveLocalWord(
  value: Omit<Word, "id">,
  storage: Storage = localStorage,
): Word[] {
  const words = readLocalWords(storage);
  const existing = words.find((word) => keyOf(word.word) === keyOf(value.word));
  const saved: Word = {
    ...value,
    id: existing?.id || crypto.randomUUID(),
    createdAt:
      existing?.createdAt || value.createdAt || new Date().toISOString(),
    known: existing?.known === true,
    ...(existing?.knownAt ? { knownAt: existing.knownAt } : {}),
  };
  return writeLocalWords(
    [saved, ...words.filter((word) => keyOf(word.word) !== keyOf(value.word))],
    storage,
  );
}

export function markLocalWord(
  id: string,
  known: boolean,
  storage: Storage = localStorage,
): Word[] {
  const words = readLocalWords(storage);
  if (!words.some((word) => word.id === id))
    throw new Error("Từ này không còn trong danh sách. Hãy tải lại sổ từ.");
  return writeLocalWords(
    words.map((word) =>
      word.id === id
        ? {
            ...word,
            known,
            knownAt: known ? new Date().toISOString() : undefined,
          }
        : word,
    ),
    storage,
  );
}

export function deleteLocalWord(
  id: string,
  storage: Storage = localStorage,
): Word[] {
  return writeLocalWords(
    readLocalWords(storage).filter((word) => word.id !== id),
    storage,
  );
}

export function filterWords(
  words: Word[],
  filter: WordFilter,
  query: string,
): Word[] {
  const search = query.trim().toLocaleLowerCase("vi");
  return words.filter(
    (word) =>
      (filter === "all" || (word.known === true) === (filter === "known")) &&
      `${word.word} ${word.meaning}`.toLocaleLowerCase("vi").includes(search),
  );
}
