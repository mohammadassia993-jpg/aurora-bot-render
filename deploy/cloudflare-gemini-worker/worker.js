// Gemini Relay Worker — Cloudflare Worker
// ينشر على Cloudflare Workers (مجاني) ويعيد توجيه طلبات Gemini من منطقة مدعومة.
// المتغيرات البيئية: GEMINI_API_KEY (تُضاف من لوحة Cloudflare)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Gemini-Key'
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', provider: 'gemini-worker' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/') {
      return new Response('Gemini Relay Worker v1.0 — POST /v1beta/models/{model}:generateContent', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }
    if (url.pathname.startsWith('/v1beta/') && request.method === 'POST') {
      const apiKey = request.headers.get('X-Gemini-Key') || env.GEMINI_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'Missing API key' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const body = await request.text();
      const target = 'https://generativelanguage.googleapis.com' + url.pathname + '?key=' + apiKey;
      try {
        const upstream = await fetch(target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        const text = await upstream.text();
        return new Response(text, {
          status: upstream.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};
