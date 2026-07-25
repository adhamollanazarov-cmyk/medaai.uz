// Multi-turn AI triage chat (ported from the legacy Python bot, adapted to the
// meda.ai schema and specialty codes).
//
// Difference from matcher.js:
//   • matcher.js  — ONE-SHOT: text in, specialty out. Used by /api/match.
//   • chat.js     — CONVERSATION: the assistant asks 2-3 clarifying questions
//                   first, then commits to a specialty. Used by /api/chat.
//
// Both share the same OpenAI-compatible config (config.llm), so a single
// LLM_API_KEY in .env powers them together. With no key, chat degrades
// gracefully to the offline rule-based matcher — no crash, no dead UI.
import { config } from './config.js';
import { SPECIALTIES, SPECIALTY_BY_CODE, specialtyName } from './specialties.js';
import { matchByRules } from './matcher.js';

// The model signals it is done by emitting this marker on its own line.
// Kept as "TAVSIYA:" for continuity with the legacy bot's prompt.
const MARKER = 'TAVSIYA:';

const MAX_HISTORY = 20;      // messages kept from the client (oldest dropped)
const MAX_MSG_CHARS = 1500;  // per-message cap
const LLM_TIMEOUT_MS = 20000;

export const chatAvailable = () => Boolean(config.llm.apiKey);

function systemPrompt(lang) {
  const list = SPECIALTIES.map((s) => `${s.code} = ${s.name_ru} / ${s.name_uz}`).join('\n');
  const langName = lang === 'uz' ? 'Uzbek (latin script)' : 'Russian';
  return `You are the triage assistant of meda.ai, a doctor-booking app in Uzbekistan.
Reply ONLY in ${langName}.

HOW TO BEHAVE:
1. Ask the patient 2-3 SHORT clarifying questions about their symptoms
   (duration, severity, what makes it worse, related symptoms).
   Ask ONE question per message. Keep every message under 60 words.
2. As soon as you have enough information, name the specialty to see and
   append this EXACT line as the LAST line of that message:
${MARKER} <code>
   where <code> is ONE code from this list:
${list}

HARD RULES:
- NEVER give a diagnosis and NEVER suggest medication. You only route to a specialist.
- If the patient describes red-flag symptoms (chest pain with shortness of breath,
  stroke signs, heavy bleeding, loss of consciousness, suicidal thoughts),
  tell them to call emergency services (103) IMMEDIATELY and emit the marker at once.
- Emit the ${MARKER} line at most once, and never before you have actually
  named the specialist in plain language in the same message.
- If after 3 questions it is still unclear, use ${MARKER} therapist.
- Output the marker as plain text. No markdown, no code fences, no bold.`;
}

// Pull the specialty code out of a model reply. Returns null if not finished yet.
export function extractSpecialty(text) {
  for (const raw of String(text || '').split('\n')) {
    const m = raw.trim().match(/^\**\s*TAVSIYA\s*:\s*(.+?)\s*\**$/i);
    if (!m) continue;
    const code = m[1].trim().toLowerCase().replace(/[^a-z_]/g, '');
    if (SPECIALTY_BY_CODE[code]) return code;
    // The model sometimes writes the human name instead of the code — map it back.
    const byName = SPECIALTIES.find((s) =>
      s.name_ru.toLowerCase() === m[1].trim().toLowerCase() ||
      s.name_uz.toLowerCase() === m[1].trim().toLowerCase());
    if (byName) return byName.code;
    return 'therapist';
  }
  return null;
}

// The marker is an internal protocol detail — never show it to the patient.
export function stripMarker(text) {
  return String(text || '')
    .split('\n')
    .filter((l) => !/^\**\s*TAVSIYA\s*:/i.test(l.trim()))
    .join('\n')
    .trim();
}

function sanitizeHistory(history) {
  return (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, MAX_MSG_CHARS) }));
}

const lastUserText = (history) =>
  [...history].reverse().find((m) => m.role === 'user')?.content || '';

// No API key (or the LLM failed): fall back to the offline matcher so the chat
// still produces a usable recommendation instead of an error screen.
function offlineReply(history, lang) {
  const r = matchByRules(lastUserText(history), lang);
  const reply = lang === 'uz'
    ? `Belgilaringizga koʻra ${r.name} bilan boshlash maʼqul.\n\n${r.reason}`
    : `Судя по описанию, начать стоит с приёма у специалиста: ${r.name}.\n\n${r.reason}`;
  return {
    reply,
    specialty: r.specialty,
    name: r.name,
    confidence: r.confidence,
    source: 'rules',
    done: true,
  };
}

export async function chatReply(rawHistory, lang = 'ru') {
  const history = sanitizeHistory(rawHistory);
  if (!history.length) throw Object.assign(new Error('empty_history'), { code: 'empty_history' });
  if (!chatAvailable()) return offlineReply(history, lang);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
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
        temperature: 0.4,
        max_tokens: 500,
        messages: [{ role: 'system', content: systemPrompt(lang) }, ...history],
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    data = await res.json();
  } catch (e) {
    clearTimeout(timer);
    console.error('chat LLM failed → offline fallback:', e.message);
    const r = offlineReply(history, lang);
    r.source = 'rules-fallback';
    return r;
  }
  clearTimeout(timer);

  const raw = data.choices?.[0]?.message?.content || '';
  const specialty = extractSpecialty(raw);
  return {
    reply: stripMarker(raw),
    specialty,
    name: specialty ? specialtyName(specialty, lang) : null,
    confidence: specialty ? 0.85 : null,
    source: 'llm',
    done: Boolean(specialty),
  };
}
