export interface WordSearchResult {
  word: string;
  frequency: number;
  score: number;
}

export interface WordSearchRepository {
  search(query: string, limit: number): Promise<WordSearchResult[]>;
}
