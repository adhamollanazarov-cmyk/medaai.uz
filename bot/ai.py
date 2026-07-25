"""AI consultation for the Telegram bot.

The bot does NOT talk to the LLM directly — it calls the Node API's /api/chat.
That keeps ONE prompt, ONE set of specialty codes and ONE match_events log for
both the Mini App and the bot. Only API_BASE has to be reachable.

Transcripts live in memory (per user) and expire, which is fine: a triage
conversation is short-lived and the outcome is persisted server-side as a
match_event / appointment.
"""
import time
import logging

import aiohttp  # already a transitive dependency of aiogram

import config

log = logging.getLogger("medauz-bot.ai")

# Where the Node API lives. Locally both run on the same host.
API_BASE = (config.PUBLIC_URL or "http://localhost:3000").rstrip("/")

SESSION_TTL = 30 * 60      # forget a conversation after 30 min of silence
MAX_TURNS = 24             # hard cap on stored messages per user
REQUEST_TIMEOUT = 25

# user_id -> {"messages": [...], "ts": float}
_sessions: dict[int, dict] = {}


def _prune():
    now = time.time()
    for uid in [u for u, s in _sessions.items() if now - s["ts"] > SESSION_TTL]:
        _sessions.pop(uid, None)


def active(user_id: int) -> bool:
    _prune()
    return user_id in _sessions


def reset(user_id: int):
    _sessions.pop(user_id, None)


def start(user_id: int):
    _sessions[user_id] = {"messages": [], "ts": time.time()}


async def send(user_id: int, text: str, lang: str = "ru") -> dict | None:
    """Push one user message into the conversation and return the API result.

    Returns None on network/API failure so the caller can show a fallback.
    Result keys: reply, done, specialty, name, doctors.
    """
    _prune()
    sess = _sessions.setdefault(user_id, {"messages": [], "ts": time.time()})
    sess["ts"] = time.time()
    sess["messages"].append({"role": "user", "content": text})
    sess["messages"] = sess["messages"][-MAX_TURNS:]

    payload = {"history": sess["messages"], "lang": lang, "tgId": str(user_id)}
    timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as s:
            async with s.post(f"{API_BASE}/api/chat", json=payload) as r:
                if r.status != 200:
                    log.warning("chat API returned %s", r.status)
                    return None
                data = await r.json()
    except Exception as e:
        log.warning("chat API unreachable (%s): %s", API_BASE, e)
        return None

    if data.get("reply"):
        sess["messages"].append({"role": "assistant", "content": data["reply"]})
    if data.get("done"):
        # Conversation finished — next message starts a fresh one.
        reset(user_id)
    return data


async def llm_enabled() -> bool:
    """True when the API has an LLM key configured."""
    timeout = aiohttp.ClientTimeout(total=5)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as s:
            async with s.get(f"{API_BASE}/api/chat/status") as r:
                return bool((await r.json()).get("llm"))
    except Exception:
        return False
