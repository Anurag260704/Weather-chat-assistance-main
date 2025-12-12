const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Interface for Gemini source and result
export type GeminiSource = { uri: string; title: string };
export type GeminiResult = { text: string; sources: GeminiSource[] };

// Custom error class for Gemini API errors
export class GeminiAPIError extends Error {
  status?: number;
  details?: unknown;
  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'GeminiAPIError';
    this.status = status;
    this.details = details;
  }
}

function buildFinalSystemInstruction(systemInstruction: string | undefined, language?: string) {
  let final = systemInstruction || '';
  if (language === 'ja-JP') {
    final += '\n\nAlways answer ONLY in Japanese (日本語) regardless of input language. Use natural, friendly Japanese.';
  } else if (language === 'en-US') {
    final += '\n\nAlways answer ONLY in English regardless of input language. Use natural, friendly English.';
  }
  return final;
}

function parseCandidateSources(candidate: unknown): GeminiSource[] {
  const groundingVal = (candidate && typeof candidate === 'object') ? (candidate as Record<string, unknown>)['groundingMetadata'] : undefined;
  if (!groundingVal || typeof groundingVal !== 'object') return [];
  const grounding = groundingVal as { groundingAttributions?: unknown };
  if (!grounding.groundingAttributions) return [];
  type GA = { web?: { uri?: string; title?: string } };
  const arr = grounding.groundingAttributions as unknown as GA[];
  return arr.map((a) => ({ uri: a?.web?.uri || '', title: a?.web?.title || 'External Source' }));
}

// fetch response from Gemini API
export async function callGemini(promptText: string, systemInstruction: string, language?: string): Promise<GeminiResult> {
  if (!GEMINI_API_KEY) throw new GeminiAPIError('Server-side Gemini API key not configured.');
  if (!promptText || !promptText.trim()) throw new GeminiAPIError('promptText is required');

  const finalSystemInstruction = buildFinalSystemInstruction(systemInstruction, language);
  const payload = {
    contents: [{ parts: [{ text: promptText }] }],
    systemInstruction: { role: 'system', parts: [{ text: finalSystemInstruction }] },
    tools: [{ googleSearch: {} }],
  };

  const maxAttempts = 2;
  const baseTimeoutMs = 8000; // per-request timeout

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = setTimeout(() => controller?.abort(), baseTimeoutMs * attempt);
    try {
      const resp = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });

      clearTimeout(timeout);

      if (!resp.ok) {
        const txt = await resp.text();
        let details: unknown = txt;
        try { details = JSON.parse(txt).error || txt; } catch {}
        throw new GeminiAPIError(`Gemini API Error: ${resp.status}`, resp.status, details);
      }

      const result = await resp.json();
      const candidate = result?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      if (!text) throw new GeminiAPIError('Could not parse response from Gemini API.', 500, result);

      const sources = parseCandidateSources(candidate);
      return { text, sources };
    } catch (err) {
      clearTimeout(timeout);
      const isLast = attempt === maxAttempts;
      // If aborted or network error, and we have retries left, wait and retry
      const e = err as Error & { name?: string };
      if (!isLast) {
        // delay exponential backoff
        const delayMs = 200 * attempt;
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      // final failure: normalize error
      if (e instanceof GeminiAPIError) throw e;
      if (e.name === 'AbortError') throw new GeminiAPIError('Request to Gemini timed out');
      throw new GeminiAPIError(e.message || 'Unknown error calling Gemini');
    }
  }

  
  throw new GeminiAPIError('Unexpected error in callGemini');
}
