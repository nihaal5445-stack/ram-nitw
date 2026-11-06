/** Provider-agnostic text generation. GEMINI_API_KEY first, then ANTHROPIC_API_KEY. Returns null when no key is set or on any failure,
 *  so every caller has a deterministic fallback and the demo never breaks. NOT verified against the live APIs in this repo (no key was available). */
export type LlmResult = { text: string; provider: "gemini" | "anthropic" };

export const llmConfigured = () => !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);

export async function askLlm(system: string, user: string, maxTokens = 700): Promise<LlmResult | null> {
  try {
    if (process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 } }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
      return text ? { text, provider: "gemini" } : null;
    }
    if (process.env.ANTHROPIC_API_KEY) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
      });
      if (!res.ok) return null;
      const text = ((await res.json()) as { content?: { text?: string }[] }).content?.[0]?.text?.trim();
      return text ? { text, provider: "anthropic" } : null;
    }
  } catch { /* fall through to the deterministic fallback */ }
  return null;
}
