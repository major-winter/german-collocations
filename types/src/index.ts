export interface CollocationEntry {
  word: string;
  cooccurrence: number;
  significance: number;
  examples: string[];
}

export interface CollocationResponse {
  word: string;
  followedBy: CollocationEntry[];
  precededBy: CollocationEntry[];
}
