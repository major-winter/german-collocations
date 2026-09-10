import spacy

nlp = spacy.load("de_core_news_sm")

sentences = [
    "Das große Auto steht vor dem Haus.",
    "Das Auto ist sehr groß.",
    "Das schöne alte Haus wurde letztes Jahr verkauft.",
    "Wegen des schlechten Wetters blieb er zuhause.",
    "Der Politiker traf die einflussreichsten Unternehmer der Stadt.",
    "Ein neues Gesetz wurde gestern verabschiedet.",
    "Die Regierung kündigte drastische Maßnahmen an.",
    "Das Auto, das er letzte Woche gekauft hatte, war rot.",
    "Der Mann kaufte ein großes und teures Auto.",
    "Die Alten saßen auf der Bank.",
    "Das gekaufte Auto wurde sofort verkauft.",
    "Er hält das für eine gute Idee.",
]

for sent in sentences:
    doc = nlp(sent)
    print(f"\n=== {sent}")
    for tok in doc:
        is_participle = tok.pos_ == "VERB" and "Part" in tok.morph.get("VerbForm")
        if tok.pos_ == "ADJ" or is_participle:
            print(
                f" {tok.text:15} pos={tok.pos_:6} dep={tok.dep_:6} head={tok.head.text}({tok.head.pos_})"
            )

extra_sentences = [
    "Das Auto ist sehr groß.",
    "Der Mann kaufte ein großes, teures und schnelles Auto.",
    "Das Auto ist entweder rot oder blau.",
]

for sent in extra_sentences:
    doc = nlp(sent)
    print(f"\n=== {sent}")
    for tok in doc:
        print(
            f" {tok.text:15} pos={tok.pos_:6} dep={tok.dep_:6} head={tok.head.text}({tok.head.pos_})"
        )
