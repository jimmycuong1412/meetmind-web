import { describe, it, expect } from "vitest";
import {
  stripThinkingBlock,
  stripCodeFences,
  extractJsonField,
  extractJsonArray,
  parseInsight,
} from "../src/pipeline/insightParser";

describe("stripThinkingBlock", () => {
  it("removes complete think block", () => {
    const input = "<think>Reasoning step 1. Reasoning step 2.</think>\nThe summary.";
    expect(stripThinkingBlock(input)).toBe("The summary.");
  });
  it("leaves text unchanged when no think block", () => {
    expect(stripThinkingBlock("Just a plain summary.")).toBe("Just a plain summary.");
  });
  it("discards everything after unclosed think tag", () => {
    const input = "Header.\n<think>Endless reasoning that never closes…";
    expect(stripThinkingBlock(input)).toBe("Header.");
  });
  it("keeps text on both sides of the block", () => {
    expect(stripThinkingBlock("Before.<think>middle</think>After.")).toBe("Before.After.");
  });
});

describe("stripCodeFences", () => {
  it("removes json fence", () => {
    expect(stripCodeFences('```json\n{"summary": "hello"}\n```')).toBe('{"summary": "hello"}');
  });
  it("removes plain fence", () => {
    expect(stripCodeFences("```\nplain content\n```")).toBe("plain content");
  });
  it("leaves non-fenced text alone", () => {
    expect(stripCodeFences('{"summary": "no fence"}')).toBe('{"summary": "no fence"}');
  });
  it("handles uppercase JSON tag", () => {
    expect(stripCodeFences('```JSON\n{"x": 1}\n```')).toBe('{"x": 1}');
  });
});

describe("extractJsonField", () => {
  it("pulls a simple string value", () => {
    expect(extractJsonField('{"summary": "hello world", "tasks": []}', "summary")).toBe("hello world");
  });
  it("returns null for missing field", () => {
    expect(extractJsonField('{"summary": "x"}', "missing")).toBeNull();
  });
  it("handles inner unescaped quotes followed by content", () => {
    // A small model emitted: "summary": "the "quoted" word in middle"
    // The closing quote of the value is the one followed by , or }.
    const input = '{"summary": "the "quoted" word in middle", "tasks": []}';
    expect(extractJsonField(input, "summary")).toBe("the quoted word in middle");
  });
  it("handles backslash-escaped quotes", () => {
    expect(extractJsonField('{"summary": "she said \\"hi\\""}', "summary")).toBe('she said "hi"');
  });
});

describe("extractJsonArray", () => {
  it("pulls quoted string items", () => {
    expect(extractJsonArray('{"tasks": ["first", "second", "third"]}', "tasks")).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
  it("returns empty for missing field", () => {
    expect(extractJsonArray('{"tasks": []}', "absent")).toEqual([]);
  });
  it("returns empty for empty array", () => {
    expect(extractJsonArray('{"tasks": []}', "tasks")).toEqual([]);
  });
  it("keeps items containing commas as single entries", () => {
    // Commas inside quoted strings must NOT split the item.
    const input = '{"tasks": ["Prepare report, review data", "Send email"]}';
    expect(extractJsonArray(input, "tasks")).toEqual(["Prepare report, review data", "Send email"]);
  });
  it("ignores blank items", () => {
    expect(extractJsonArray('{"tasks": ["valid", "", "  ", "another"]}', "tasks")).toEqual([
      "valid",
      "another",
    ]);
  });
});

describe("parseInsight", () => {
  it("parses a well-formed insight", () => {
    const raw = '{"title": "Sprint Planning", "summary": "The team agreed.", "action_items": ["Ship it"]}';
    expect(parseInsight(raw)).toEqual({
      title: "Sprint Planning",
      summary: "The team agreed.",
      actionItems: ["Ship it"],
    });
  });
  it("falls back to defaults on malformed output", () => {
    const raw = "The model just rambled with no JSON at all.";
    expect(parseInsight(raw)).toEqual({
      title: "Meeting Notes",
      summary: "The model just rambled with no JSON at all.",
      actionItems: [],
    });
  });
  it("handles fenced output with think block", () => {
    const raw = '<think>hmm</think>```json\n{"title": "T", "summary": "S", "action_items": []}\n```';
    expect(parseInsight(raw)).toEqual({ title: "T", summary: "S", actionItems: [] });
  });
});
