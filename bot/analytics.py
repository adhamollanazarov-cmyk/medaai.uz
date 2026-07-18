from db import pool

_BARS = "▁▂▃▄▅▆▇█"

L = {
    "ru": {
        "title": "📊 *Аналитика meda.ai*",
        "users": "Пользователи",
        "new7": "новых за 7 дней",
        "appts": "Записи",
        "confirmed": "подтверждено",
        "completed": "завершено",
        "no_show": "неявка",
        "cancelled": "отменено",
        "noshow_rate": "Доля неявок",
        "conv": "Конверсия симптом→запись",
        "matches": "подборов",
        "last7": "Записи за 7 дней",
        "top_spec": "Топ специальностей",
        "top_clinic": "Топ клиник",
        "none": "нет данных",
    },
    "uz": {
        "title": "📊 *meda.ai analitikasi*",
        "users": "Foydalanuvchilar",
        "new7": "7 kunda yangi",
        "appts": "Yozuvlar",
        "confirmed": "tasdiqlangan",
        "completed": "yakunlangan",
        "no_show": "kelmadi",
        "cancelled": "bekor qilingan",
        "noshow_rate": "Kelmaslik ulushi",
        "conv": "Konversiya belgi→yozuv",
        "matches": "tanlov",
        "last7": "7 kunlik yozuvlar",
        "top_spec": "Top mutaxassisliklar",
        "top_clinic": "Top klinikalar",
        "none": "maʼlumot yoʻq",
    },
}


async def gather():
    p = pool()
    users = await p.fetchrow(
        """SELECT count(*) AS total,
                  count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS new7
           FROM patients"""
    )
    appts = await p.fetchrow(
        """SELECT count(*) AS total,
                  count(*) FILTER (WHERE status='confirmed') AS confirmed,
                  count(*) FILTER (WHERE status='completed') AS completed,
                  count(*) FILTER (WHERE status='no_show')   AS no_show,
                  count(*) FILTER (WHERE status='cancelled') AS cancelled
           FROM appointments"""
    )
    last7 = await p.fetch(
        """SELECT d::date AS day, count(a.id) AS cnt
           FROM generate_series(now()::date - 6, now()::date, interval '1 day') d
           LEFT JOIN appointments a ON a.created_at::date = d::date
           GROUP BY day ORDER BY day"""
    )
    conv = await p.fetchrow(
        """SELECT count(*) AS matches, count(*) FILTER (WHERE booked) AS booked FROM match_events"""
    )
    top_spec = await p.fetch(
        """SELECT s.name_ru, s.name_uz, count(*) AS cnt
           FROM appointments a JOIN doctors d ON d.id=a.doctor_id
           JOIN specialties s ON s.code=d.specialty
           WHERE a.status <> 'cancelled'
           GROUP BY s.name_ru, s.name_uz ORDER BY cnt DESC LIMIT 5"""
    )
    top_clinic = await p.fetch(
        """SELECT c.name, count(*) AS cnt
           FROM appointments a JOIN doctors d ON d.id=a.doctor_id
           JOIN clinics c ON c.id=d.clinic_id
           WHERE a.status <> 'cancelled'
           GROUP BY c.name ORDER BY cnt DESC LIMIT 5"""
    )
    return {"users": users, "appts": appts, "last7": last7, "conv": conv,
            "top_spec": top_spec, "top_clinic": top_clinic}


def _sparkline(counts):
    if not counts:
        return ""
    mx = max(counts) or 1
    return "".join(_BARS[min(len(_BARS) - 1, round(c / mx * (len(_BARS) - 1)))] for c in counts)


def format_report(data, lang="ru"):
    tr = L.get(lang, L["ru"])
    u, a, conv = data["users"], data["appts"], data["conv"]
    total_appt = a["total"] or 0
    attended = (a["completed"] or 0) + (a["no_show"] or 0)
    noshow_rate = round((a["no_show"] or 0) / attended * 100) if attended else 0
    matches = conv["matches"] or 0
    booked = conv["booked"] or 0
    conv_rate = round(booked / matches * 100) if matches else 0

    counts = [r["cnt"] for r in data["last7"]]
    spark = _sparkline(counts)
    days_lbl = "".join(str(r["day"].day).rjust(3) for r in data["last7"])

    def spec_name(r):
        return r["name_uz"] if lang == "uz" else r["name_ru"]

    top_spec = "\n".join(f"  {i+1}. {spec_name(r)} — {r['cnt']}" for i, r in enumerate(data["top_spec"])) or f"  {tr['none']}"
    top_clinic = "\n".join(f"  {i+1}. {r['name']} — {r['cnt']}" for i, r in enumerate(data["top_clinic"])) or f"  {tr['none']}"

    lines = [
        tr["title"],
        "",
        f"👥 {tr['users']}: *{u['total']}*  (+{u['new7']} {tr['new7']})",
        "",
        f"🗓 {tr['appts']}: *{total_appt}*",
        f"   • {tr['confirmed']}: {a['confirmed']}",
        f"   • {tr['completed']}: {a['completed']}",
        f"   • {tr['no_show']}: {a['no_show']}",
        f"   • {tr['cancelled']}: {a['cancelled']}",
        f"⚠️ {tr['noshow_rate']}: *{noshow_rate}%*",
        "",
        f"🎯 {tr['conv']}: *{conv_rate}%*  ({booked}/{matches} {tr['matches']})",
        "",
        f"📈 {tr['last7']}:  `{spark}`",
        f"`{days_lbl}`",
        "",
        f"🏆 {tr['top_spec']}:\n{top_spec}",
        "",
        f"🏥 {tr['top_clinic']}:\n{top_clinic}",
    ]
    return "\n".join(lines)
