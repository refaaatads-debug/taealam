#!/usr/bin/env python3
"""
بوت Telegram — أجيال المعرفة
يستجيب للأوامر:
  /status  — تقرير فوري
  /help    — قائمة الأوامر
"""
import subprocess, time, json, urllib.request, urllib.parse, os, sys

BOT_TOKEN = "8910464486:AAH9liMJXDXMrw7hTuzcVqfmknkezfOkXYA"
CHAT_ID   = "7408215367"
API       = f"https://api.telegram.org/bot{BOT_TOKEN}"
LOG       = "/var/log/ajyal-bot.log"
OFFSET_F  = "/var/lib/ajyal-monitor/bot_offset"

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

def run(cmd, timeout=10):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True,
                           text=True, timeout=timeout)
        return r.stdout.strip() or r.stderr.strip()
    except Exception as e:
        return str(e)

def get_status():
    now = time.strftime("%Y-%m-%d %H:%M")

    # Docker
    running = run("docker ps --format '{{.Names}}' | wc -l")
    total   = run("docker ps -a --format '{{.Names}}' | wc -l")
    unhealthy = run("docker ps --format '{{.Status}}' | grep -c unhealthy || true")
    stopped = str(int(total) - int(running)) if running.isdigit() and total.isdigit() else "?"
    d_icon = "✅" if stopped == "0" and unhealthy == "0" else ("⚠️" if unhealthy != "0" else "🔴")

    # RAM
    ram_total = int(run("grep MemTotal /proc/meminfo | tr -s ' ' | cut -d' ' -f2") or 1)
    ram_avail = int(run("grep MemAvailable /proc/meminfo | tr -s ' ' | cut -d' ' -f2") or 0)
    ram_pct   = (ram_total - ram_avail) * 100 // ram_total
    ram_used_gb = round((ram_total - ram_avail) / 1048576, 1)
    ram_total_gb = round(ram_total / 1048576, 1)
    ram_icon = "✅" if ram_pct < 80 else ("⚠️" if ram_pct < 90 else "🔴")

    # Disk
    disk_pct = run("df / | tail -1 | tr -s ' ' | cut -d' ' -f5 | tr -d '%'")
    disk_used = run("df -h / | tail -1 | tr -s ' ' | cut -d' ' -f3")
    disk_total = run("df -h / | tail -1 | tr -s ' ' | cut -d' ' -f2")
    disk_icon = "✅" if disk_pct.isdigit() and int(disk_pct) < 75 else ("⚠️" if disk_pct.isdigit() and int(disk_pct) < 85 else "🔴")

    # Nginx
    nginx = run("systemctl is-active nginx")
    nginx_icon = "✅" if nginx == "active" else "🔴"

    # Site
    http_code = run("curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://ajyalalmaerifa.com/")
    resp_time = run("curl -s -o /dev/null -w '%{time_total}' --max-time 8 https://ajyalalmaerifa.com/")
    site_icon = "✅" if http_code == "200" else "🔴"

    # Kong
    kong = run("curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:8000/rest/v1/")
    kong_icon = "✅" if kong in ("200", "401") else "🔴"

    # SSL
    ssl_days = run(
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

    # Load / Uptime
    load = run("cat /proc/loadavg | cut -d' ' -f1-3")
    uptime = run("awk '{print int($1/86400)\"d \"int(($1%86400)/3600)\"h\"}' /proc/uptime")

    # Nginx errors today
    today = time.strftime("%Y/%m/%d")
    err_count = run(f"grep '{today}' /var/log/nginx/error.log 2>/dev/null | grep -c '\\[error\\]' || echo 0")

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
    send(CHAT_ID, "🤖 <b>بوت أجيال المعرفة</b> بدأ العمل\nاكتب /status للحصول على تقرير فوري")

    offset = get_offset()
    while True:
        try:
            data = api("getUpdates", {"offset": offset, "timeout": 30, "allowed_updates": ["message"]})
            for upd in data.get("result", []):
                offset = upd["update_id"] + 1
                save_offset(offset)
                msg  = upd.get("message", {})
                chat = str(msg.get("chat", {}).get("id", ""))
                text = msg.get("text", "").strip()

                # قبول فقط من صاحب الحساب
                if chat != CHAT_ID:
                    continue

                log(f"Command: {text}")

                if text.startswith("/status"):
                    send(chat, "⏳ جاري جمع البيانات...")
                    report = get_status()
                    send(chat, report)

                elif text.startswith("/help"):
                    send(chat, """🤖 <b>أوامر بوت أجيال المعرفة</b>

/status — تقرير فوري عن حالة السيرفر
/help   — قائمة الأوامر

📌 التقرير اليومي يصل تلقائياً كل صباح الساعة 8:00
📌 التنبيهات الفورية تصل عند وقوع أي مشكلة""")

                else:
                    send(chat, "❓ أمر غير معروف. اكتب /help لقائمة الأوامر")

        except KeyboardInterrupt:
            log("Bot stopped")
            break
        except Exception as e:
            log(f"Error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
