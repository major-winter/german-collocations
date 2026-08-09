export interface CollocationEntry {
  word: string;
  cooccurrence: number;
  significance: number;
}

export interface CollocationResponse {
  word: string;
  followedBy: CollocationEntry[];
  precededBy: CollocationEntry[];
}
