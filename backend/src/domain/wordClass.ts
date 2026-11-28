import type { WordClass } from "@collocations/types";

// Decision #85: the spaCy tag of a lemma (lemma_dominant_pos.pos) as the
// word class a learner reads next to a suggestion.
export function wordClassOf(pos: string): WordClass {
  switch (pos) {
    case "NOUN":
      return "noun";
    case "VERB":
    case "AUX":
      return "verb";
    case "ADJ":
      return "adjective";
    case "ADV":
      return "adverb";
    case "PROPN":
      return "name";
    default:
      return "other";
  }
}
