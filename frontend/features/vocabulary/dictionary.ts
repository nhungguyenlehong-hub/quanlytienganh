export type DictionaryLookup = {
  word: string;
  headword?: string;
  phonetic?: string;
  audio?: string;
  language?: "vi" | "en";
  source?: string;
  sourceUrl?: string;
  license?: string;
  attributions?: { name: string; url: string; license?: string }[];
  meanings?: {
    partOfSpeech: string;
    definitions: { definition: string; example?: string; source?: string }[];
  }[];
  meaning?: string;
  definitions?: string[];
};
export type DictionarySense = {
  id: string;
  definition: string;
  partOfSpeech: string;
  example?: string;
  source?: string;
};
export function dictionarySenses(
  lookup: DictionaryLookup | null,
): DictionarySense[] {
  if (!lookup) return [];
  const senses: DictionarySense[] = [];
  for (const [groupIndex, group] of (lookup.meanings || []).entries()) {
    for (const [index, definition] of group.definitions.entries()) {
      if (definition.definition?.trim())
        senses.push({
          id: `${groupIndex}:${index}`,
          partOfSpeech: group.partOfSpeech,
          ...definition,
        });
    }
  }
  if (!senses.length) {
    for (const [index, definition] of (lookup.definitions?.length
      ? lookup.definitions
      : lookup.meaning
        ? [lookup.meaning]
        : []
    ).entries()) {
      if (definition.trim())
        senses.push({ id: `fallback:${index}`, definition, partOfSpeech: "" });
    }
  }
  return senses;
}
export function normalizedWord(word: string) {
  return word
    .normalize("NFKC")
    .trim()
    .replace(/[‘’]/g, "'")
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")
    .toLocaleLowerCase("en");
}
export function safeExternalUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
export const partOfSpeechLabel = (value: string) =>
  ({
    noun: "Danh từ",
    verb: "Động từ",
    adjective: "Tính từ",
    adverb: "Trạng từ",
    pronoun: "Đại từ",
    preposition: "Giới từ",
    conjunction: "Liên từ",
    interjection: "Thán từ",
    determiner: "Từ hạn định",
  })[value.toLowerCase()] || value;
