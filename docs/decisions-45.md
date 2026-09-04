### 45. Highlight the literal surface words in each example, not the lemma

Decision #44 made `CollocationEntry.word` a lemma (e.g. "Gedanken") while
widening `examples` to any surface-form pair mapping to that lemma pair
(e.g. an example sentence drawn from the "Gedanke"/"Gedankens" surface
pair). `frontend/src/components/CollocationList.tsx`'s
`highlightCollocates` was never updated to match: it still highlighted
by exact lowercase string match against `queryWord`/`entry.word`, which
worked when written (before #44) but stopped being reliable once the
displayed word and the sentence's actual tokens could diverge -
observed directly as "Gedanken machen": "Gedanken" not highlighted
(sentence's actual token was a different inflected surface form) while
"machen" was highlighted seemingly correctly but only by coincidence.

Fixed at the source rather than in the frontend: `CollocationRepository
.ts`'s example-sentence `LATERAL` join already knows the literal
`left_word_id`/`right_word_id` behind each returned sentence - it just
wasn't selecting their text. Added a `words` join in that subquery and
return `leftWord`/`rightWord` alongside `sentence`. `CollocationEntry
.examples` changed from `string[]` to `{ sentence, leftWord, rightWord
}[]` (new `CollocationExample` type in `@collocations/types`), and
`highlightCollocates` now matches against each example's own
`leftWord`/`rightWord` instead of the entry's lemma or the page's query
word. `CollocationList`'s `queryWord` prop was removed as a result -
nothing in the component needed it anymore, and `Word.tsx` no longer
passes it.

Considered a frontend-only fix (fuzzy/prefix matching to tolerate
inflection) and rejected it: it's a heuristic that would still misfire
on short words or unrelated tokens sharing a prefix, whereas the
backend already has the exact literal words on hand from the same row
as the sentence - no reason to guess when the correct data is one join
away.
