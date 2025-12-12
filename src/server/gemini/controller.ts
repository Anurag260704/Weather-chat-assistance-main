import { NextResponse } from 'next/server';
import { callGemini } from './service';
export async function handleGeminiRequest(body: unknown) {
  try {
    const payload = (body && typeof body === 'object') ? (body as Record<string, unknown>) : {};
    const promptText = typeof payload['promptText'] === 'string' ? payload['promptText'] : '';
    const systemInstruction = typeof payload['systemInstruction'] === 'string' ? payload['systemInstruction'] : '';
    const language = typeof payload['language'] === 'string' ? payload['language'] : undefined;
    if (!promptText) {
      return NextResponse.json({ error: 'Missing promptText' }, { status: 400 });
    }

    try {
      const result = await callGemini(promptText, systemInstruction || '', language);
      return NextResponse.json(result);
    } catch (e) {
      const err = e as { message?: string; details?: unknown };
      console.error('Gemini service error:', err?.message || err);
      const status = err?.message && err.message.includes('Gemini API Error') ? 502 : 500;
      return NextResponse.json({ error: err.message || 'Gemini service error', details: err.details }, { status });
    }
  } catch (err) {
    console.error('Controller error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
