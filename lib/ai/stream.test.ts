// @vitest-environment node
import { describe, expect, it } from "vitest";
import { feedSseEvent, newAccumulator, normalizeSse, splitSseBuffer } from "./stream";

describe("feedSseEvent", () => {
  it("accumulates string delta.content chunks like the reference client", () => {
    const acc = newAccumulator();
    feedSseEvent(acc, JSON.stringify({ choices: [{ delta: { content: "[{\"question\":" } }] }));
    feedSseEvent(acc, JSON.stringify({ choices: [{ delta: { content: "\"a?\"}]" } }] }));
    expect(acc.text).toBe("[{\"question\":\"a?\"}]");
    expect(acc.done).toBe(false);
  });

  it("accumulates typed-parts delta content (gateway dialect)", () => {
    const acc = newAccumulator();
    feedSseEvent(acc, JSON.stringify({ choices: [{ delta: { content: [{ type: "text", text: "hello " }] } }] }));
    feedSseEvent(acc, JSON.stringify({ choices: [{ delta: { content: [{ type: "text", text: "world" }] } }] }));
    expect(acc.text).toBe("hello world");
  });

  it("stops at [DONE]", () => {
    const acc = newAccumulator();
    feedSseEvent(acc, "[DONE]");
    expect(acc.done).toBe(true);
  });

  it("ignores usage-only chunks (stream_options include_usage)", () => {
    const acc = newAccumulator();
    feedSseEvent(acc, JSON.stringify({ usage: { total_tokens: 42 } }));
    expect(acc.text).toBe("");
  });

  it("ignores empty deltas, junk, and keep-alives", () => {
    const acc = newAccumulator();
    feedSseEvent(acc, "");
    feedSseEvent(acc, ": keep-alive comment");
    feedSseEvent(acc, "{not json");
    feedSseEvent(acc, JSON.stringify({ choices: [{ delta: {} }] }));
    expect(acc.text).toBe("");
    expect(acc.done).toBe(false);
  });

  it("handles empty choices arrays", () => {
    const acc = newAccumulator();
    feedSseEvent(acc, JSON.stringify({ choices: [] }));
    expect(acc.text).toBe("");
  });

  it("tracks reasoning_content separately, never mixing it into text", () => {
    const acc = newAccumulator();
    feedSseEvent(acc, JSON.stringify({ choices: [{ delta: { reasoning_content: "thinking deeply..." } }] }));
    feedSseEvent(acc, JSON.stringify({ choices: [{ delta: { reasoning_content: [{ type: "text", text: "more thought" }] } }] }));
    feedSseEvent(acc, JSON.stringify({ choices: [{ delta: { content: "the actual answer" } }] }));
    expect(acc.text).toBe("the actual answer");
    expect(acc.reasoningChars).toBe("thinking deeply...".length + "more thought".length);
  });

  it("captures the first finish_reason (length, stop, content_filter)", () => {
    const acc = newAccumulator();
    feedSseEvent(acc, JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }] }));
    feedSseEvent(acc, JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }));
    expect(acc.finishReason).toBe("length");
  });

  it("models the GLM-5.3 failure mode: all reasoning, budget cut, zero answer", () => {
    const acc = newAccumulator();
    // The model reasons for the whole budget...
    for (let i = 0; i < 50; i++) {
      feedSseEvent(acc, JSON.stringify({ choices: [{ delta: { reasoning_content: "reason ".repeat(20) } }] }));
    }
    // ...and the stream ends with finish_reason "length" and no content.
    feedSseEvent(acc, JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }] }));
    feedSseEvent(acc, "[DONE]");
    expect(acc.text).toBe("");
    expect(acc.reasoningChars).toBeGreaterThan(0);
    expect(acc.finishReason).toBe("length");
    expect(acc.done).toBe(true);
  });
});

describe("splitSseBuffer", () => {
  it("extracts data payloads and keeps the incomplete tail", () => {
    const sse = 'data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c":';
    const { events, rest } = splitSseBuffer(sse);
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('data: {"c":');
  });

  it("strips the optional single space after data:", () => {
    const { events } = splitSseBuffer("data: hello\n\n");
    expect(events).toEqual(["hello"]);
  });

  it("ignores non-data lines inside an event", () => {
    const { events } = splitSseBuffer("event: message\ndata: x\nid: 1\n\n");
    expect(events).toEqual(["x"]);
  });

  it("handles buffers with no complete events", () => {
    const { events, rest } = splitSseBuffer("data: partial");
    expect(events).toEqual([]);
    expect(rest).toBe("data: partial");
  });
});

describe("normalizeSse", () => {
  it("normalizes CRLF line endings", () => {
    expect(normalizeSse("data: a\r\n\r\ndata: b\r\n\r\n")).toBe("data: a\n\ndata: b\n\n");
  });
});

describe("round trip: chunked streaming", () => {
  it("survives arbitrary chunk boundaries", () => {
    const full = 'data: {"choices":[{"delta":{"content":"[1,"}}]}\n\ndata: {"choices":[{"delta":{"content":"2]"}}]}\n\ndata: [DONE]\n\n';
    // Simulate TCP-sized chunks that split events mid-line.
    const chunks = [full.slice(0, 30), full.slice(30, 55), full.slice(55, 80), full.slice(80)];
    let buffer = "";
    const acc = newAccumulator();
    for (const chunk of chunks) {
      buffer = normalizeSse(buffer + chunk);
      const { events, rest } = splitSseBuffer(buffer);
      buffer = rest;
      for (const e of events) feedSseEvent(acc, e);
    }
    expect(acc.text).toBe("[1,2]");
    expect(acc.done).toBe(true);
  });
});
