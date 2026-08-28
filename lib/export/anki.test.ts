import { describe, it, expect } from "vitest";
import { cardsToAnkiTxt } from "./anki";

describe("cardsToAnkiTxt", () => {
  it("emits tab-separated question/answer lines", () => {
    const txt = cardsToAnkiTxt([
      { question: "why binary search?", answer: "halves the range each step" },
      { question: "why not (lo+hi)/2?", answer: "overflow risk" },
    ]);
    expect(txt.split("\n")).toHaveLength(2);
    expect(txt).toContain("why binary search?\thalves the range each step");
  });

  it("fills a placeholder for missing answers", () => {
    const txt = cardsToAnkiTxt([{ question: "q1", answer: null }, { question: "q2", answer: "   " }]);
    for (const line of txt.split("\n")) {
      expect(line.split("\t")[1]).toContain("no answer recorded");
    }
  });

  it("neutralizes tabs and newlines inside fields so import never breaks", () => {
    const txt = cardsToAnkiTxt([{ question: "multi\nline\tq", answer: "a\tb\nc" }]);
    expect(txt.split("\n")).toHaveLength(1);
    const [q, a] = txt.split("\t");
    expect(q).not.toContain("\n");
    expect(a).toBe("a b <br> c");
  });
});
