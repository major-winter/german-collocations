export function isNonAlphabetic(word: string): boolean {
  const isNonAlphabetic = !/\p{L}/u.test(word);
  return isNonAlphabetic;
}

const STOPWORDS = new Set([
  // Pronouns
  "ich",
  "du",
  "er",
  "sie",
  "es",
  "wir",
  "ihr",
  "mich",
  "dich",
  "sich",
  "uns",
  "euch",
  "mir",
  "dir",
  "ihm",
  "ihn",
  "ihnen",
  "mein",
  "dein",
  "sein",
  "unser",
  "euer",
  "man",

  // Articles / determiners
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einem",
  "einen",
  "einer",
  "eines",
  "dieser",
  "diese",
  "dieses",
  "diesem",
  "diesen",
  "jeder",
  "jede",
  "jedes",
  "jedem",
  "jeden",

  // Conjunctions / particles
  "und",
  "oder",
  "aber",
  "auch",
  "noch",
  "dann",
  "denn",
  "doch",
  "schon",
  "nur",
  "nicht",
  "sondern",
  "weil",
  "dass",
  "wenn",
  "ob",
  "als",
  "wie",
]);
export function isStopword(word: string): boolean {
  return STOPWORDS.has(word.toLowerCase());
}
