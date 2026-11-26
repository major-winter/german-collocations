// Decision #70 (docs/superpowers/specs/2026-11-26-collocation-check-design.md):
// "Passt das zusammen?" - the rules that turn a typed phrase like "eine
// Entscheidung machen" into a noun, a lab verb lemma and a verdict. Pure
// functions; the service feeds them what the store finds.

const MIN_TOKENS = 2;
const MAX_TOKENS = 5;

const SEPARABLE_PARTICLES = new Set([
  "ab", "an", "auf", "aus", "bei", "ein", "fest", "mit", "nach", "vor", "weg", "zu", "zurück",
]);

// Articles, "kein" and possessives with any ending: they carry no meaning
// for the check, and keeping them would make every phrase three tokens.
const DETERMINER = /^(der|die|das|den|dem|des|(ein|kein|mein|dein|sein|ihr|unser|euer|eur)(e|en|em|er|es)?)$/i;

const REFLEXIVE_PREFIX = "sich ";

export interface SplitPhrase {
  /** The two remaining words, in typed order: one noun, one verb. */
  words: [string, string];
  /** Whether "sich" was typed. */
  sich: boolean;
  /** A trailing separable particle ("legt eine Pause ein" -> "ein"). */
  particle: string | null;
}

/** null unless the phrase is exactly a noun and a verb once function words are gone. */
export function splitPhrase(q: string): SplitPhrase | null {
  const tokens = q.trim().split(/\s+/).filter((t) => t !== "");
  if (tokens.length < MIN_TOKENS || tokens.length > MAX_TOKENS) return null;

  // Before the determiners go: a trailing "ein" is a particle, not an article.
  let particle: string | null = null;
  const last = tokens[tokens.length - 1].toLowerCase();
  if (tokens.length >= 3 && SEPARABLE_PARTICLES.has(last)) {
    particle = last;
    tokens.pop();
  }

  let sich = false;
  const words = tokens.filter((t) => {
    if (t.toLowerCase() === "sich") {
      sich = true;
      return false;
    }
    return !DETERMINER.test(t);
  });
  if (words.length !== 2) return null;
  return { words: [words[0], words[1]], sich, particle };
}

export interface VerbCandidate {
  /** A lab verb lemma, possibly reflexive ("sich machen"). */
  verb: string;
  /** How many example rows use the typed surface for this lemma. */
  uses: number;
}

function baseOf(verb: string): string {
  return verb.startsWith(REFLEXIVE_PREFIX) ? verb.slice(REFLEXIVE_PREFIX.length) : verb;
}

/**
 * The lab verb lemma (without "sich") a typed verb form stands for,
 * resolved without looking at the noun (the learner review: preferring
 * the lemma that pairs with the noun turned "nimmt ein Foto" into
 * "aufnehmen", "Üblich"). A particle verb only stands for a typed
 * particle, attached ("aufnimmt") or trailing ("legt … ein").
 */
export function pickVerbLemma(
  typed: string,
  particle: string | null,
  candidates: VerbCandidate[],
): string | null {
  const word = typed.toLowerCase();
  const uses = new Map<string, number>();
  for (const c of candidates) {
    const base = baseOf(c.verb);
    uses.set(base, (uses.get(base) ?? 0) + c.uses);
  }
  if (!particle && uses.has(word)) return word;

  const bases = [...uses.keys()];
  // "aufnehmen" is prefixed with "auf" when "nehmen" is also a candidate.
  const prefixOf = (b: string): string | null => {
    const shorter = bases
      .filter((d) => d !== b && b.endsWith(d))
      .sort((x, y) => y.length - x.length)[0];
    return shorter === undefined ? null : b.slice(0, -shorter.length);
  };

  let eligible: string[];
  if (particle) {
    eligible = bases.filter((b) => {
      const prefix = prefixOf(b);
      return prefix === particle || (prefix === null && b.startsWith(particle) && b !== particle);
    });
  } else {
    const attached = bases.filter((b) => {
      const prefix = prefixOf(b);
      return prefix !== null && word.startsWith(prefix);
    });
    eligible = attached.length > 0 ? attached : bases.filter((b) => prefixOf(b) === null);
  }

  eligible.sort((a, b) => uses.get(b)! - uses.get(a)! || a.localeCompare(b));
  return eligible[0] ?? null;
}
