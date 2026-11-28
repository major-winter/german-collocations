import type { VerbNounPairs } from '@collocations/types';

// A hard-coded copy of what the real /wort/Rolle page shows for its first
// verb-noun group (one sentence per pair, taken from the live data), so the
// home page can show a result without an API call.
export const HOME_SAMPLE: VerbNounPairs = {
    side: 'noun',
    lemma: 'Rolle',
    article: 'die',
    pairs: [
        {
            relation: 'obj',
            partner: 'spielen',
            chip: 'spielen',
            chipArticle: null,
            phrase: 'eine Rolle spielen',
            phraseNoun: 'Rolle',
            score: 48300.53,
            frequency: 5073,
            examples: [{ sentence: 'Am Ende spielt es keine Rolle.', searchWord: 'Rolle', collocateWord: 'spielt' }],
        },
        {
            relation: 'obj',
            partner: 'einnehmen',
            chip: 'einnehmen',
            chipArticle: null,
            phrase: 'eine Rolle einnehmen',
            phraseNoun: 'Rolle',
            score: 1187.578,
            frequency: 246,
            examples: [{ sentence: 'Die Tafel nimmt eine wichtige Rolle ein.', searchWord: 'Rolle', collocateWord: 'nimmt' }],
        },
        {
            relation: 'obj',
            partner: 'übernehmen',
            chip: 'übernehmen',
            chipArticle: null,
            phrase: 'die Rolle übernehmen',
            phraseNoun: 'Rolle',
            score: 740.776,
            frequency: 324,
            examples: [{ sentence: 'Die Lehrkraft übernimmt die Rolle des Bürgermeisters.', searchWord: 'Rolle', collocateWord: 'übernimmt' }],
        },
        {
            relation: 'obj',
            partner: 'verkörpern',
            chip: 'verkörpern',
            chipArticle: null,
            phrase: 'die Rolle verkörpern',
            phraseNoun: 'Rolle',
            score: 112.813,
            frequency: 29,
            examples: [{ sentence: 'In letzterem Stück verkörperte sie die Rolle des Todes.', searchWord: 'Rolle', collocateWord: 'verkörperte' }],
        },
        {
            relation: 'obj',
            partner: 'zudenken',
            chip: 'zudenken',
            chipArticle: null,
            phrase: 'eine Rolle zudenken',
            phraseNoun: 'Rolle',
            score: 69.26,
            frequency: 9,
            examples: [{ sentence: 'Und diese Rolle hat er nun dem US-Militär zugedacht.', searchWord: 'Rolle', collocateWord: 'zugedacht' }],
        },
    ],
};
