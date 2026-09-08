// Both GovernedPreposition.case ("Nominativ"/"Genitiv"/"Dativ"/"Akkusativ")
// and CollocationEntry.relation ("Subjekt"/"Akkusativobjekt"/"Dativobjekt"/
// "Genitivobjekt") name the same four German grammatical cases from two
// different backend features (decisions #52 and #53) - normalized here to
// one shared color/abbreviation lookup so a case reads the same way
// wherever it appears.
const CASE_COLOR_CLASS: Record<string, string> = {
    Nominativ: 'text-case-nominativ',
    Subjekt: 'text-case-nominativ',
    Akkusativ: 'text-case-akkusativ',
    Akkusativobjekt: 'text-case-akkusativ',
    Dativ: 'text-case-dativ',
    Dativobjekt: 'text-case-dativ',
    Genitiv: 'text-case-genitiv',
    Genitivobjekt: 'text-case-genitiv',
};

// Short form for the relation badge - GovernedPrepositions already shows
// the case's own full name in the pill ("(Akkusativ)"), so only
// CollocationEntry.relation (verb-argument entries) needs an
// abbreviation, kept short since it sits inline next to a word chip.
const RELATION_ABBREVIATION: Record<string, string> = {
    Subjekt: 'Subj.',
    Akkusativobjekt: 'Akk.',
    Dativobjekt: 'Dat.',
    Genitivobjekt: 'Gen.',
};

export function caseColorClass(caseOrRelation: string): string {
    return CASE_COLOR_CLASS[caseOrRelation] ?? '';
}

export function relationAbbreviation(relation: string): string {
    return RELATION_ABBREVIATION[relation] ?? relation;
}
