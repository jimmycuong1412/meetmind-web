export interface ParsedInsight {
  title: string;
  summary: string;
  actionItems: string[];
}

export function stripThinkingBlock(text: string): string {
  const start = text.indexOf("<think>");
  if (start === -1) return text;
  const end = text.indexOf("</think>", start);
  if (end === -1) return text.slice(0, start).trim();
  return (text.slice(0, start) + text.slice(end + "</think>".length)).trim();
}

export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}

export function extractJsonField(json: string, field: string): string | null {
  const keyPattern = new RegExp(`"${field}"\\s*:\\s*"`);
  const match = keyPattern.exec(json);
  if (!match) return null;
  let i = match.index + match[0].length;
  let out = "";
  while (i < json.length) {
    const c = json[i];
    if (c === "\\" && i + 1 < json.length) {
      out += json[i + 1];
      i += 2;
      continue;
    }
    if (c === '"') {
      const rest = json.slice(i + 1).trimStart();
      if (rest.startsWith(",") || rest.startsWith("}")) return out;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out.trim() === "" ? null : out;
}

export function extractJsonArray(json: string, field: string): string[] {
  const match = new RegExp(`"${field}"\\s*:\\s*\\[([^\\]]*)\\]`).exec(json);
  if (!match) return [];
  return splitJsonArrayItems(match[1])
    .map((item) => removeSurroundingQuotes(item.trim()))
    .filter((item) => item.trim() !== "");
}

function removeSurroundingQuotes(s: string): string {
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

function splitJsonArrayItems(arrayContent: string): string[] {
  const items: string[] = [];
  let current = "";
  let inString = false;
  for (let i = 0; i < arrayContent.length; i++) {
    const c = arrayContent[i];
    if (c === "\\" && inString && i + 1 < arrayContent.length) {
      current += c + arrayContent[i + 1];
      i++;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      current += c;
    } else if (c === "," && !inString) {
      items.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  if (current.trim() !== "") items.push(current);
  return items;
}

export function parseInsight(rawOutput: string): ParsedInsight {
  const cleaned = stripCodeFences(stripThinkingBlock(rawOutput));
  const title = extractJsonField(cleaned, "title") ?? "Meeting Notes";
  const summary = extractJsonField(cleaned, "summary") ?? cleaned;
  const actionItems = extractJsonArray(cleaned, "action_items");
  return { title, summary, actionItems };
}
