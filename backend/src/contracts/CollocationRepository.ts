export interface CollocationRow {
  word: string;
  cooccurrence: number;
  significance: number;
}

export interface CollocationLookup {
  wordId: number;
  followedBy: CollocationRow[];
  precededBy: CollocationRow[];
}

export interface CollocationRepository {
  findByWord(word: string): Promise<CollocationLookup | null>;
}
