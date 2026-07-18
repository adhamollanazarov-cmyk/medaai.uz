// AI specialist matching: patient describes symptoms -> suggested specialty.
// Default: offline rule-based scoring (works with no API key, $0).
// Optional: any OpenAI-COMPATIBLE LLM when LLM_API_KEY is set.
//   • OpenAI (GPT):  LLM_BASE_URL=https://api.openai.com/v1     LLM_MODEL=gpt-4o-mini
//   • Claude:        LLM_BASE_URL=https://api.anthropic.com/v1  LLM_MODEL=claude-haiku-4-5
// The same code path serves both — only .env changes.
import { config } from './config.js';
import { SPECIALTIES, SPECIALTY_BY_CODE, specialtyName } from './specialties.js';

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[’`]/g, 'ʼ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Rule-based matcher. Returns ranked specialties with a rough confidence.
export function matchByRules(text, lang = 'ru') {
  const norm = normalize(text);
  const scored = SPECIALTIES.map((s) => {
    const matched = s.keywords.filter((kw) => norm.includes(normalize(kw)));
    return { code: s.code, score: matched.length, matched };
  }).filter((r) => r.score > 0);

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      source: 'rules',
      specialty: 'therapist',
      name: specialtyName('therapist', lang),
      confidence: 0.35,
      reason: lang === 'uz'
        ? 'Belgilardan aniq yoʻnalish topilmadi — terapevt boshlashga yaxshi tanlov.'
        : 'По описанию не удалось однозначно определить профиль — начать лучше с терапевта.',
      alternatives: [],
    };
  }

  const top = scored[0];
  const total = scored.reduce((sum, r) => sum + r.score, 0);
  const confidence = Math.min(0.95, 0.5 + 0.45 * (top.score / total));

  return {
    source: 'rules',
    specialty: top.code,
    name: specialtyName(top.code, lang),
    confidence: Number(confidence.toFixed(2)),
    reason: lang === 'uz'
      ? `Belgilar boʻyicha: ${top.matched.slice(0, 3).join(', ')}`
      : `По ключевым признакам: ${top.matched.slice(0, 3).join(', ')}`,
    alternatives: scored.slice(1, 3).map((r) => ({
      specialty: r.code,
      name: specialtyName(r.code, lang),
    })),
  };
}

// Robustly pull a JSON object out of a model reply.
// Needed because Claude's OpenAI-compat layer ignores response_format,
// so the model may wrap JSON in prose or ```code fences```.
export function parseModelJson(content) {
  if (!content) throw new Error('empty content');
  let s = String(content).trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('no json object');
  return JSON.parse(s.slice(start, end + 1));
}

// OpenAI-compatible LLM classification. Falls back to rules on any error.
async function matchByLLM(text, lang) {
  const list = SPECIALTIES.map((s) => `${s.code} = ${s.name_ru} / ${s.name_uz}`).join('\n');
  const sys = `You are a medical triage assistant for a clinic booking app in Uzbekistan.
Map the patient's complaint to ONE specialty code from this list:
${list}
Output ONLY raw JSON (no markdown, no code fences, no extra text):
{"specialty":"<code>","confidence":<0..1>,"reason":"<short reason in ${lang === 'uz' ? 'Uzbek' : 'Russian'}>"}
Never diagnose. If unclear, use "therapist".`;

  // Fail fast if the model is slow/unreachable — /api/match then falls back to rules.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let data;
  try {
    const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        temperature: 0.1,
        max_tokens: 200,
        // Helps OpenAI return clean JSON; silently ignored by Claude's compat layer.
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: String(text || '').slice(0, 800) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const parsed = parseModelJson(data.choices?.[0]?.message?.content);
  const code = SPECIALTY_BY_CODE[parsed.specialty] ? parsed.specialty : 'therapist';
  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.7;
  confidence = Math.max(0, Math.min(1, confidence));
  return {
    source: 'llm',
    specialty: code,
    name: specialtyName(code, lang),
    confidence: Number(confidence.toFixed(2)),
    reason: parsed.reason || '',
    alternatives: [],
  };
}

export async function matchSpecialty(text, lang = 'ru') {
  if (config.llm.apiKey) {
    try {
      return await matchByLLM(text, lang);
    } catch (e) {
      const r = matchByRules(text, lang);
      r.source = 'rules-fallback';
      return r;
    }
  }
  return matchByRules(text, lang);
}
