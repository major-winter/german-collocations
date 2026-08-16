import type {
  WordSearchRepository,
  WordSearchResult,
} from "../contracts/WordSearchRepository.ts";
import type { WordSearchService } from "../contracts/WordSearchService.ts";

export class WordSearchServiceImpl implements WordSearchService {
  #repo: WordSearchRepository;
  constructor(repo: WordSearchRepository) {
    this.#repo = repo;
  }
  async search(query: string): Promise<WordSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    return this.#repo.search(trimmed, 10);
  }
}
