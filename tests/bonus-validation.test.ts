import { describe, it, expect } from "vitest";
import { validateBonusDistribution, type Scenario } from "../server/content";
const bank = () =>
  Array.from({ length: 155 }, (_, i) => ({
    correct: i < 31 ? "No objection" : "Hearsay",
    concept_tag: ["hearsay", "relevance", "character", "foundation", "opinion"][
      i % 5
    ],
  })) as Scenario[];
describe("bonus editorial distribution", () => {
  it("accepts a balanced 155-item bank at the 20% boundary", () =>
    expect(() => validateBonusDistribution(bank())).not.toThrow());
  it("rejects too few or too many proper-testimony answers", () => {
    const low = bank();
    low.forEach((s) => (s.correct = "Hearsay"));
    expect(() => validateBonusDistribution(low)).toThrow(/15%/);
    const high = bank();
    high[31].correct = "No objection";
    expect(() => validateBonusDistribution(high)).toThrow(/20%/);
  });
  it("rejects domination by a single concept", () => {
    const rows = bank();
    rows.forEach((s) => (s.concept_tag = "hearsay"));
    expect(() => validateBonusDistribution(rows)).toThrow(/25%/);
  });
});
