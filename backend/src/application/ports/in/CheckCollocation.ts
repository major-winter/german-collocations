import type { CollocationCheck } from "@collocations/types";

// Driving (inbound) port: "Passt das zusammen?" for a typed phrase (#70).
export interface CheckCollocation {
  check(q: string): Promise<CollocationCheck>;
}
