// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractModelText, coalesceContent } from "./extract";

describe("coalesceContent", () => {
  it("passes plain string content through", () => {
    expect(coalesceContent("[{\"q\":\"a\"}]")).toBe("[{\"q\":\"a\"}]");
  });

  it("joins typed-parts arrays into one string", () => {
    const parts = [
      { type: "text", text: "[{\"question\":" },
      { type: "text", text: "\"a?\",\"answer\":\"b\"}]" },
    ];
    expect(coalesceContent(parts)).toBe("[{\"question\":\"a?\",\"answer\":\"b\"}]");
  });

  it("skips non-text parts (e.g. tool calls)", () => {
    const parts = [
      { type: "tool_use", id: "x" },
      { type: "text", text: "hello" },
    ];
    expect(coalesceContent(parts)).toBe("hello");
  });

  it("returns null for empty strings, empty arrays, and junk", () => {
    expect(coalesceContent("")).toBeNull();
    expect(coalesceContent([])).toBeNull();
    expect(coalesceContent(42)).toBeNull();
    expect(coalesceContent(null)).toBeNull();
    expect(coalesceContent([{ type: "image", url: "x" }])).toBeNull();
  });
});

describe("extractModelText — openai/custom dialect", () => {
  it("reads the standard choices[0].message.content string", () => {
    const data = { choices: [{ message: { role: "assistant", content: "[]" } }] };
    expect(extractModelText("openai", data)).toBe("[]");
    expect(extractModelText("custom", data)).toBe("[]");
  });

  it("reads typed-parts content arrays (tokenrouter/gateway dialect)", () => {
    const data = {
      choices: [
        {
          message: {
            role: "assistant",
            content: [{ type: "text", text: "[{\"question\":\"q?\",\"answer\":\"a\"}]" }],
          },
        },
      ],
    };
    expect(extractModelText("custom", data)).toBe("[{\"question\":\"q?\",\"answer\":\"a\"}]");
    expect(extractModelText("openai", data)).toBe("[{\"question\":\"q?\",\"answer\":\"a\"}]");
  });

  it("falls back to the legacy choice.text completions dialect", () => {
    const data = { choices: [{ text: "legacy output" }] };
    expect(extractModelText("custom", data)).toBe("legacy output");
  });

  it("returns null when no known shape matches", () => {
    expect(extractModelText("custom", { choices: [] })).toBeNull();
    expect(extractModelText("custom", { choices: [{ message: { content: "" } }] })).toBeNull();
    expect(extractModelText("custom", {})).toBeNull();
    expect(extractModelText("custom", "not an object")).toBeNull();
    expect(extractModelText("custom", null)).toBeNull();
  });
});

describe("extractModelText — anthropic dialect", () => {
  it("finds the first text block", () => {
    const data = { content: [{ type: "text", text: "hello" }, { type: "text", text: "world" }] };
    expect(extractModelText("anthropic", data)).toBe("hello");
  });

  it("returns null without a text block", () => {
    expect(extractModelText("anthropic", { content: [] })).toBeNull();
    expect(extractModelText("anthropic", {})).toBeNull();
  });
});

describe("extractModelText — gemini dialect", () => {
  it("finds the first text part of the first candidate", () => {
    const data = {
      candidates: [{ content: { parts: [{ text: "gemini out" }] } }],
    };
    expect(extractModelText("gemini", data)).toBe("gemini out");
  });

  it("returns null without candidates", () => {
    expect(extractModelText("gemini", { candidates: [] })).toBeNull();
    expect(extractModelText("gemini", {})).toBeNull();
  });
});
