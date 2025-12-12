import { NextRequest } from 'next/server';
import { handleGeminiRequest } from '@/server/gemini/controller';
// API route for Gemini requests
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return await handleGeminiRequest(body);
  } catch (err) {
    console.error('Route error:', err);
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }
}
