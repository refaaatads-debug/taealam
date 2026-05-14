#!/usr/bin/env python3
"""
بوت Telegram — أجيال المعرفة
الأوامر:
  /status              — تقرير فوري
  /restart <خدمة>     — إعادة تشغيل container أو nginx
  /list                — قائمة الخدمات المتاحة
  /help                — قائمة الأوامر
"""
import subprocess, time, json, urllib.request, urllib.parse, os, sys

BOT_TOKEN = "8910464486:AAH9liMJXDXMrw7hTuzcVqfmknkezfOkXYA"
CHAT_ID   = "7408215367"
API       = f"https://api.telegram.org/bot{BOT_TOKEN}"
LOG       = "/var/log/ajyal-bot.log"
OFFSET_F  = "/var/lib/ajyal-monitor/bot_offset"

# الخدمات المسموح بإعادة تشغيلها — مع أسماء مختصرة للسهولة
ALLOWED_SERVICES = {
    "kong":           "supabase-kong",
    "auth":           "supabase-auth",
    "rest":           "supabase-rest",
    "storage":        "supabase-storage",
    "db":             "dfb4189dc98c_supabase-db",
    "realtime":       "realtime-dev.supabase-realtime",
    "studio":         "supabase-studio",
    "meta":           "supabase-meta",
    "pooler":         "supabase-pooler",
    "functions":      "supabase-edge-functions",
    "analytics":      "supabase-analytics",
    "imgproxy":       "supabase-imgproxy",
    "vector":         "supabase-vector",
    "nginx":          "nginx",   # خاص — يُعاد عبر systemctl
}

def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}\n"
    sys.stdout.write(line)
    with open(LOG, "a") as f:
        f.write(line)

def api(method, data=None):
    url = f"{API}/{method}"
    if data:
        body = urllib.parse.urlencode(data).encode()
        req  = urllib.request.Request(url, body)
    else:
        req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"API error {method}: {e}")
        return {}

def send(chat_id, text):
    api("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    })

def run(cmd, timeout=30):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True,
                           text=True, timeout=timeout)
        return r.stdout.strip() or r.stderr.strip(), r.returncode
    except Exception as e:
        return str(e), 1

def run_s(cmd, timeout=10):
    out, _ = run(cmd, timeout)
    return out

