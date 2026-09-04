// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseDraftCards, MAX_DRAFT_CARDS, MAX_QUESTION_CHARS, MAX_ANSWER_CHARS } from "./parse";

describe("parseDraftCards", () => {
  it("parses a clean bare JSON array", () => {
    const out = parseDraftCards(
      `[{"question":"Why halve?","answer":"log n depth","line":5},{"question":"Base case?","answer":"lo>=hi","line":null}]`
    );
    expect(out).toEqual([
      { question: "Why halve?", answer: "log n depth", line: 5 },
      { question: "Base case?", answer: "lo>=hi", line: null },
    ]);
  });

  it("parses an object wrapping the array under any key", () => {
    expect(parseDraftCards(`{"cards":[{"question":"a?","answer":"b"}]}`)).toEqual([
      { question: "a?", answer: "b", line: null },
    ]);
    expect(parseDraftCards(`{"drafts":[{"question":"a?","answer":"b"}]}`)).toEqual([
      { question: "a?", answer: "b", line: null },
    ]);
  });

  it("strips markdown fences", () => {
    const fenced = "```json\n[{\"question\":\"a?\",\"answer\":\"b\"}]\n```";
    expect(parseDraftCards(fenced)).toEqual([{ question: "a?", answer: "b", line: null }]);
  });

  it("slices a JSON array out of surrounding prose", () => {
    const chatty = "Here are your cards:\n[{\"question\":\"a?\",\"answer\":\"b\"}]\nHope that helps!";
    expect(parseDraftCards(chatty)).toEqual([{ question: "a?", answer: "b", line: null }]);
  });

  it("returns [] for garbage, empty strings, and non-JSON", () => {
    expect(parseDraftCards("")).toEqual([]);
    expect(parseDraftCards("not json at all")).toEqual([]);
    expect(parseDraftCards("[{broken")).toEqual([]);
    expect(parseDraftCards("42")).toEqual([]);
    expect(parseDraftCards("\"just a string\"")).toEqual([]);
    expect(parseDraftCards("null")).toEqual([]);
  });

  it("drops individual malformed cards but keeps the good ones", () => {
    const mixed = `[
      {"question":"good?","answer":"yes"},
      {"question":"no answer"},
      {"answer":"no question"},
      {"question":"","answer":"empty q"},
      "just a string",
      {"question":123,"answer":"bad q type"},
      {"question":"also good?","answer":"yes2","line":7}
    ]`;
    expect(parseDraftCards(mixed)).toEqual([
      { question: "good?", answer: "yes", line: null },
      { question: "also good?", answer: "yes2", line: 7 },
    ]);
  });

  it("caps at MAX_DRAFT_CARDS even when the model overproduces", () => {
    const many = JSON.stringify(
      Array.from({ length: 40 }, (_, i) => ({ question: `q${i}?`, answer: `a${i}` }))
    );
    const out = parseDraftCards(many);
    expect(out).toHaveLength(MAX_DRAFT_CARDS);
    expect(out[0].question).toBe("q0?");
    expect(out[9].question).toBe("q9?");
  });

  it("dedupes identical questions within a run", () => {
    const dupes = `[
      {"question":"same?","answer":"first"},
      {"question":"same?","answer":"second"}
    ]`;
    expect(parseDraftCards(dupes)).toEqual([{ question: "same?", answer: "first", line: null }]);
  });

  it("enforces length caps on question and answer", () => {
    const long = JSON.stringify([
      { question: "q".repeat(MAX_QUESTION_CHARS + 50) + "?", answer: "a".repeat(MAX_ANSWER_CHARS + 50) },
    ]);
    const out = parseDraftCards(long);
    expect(out).toHaveLength(1);
    expect(out[0].question).toHaveLength(MAX_QUESTION_CHARS);
    expect(out[0].answer).toHaveLength(MAX_ANSWER_CHARS);
  });

  it("strips control characters from card text", () => {
    const hostile = JSON.stringify([
      { question: "q\u0000\u0007?", answer: "a\u001fb" },
    ]);
    const out = parseDraftCards(hostile);
    expect(out[0].question).toBe("q?");
    expect(out[0].answer).toBe("ab");
  });

  it("rejects invalid line numbers but accepts 1..100000 integers", () => {
    const lines = JSON.stringify([
      { question: "a?", answer: "b", line: 0 },
      { question: "c?", answer: "d", line: 1 },
      { question: "e?", answer: "f", line: 100001 },
      { question: "g?", answer: "h", line: 3.5 },
      { question: "i?", answer: "j", line: "12" },
    ]);
    const out = parseDraftCards(lines);
    // 0 is below the valid range -> null; only the literal integer 1 survives.
    expect(out.map((c) => c.line)).toEqual([null, 1, null, null, null]);
  });
});
