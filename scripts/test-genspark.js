#!/usr/bin/env node
/**
 * test-genspark.js — quick test that Genspark AI returns a natural Arabic reply
 * Usage: node scripts/test-genspark.js
 * Requires: GENSPARK_API_KEY in env or .env
 */
import { config } from '../src/config.js';

async function testGenspark() {
  if (!config.gensparkKey) {
    console.error('❌ No Genspark API key. Set GENSPARK_API_KEY in .env and on Render.');
    process.exit(1);
  }

  console.log(`🧪 Testing Genspark (model=${config.gensparkModel || 'genspark-v2'})...`);
  const prompt = 'اكتب لي مقالاً قصيراً عن DePIN بالعربية (5 أسطر).';

  try {
    const res = await fetch(`${config.gensparkUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.gensparkKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.gensparkModel || 'genspark-v2',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
        stream: false
      })
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`❌ Genspark HTTP ${res.status}: ${body.slice(0, 300)}`);
      process.exit(2);
    }

    const data = await res.json();
    const output = data.choices?.[0]?.message?.content || data.content || '';
    if (!output) {
      console.error('❌ Genspark returned an empty response');
      process.exit(3);
    }

    console.log('✅ Genspark responded successfully:');
    console.log('──────────────────────────────');
    console.log(output);
    console.log('──────────────────────────────');
    console.log('✅ Test passed!');
  } catch (e) {
    console.error(`❌ Genspark error: ${e.message}`);
    process.exit(4);
  }
}

testGenspark();