def get_status():
    now = time.strftime("%Y-%m-%d %H:%M")

    running   = run_s("docker ps --format '{{.Names}}' | wc -l")
    total     = run_s("docker ps -a --format '{{.Names}}' | wc -l")
    unhealthy = run_s("docker ps --format '{{.Status}}' | grep -c unhealthy || true")
    stopped   = str(int(total) - int(running)) if running.isdigit() and total.isdigit() else "?"
    d_icon    = "✅" if stopped == "0" and unhealthy == "0" else ("⚠️" if unhealthy != "0" else "🔴")

    ram_total    = int(run_s("grep MemTotal /proc/meminfo | tr -s ' ' | cut -d' ' -f2") or 1)
    ram_avail    = int(run_s("grep MemAvailable /proc/meminfo | tr -s ' ' | cut -d' ' -f2") or 0)
    ram_pct      = (ram_total - ram_avail) * 100 // ram_total
    ram_used_gb  = round((ram_total - ram_avail) / 1048576, 1)
    ram_total_gb = round(ram_total / 1048576, 1)
    ram_icon     = "✅" if ram_pct < 80 else ("⚠️" if ram_pct < 90 else "🔴")

    disk_pct   = run_s("df / | tail -1 | tr -s ' ' | cut -d' ' -f5 | tr -d '%'")
    disk_used  = run_s("df -h / | tail -1 | tr -s ' ' | cut -d' ' -f3")
    disk_total = run_s("df -h / | tail -1 | tr -s ' ' | cut -d' ' -f2")
    disk_icon  = "✅" if disk_pct.isdigit() and int(disk_pct) < 75 else ("⚠️" if disk_pct.isdigit() and int(disk_pct) < 85 else "🔴")

    nginx      = run_s("systemctl is-active nginx")
    nginx_icon = "✅" if nginx == "active" else "🔴"

    http_code  = run_s("curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://ajyalalmaerifa.com/")
    resp_time  = run_s("curl -s -o /dev/null -w '%{time_total}' --max-time 8 https://ajyalalmaerifa.com/")
    site_icon  = "✅" if http_code == "200" else "🔴"

    kong      = run_s("curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:8000/rest/v1/")
    kong_icon = "✅" if kong in ("200", "401") else "🔴"

    ssl_days = run_s(
        "echo | openssl s_client -servername ajyalalmaerifa.com "
        "-connect ajyalalmaerifa.com:443 2>/dev/null "
        "| openssl x509 -noout -enddate 2>/dev/null "
        "| cut -d= -f2 | xargs -I{} sh -c "
        "'echo $(( ($(date -d \"{}\" +%s) - $(date +%s)) / 86400 ))' 2>/dev/null || echo '?'"
    )
    ssl_icon = "✅"
    if ssl_days.isdigit():
        if int(ssl_days) <= 14: ssl_icon = "⚠️"
        if int(ssl_days) <= 7:  ssl_icon = "🔴"

    load   = run_s("cat /proc/loadavg | cut -d' ' -f1-3")
    uptime = run_s("awk '{print int($1/86400)\"d \"int(($1%86400)/3600)\"h\"}' /proc/uptime")

    today     = time.strftime("%Y/%m/%d")
    err_count = run_s(f"grep '{today}' /var/log/nginx/error.log 2>/dev/null | grep -c '\\[error\\]' || echo 0")

    return f"""📊 <b>حالة السيرفر — أجيال المعرفة</b>
🕐 {now}
━━━━━━━━━━━━━━━━━━━━

🐳 <b>Docker</b>
{d_icon} يعمل: {running} | متوقف: {stopped} | غير صحي: {unhealthy}

🌐 <b>الموقع</b>
{site_icon} HTTP: {http_code} | سرعة: {resp_time}s

⚙️ <b>Nginx</b>
{nginx_icon} {nginx} | أخطاء اليوم: {err_count}

🔀 <b>Kong API</b>
{kong_icon} HTTP: {kong}

💾 <b>RAM</b>
{ram_icon} {ram_used_gb}GB / {ram_total_gb}GB ({ram_pct}%)

💿 <b>القرص</b>
{disk_icon} {disk_used} / {disk_total} ({disk_pct}%)

🔒 <b>SSL</b>
{ssl_icon} تنتهي بعد: {ssl_days} يوم

⚡ <b>الخادم</b>
🔄 Uptime: {uptime} | Load: {load}
━━━━━━━━━━━━━━━━━━━━"""

def do_restart(chat_id, target):
    target = target.lower().strip()

    if target not in ALLOWED_SERVICES:
        aliases = "\n".join([f"  <code>{k}</code> → {v}" for k, v in ALLOWED_SERVICES.items()])
        send(chat_id, f"❌ الخدمة <code>{target}</code> غير موجودة.\n\nاستخدم /list لرؤية الخدمات المتاحة.")
        return

    full_name = ALLOWED_SERVICES[target]
    send(chat_id, f"⏳ جاري إعادة تشغيل <code>{full_name}</code>...")
    log(f"RESTART requested: {full_name}")

    if target == "nginx":
        out, code = run("systemctl restart nginx", timeout=30)
        if code == 0:
            send(chat_id, f"✅ <b>تم إعادة تشغيل Nginx بنجاح</b>")
        else:
            send(chat_id, f"🔴 <b>فشل إعادة تشغيل Nginx</b>\n<code>{out[:300]}</code>")
    else:
        out, code = run(f"docker restart {full_name}", timeout=60)
        if code == 0:
            time.sleep(3)
            status = run_s(f"docker inspect --format='{{{{.State.Status}}}}' {full_name}")
            health = run_s(f"docker inspect --format='{{{{if .State.Health}}}}{{{{.State.Health.Status}}}}{{{{else}}}}ok{{{{end}}}}' {full_name}")
            icon = "✅" if status == "running" else "🔴"
            send(chat_id,
                f"{icon} <b>إعادة تشغيل {full_name}</b>\n"
                f"الحالة: <code>{status}</code> | Health: <code>{health}</code>")
        else:
            send(chat_id, f"🔴 <b>فشل إعادة تشغيل {full_name}</b>\n<code>{out[:300]}</code>")

    log(f"RESTART done: {full_name} (exit={code})")

