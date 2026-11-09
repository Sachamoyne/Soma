export interface VocabularyEntry {
  wordSource: string;
  wordTarget: string;
  gender?: string;
  plural?: string;
  note?: string;
  example?: string;
  needsReview?: boolean;
}

export function normalizeVocabularyText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
}

const JAPANESE_SCRIPT = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const LATIN_SCRIPT = /\p{Script=Latin}/u;

function isJapaneseLanguage(language: string): boolean {
  return /^(ja|japanese|japonais|日本語)(?:\b|$)/iu.test(language.trim());
}

function isLatinLanguage(language: string): boolean {
  return /^(fr|french|fran[cç]ais|en|english|anglais)(?:\b|$)/iu.test(language.trim());
}

export function orientVocabularyEntry(
  entry: VocabularyEntry,
  sourceLanguage: string,
  targetLanguage: string,
  fromFallback = false
): VocabularyEntry {
  const japaneseIsSource = isJapaneseLanguage(sourceLanguage) && isLatinLanguage(targetLanguage);
  const japaneseIsTarget = isLatinLanguage(sourceLanguage) && isJapaneseLanguage(targetLanguage);
  if (!japaneseIsSource && !japaneseIsTarget) {
    return fromFallback ? { ...entry, needsReview: true } : entry;
  }

  const sourceHasJapanese = JAPANESE_SCRIPT.test(entry.wordSource);
  const targetHasJapanese = JAPANESE_SCRIPT.test(entry.wordTarget);
  const latinWord = sourceHasJapanese ? entry.wordTarget : entry.wordSource;
  if (sourceHasJapanese === targetHasJapanese || !LATIN_SCRIPT.test(latinWord)) {
    return { ...entry, needsReview: true };
  }

  if (sourceHasJapanese === japaneseIsSource) return entry;

  const { wordSource, wordTarget, ...metadata } = entry;
  return {
    ...metadata,
    wordSource: wordTarget,
    wordTarget: wordSource,
    // Optional information may describe the wrong word when the model swapped the columns.
    ...(entry.gender || entry.plural || entry.note || entry.example ? { needsReview: true } : {}),
  };
}

export function fallbackParseVocabulary(text: string): VocabularyEntry[] {
  const entries: VocabularyEntry[] = [];

  for (const line of text.split("\n")) {
    // Keep each pair on its own row. Multiple cells are ambiguous without the model.
    const cells = (line.includes("\t")
      ? line.split("\t")
      : line.trim().split(/ {2,}|\s+(?:–|—|-|:|=)\s+/)).map((cell) => cell.trim());
    if (cells.length !== 2) continue;

    const genderSuffix = /\s*\((m|f|n|masc|fem|neut)\)$/i;
    const sourceCell = cells[0].replace(/^(?:\d+[.)]|[•*–-])\s+/, "").trim();
    const gender = (sourceCell.match(genderSuffix) ?? cells[1].match(genderSuffix))?.[1][0].toLowerCase();
    const wordSource = sourceCell.replace(genderSuffix, "").trim();
    const wordTarget = cells[1].replace(genderSuffix, "").trim();
    if (!wordSource || !wordTarget || /^\d+[.)]?$/.test(wordSource)) continue;

    entries.push({ wordSource, wordTarget, ...(gender ? { gender } : {}) });
  }

  return entries;
}

export function flagCrossRowPair(entry: VocabularyEntry, rows: VocabularyEntry[]): VocabularyEntry {
  const normalize = (word: string) => word.normalize("NFC").toLowerCase();
  const source = normalize(entry.wordSource);
  const target = normalize(entry.wordTarget);
  const sourceRows = rows.filter((row) => [row.wordSource, row.wordTarget].some((word) => normalize(word) === source));
  const targetRows = rows.filter((row) => [row.wordSource, row.wordTarget].some((word) => normalize(word) === target));
  if (sourceRows.length && targetRows.length && !sourceRows.some((row) => targetRows.includes(row))) {
    return { ...entry, needsReview: true };
  }
  return entry;
}
