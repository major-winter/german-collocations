import type { WordSearchResult } from "./WordSearchRepository.ts";

export interface WordSearchService {
  search(query: string): Promise<WordSearchResult[]>;
}