def get_list():
    lines = ["🗂 <b>الخدمات المتاحة لأمر /restart</b>\n"]
    for alias, full in ALLOWED_SERVICES.items():
        status = run_s(f"docker inspect --format='{{{{.State.Status}}}}' {full} 2>/dev/null") if alias != "nginx" \
                 else run_s("systemctl is-active nginx")
        icon = "✅" if status in ("running", "active") else "🔴"
        lines.append(f"{icon} <code>/restart {alias}</code>  →  {full}")
    lines.append("\nمثال: أرسل <code>/restart auth</code> لإعادة تشغيل Auth")
    return "\n".join(lines)

def get_offset():
    try:
        return int(open(OFFSET_F).read().strip())
    except:
        return 0

def save_offset(o):
    with open(OFFSET_F, "w") as f:
        f.write(str(o))

def main():
    os.makedirs("/var/lib/ajyal-monitor", exist_ok=True)
    log("🤖 Bot started — listening for commands")
    send(CHAT_ID,
         "🤖 <b>بوت أجيال المعرفة — محدّث</b>\n\n"
         "/status — تقرير فوري\n"
         "/restart &lt;خدمة&gt; — إعادة تشغيل خدمة\n"
         "/list — قائمة الخدمات\n"
         "/help — المساعدة")

    offset = get_offset()
    while True:
        try:
            data = api("getUpdates", {"offset": offset, "timeout": 30,
                                       "allowed_updates": ["message"]})
            for upd in data.get("result", []):
                offset = upd["update_id"] + 1
                save_offset(offset)
                msg  = upd.get("message", {})
                chat = str(msg.get("chat", {}).get("id", ""))
                text = msg.get("text", "").strip()

                if chat != CHAT_ID:
                    continue

                log(f"CMD from {chat}: {text}")

                if text.startswith("/status"):
                    send(chat, "⏳ جاري جمع البيانات...")
                    send(chat, get_status())

                elif text.startswith("/restart"):
                    parts = text.split(maxsplit=1)
                    if len(parts) < 2:
                        send(chat,
                             "⚠️ الاستخدام: <code>/restart &lt;اسم الخدمة&gt;</code>\n\n"
                             "مثال: <code>/restart auth</code>\n"
                             "أرسل /list لرؤية الخدمات المتاحة")
                    else:
                        do_restart(chat, parts[1])

                elif text.startswith("/list"):
                    send(chat, get_list())

                elif text.startswith("/help"):
                    send(chat,
                         "🤖 <b>أوامر بوت أجيال المعرفة</b>\n\n"
                         "/status — تقرير فوري عن حالة السيرفر\n"
                         "/restart &lt;خدمة&gt; — إعادة تشغيل خدمة\n"
                         "  مثال: <code>/restart auth</code>\n"
                         "/list — قائمة الخدمات المتاحة\n"
                         "/help — هذه القائمة\n\n"
                         "📌 التقرير اليومي: كل صباح 8:00\n"
                         "📌 التنبيهات: فورية عند أي مشكلة")

                else:
                    send(chat, "❓ أمر غير معروف. اكتب /help لقائمة الأوامر")

        except KeyboardInterrupt:
            log("Bot stopped by user")
            break
        except Exception as e:
            log(f"Error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
