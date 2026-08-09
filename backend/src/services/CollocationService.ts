import type { CollocationRepository } from "../contracts/CollocationRepository.ts";
import type { CollocationResult, CollocationService } from "../contracts/CollocationService.ts";

export class CollocationServiceImpl implements CollocationService {
  #repo: CollocationRepository;
  constructor(repo: CollocationRepository) {
    this.#repo = repo;
  }

  async getCollocations(word: string): Promise<CollocationResult | null> {
    const collocations = await this.#repo.findByWord(word);
    if (!collocations) return null;

    return {
      word: word,
      followedBy: collocations.followedBy,
      precededBy: collocations.precededBy,
    };
  }
}
