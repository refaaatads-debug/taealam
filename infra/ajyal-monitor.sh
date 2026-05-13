#!/bin/bash
# =======================================================
# نظام مراقبة أجيال المعرفة — Telegram Alerts
# المسار: /usr/local/bin/ajyal-monitor.sh
# التشغيل: كل 5 دقائق عبر cron
# =======================================================
BOT_TOKEN="8910464486:AAH9liMJXDXMrw7hTuzcVqfmknkezfOkXYA"
CHAT_ID="7408215367"
RAM_THRESHOLD=90
DISK_THRESHOLD=85
STATE_DIR="/var/lib/ajyal-monitor"
mkdir -p "$STATE_DIR"
NOW=$(date "+%Y-%m-%d %H:%M")

send_alert() {
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d "chat_id=${CHAT_ID}" \
        --data-urlencode "text=$1" \
        -d "parse_mode=HTML" \
        --max-time 10 > /dev/null
}
alert_once() {
    local key="$1" msg="$2"
    local f="${STATE_DIR}/${key}.alerted"
    [ ! -f "$f" ] && send_alert "$msg" && touch "$f"
}
resolve_once() {
    local key="$1" msg="$2"
    local f="${STATE_DIR}/${key}.alerted"
    [ -f "$f" ] && send_alert "$msg" && rm -f "$f"
}

# ---- 1. Docker containers ----
CONTAINERS=(
    "supabase-kong" "supabase-auth" "supabase-rest"
    "supabase-storage" "dfb4189dc98c_supabase-db"
    "realtime-dev.supabase-realtime" "supabase-studio"
    "supabase-meta" "supabase-pooler" "supabase-edge-functions"
    "supabase-analytics" "supabase-imgproxy" "supabase-vector"
)
for container in "${CONTAINERS[@]}"; do
    key=$(echo "$container" | sed 's/[^a-zA-Z0-9]/_/g')
    STATUS=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
    if [ "$STATUS" != "running" ]; then
        alert_once "docker_${key}" "🔴 اجيال المعرفة
Container متوقف: ${container}
الحالة: ${STATUS:-غير موجود}
🕐 ${NOW}"
    else
        HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}ok{{end}}' "$container" 2>/dev/null)
        if [ "$HEALTH" = "unhealthy" ]; then
            alert_once "health_${key}" "⚠️ اجيال المعرفة
Container غير صحي: ${container}
🕐 ${NOW}"
        else
            resolve_once "docker_${key}" "✅ اجيال المعرفة - استعادة
Container عاد للعمل: ${container}
🕐 ${NOW}"
            resolve_once "health_${key}" "✅ اجيال المعرفة - استعادة
Container اصبح صحيا: ${container}
🕐 ${NOW}"
        fi
    fi
done

# ---- 2. Nginx ----
if ! systemctl is-active --quiet nginx; then
    alert_once "nginx_down" "🔴 اجيال المعرفة
Nginx متوقف!
🕐 ${NOW}"
else
    resolve_once "nginx_down" "✅ اجيال المعرفة - استعادة
Nginx يعمل بشكل طبيعي
🕐 ${NOW}"
fi

# ---- 3. استجابة الموقع ----
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://ajyalalmaerifa.com/ 2>/dev/null)
if [ "$HTTP_CODE" != "200" ]; then
    alert_once "site_down" "🔴 اجيال المعرفة - الموقع لا يستجيب
HTTP Code: ${HTTP_CODE}
https://ajyalalmaerifa.com
🕐 ${NOW}"
else
    resolve_once "site_down" "✅ اجيال المعرفة - الموقع يعمل
يستجيب بشكل طبيعي
🕐 ${NOW}"
fi

# ---- 4. RAM (بدون awk) ----
RAM_TOTAL=$(grep MemTotal /proc/meminfo | tr -s ' ' | cut -d' ' -f2)
RAM_AVAIL=$(grep MemAvailable /proc/meminfo | tr -s ' ' | cut -d' ' -f2)
if [ -n "$RAM_TOTAL" ] && [ "$RAM_TOTAL" -gt 0 ]; then
    RAM_USED=$(( (RAM_TOTAL - RAM_AVAIL) * 100 / RAM_TOTAL ))
    if [ "$RAM_USED" -ge "$RAM_THRESHOLD" ]; then
        alert_once "ram_high" "⚠️ اجيال المعرفة - RAM مرتفع
الاستخدام: ${RAM_USED}% (الحد: ${RAM_THRESHOLD}%)
🕐 ${NOW}"
    else
        resolve_once "ram_high" "✅ اجيال المعرفة - RAM طبيعي
الاستخدام: ${RAM_USED}%
🕐 ${NOW}"
    fi
fi

# ---- 5. Disk ----
DISK_USED=$(df / | tail -1 | tr -s ' ' | cut -d' ' -f5 | tr -d '%')
if [ -n "$DISK_USED" ] && [ "$DISK_USED" -ge "$DISK_THRESHOLD" ]; then
    alert_once "disk_high" "⚠️ اجيال المعرفة - مساحة القرص منخفضة
الاستخدام: ${DISK_USED}% (الحد: ${DISK_THRESHOLD}%)
🕐 ${NOW}"
else
    resolve_once "disk_high" "✅ اجيال المعرفة - Disk طبيعي
الاستخدام: ${DISK_USED:-?}%
🕐 ${NOW}"
fi

# ---- 6. Kong API ----
KONG_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:8000/rest/v1/ 2>/dev/null)
if [ "$KONG_CODE" != "401" ] && [ "$KONG_CODE" != "200" ]; then
    alert_once "kong_down" "🔴 اجيال المعرفة - Kong API لا يستجيب
HTTP Code: ${KONG_CODE}
🕐 ${NOW}"
else
    resolve_once "kong_down" "✅ اجيال المعرفة - Kong API يعمل
يستجيب على البورت 8000
🕐 ${NOW}"
fi

exit 0
