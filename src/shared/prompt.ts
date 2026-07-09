// Verbatim port of prompt_short_meeting from the Android app's strings.xml
// (meetmind-assistant repo). JSON field names stay English for stable parsing.
export const SHORT_MEETING_PROMPT =
  "You are a meeting assistant analyzing discussions.\n" +
  "Write a title (max 8 words), a summary of key decisions and discussion points (at least 3-5 sentences, proportional to input length), and a list of actionable tasks.\n" +
  "Output ONLY valid JSON with this exact structure. No markdown. No code fences. No backticks:\n" +
  '{"title": "...", "summary": "...", "action_items": ["...", "..."]}\n' +
  "Be direct. Extract actionable tasks clearly.";
