#!/bin/bash
# =======================================================
# تقرير يومي — أجيال المعرفة
# يُرسل كل صباح الساعة 8:00 على Telegram
# =======================================================
BOT_TOKEN="8910464486:AAH9liMJXDXMrw7hTuzcVqfmknkezfOkXYA"
CHAT_ID="7408215367"

send_msg() {
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d "chat_id=${CHAT_ID}" \
        --data-urlencode "text=$1" \
        -d "parse_mode=HTML" \
        --max-time 15 > /dev/null
}

TODAY=$(date "+%Y-%m-%d")
NOW=$(date "+%H:%M")

# ---- Docker ----
TOTAL_CONTAINERS=$(docker ps -a --format '{{.Names}}' | wc -l)
RUNNING=$(docker ps --format '{{.Names}}' | wc -l)
UNHEALTHY=$(docker ps --format '{{.Names}} {{.Status}}' | grep -c "unhealthy" || true)
STOPPED=$(( TOTAL_CONTAINERS - RUNNING ))

DOCKER_ICON="✅"
[ "$STOPPED" -gt 0 ] && DOCKER_ICON="🔴"
[ "$UNHEALTHY" -gt 0 ] && DOCKER_ICON="⚠️"

# ---- RAM ----
RAM_TOTAL=$(grep MemTotal /proc/meminfo | tr -s ' ' | cut -d' ' -f2)
RAM_AVAIL=$(grep MemAvailable /proc/meminfo | tr -s ' ' | cut -d' ' -f2)
RAM_USED_KB=$(( RAM_TOTAL - RAM_AVAIL ))
RAM_PCT=$(( RAM_USED_KB * 100 / RAM_TOTAL ))
RAM_USED_GB=$(echo "scale=1; $RAM_USED_KB / 1048576" | bc)
RAM_TOTAL_GB=$(echo "scale=1; $RAM_TOTAL / 1048576" | bc)

RAM_ICON="✅"
[ "$RAM_PCT" -ge 80 ] && RAM_ICON="⚠️"
[ "$RAM_PCT" -ge 90 ] && RAM_ICON="🔴"

# ---- Disk ----
DISK_PCT=$(df / | tail -1 | tr -s ' ' | cut -d' ' -f5 | tr -d '%')
DISK_USED=$(df -h / | tail -1 | tr -s ' ' | cut -d' ' -f3)
DISK_TOTAL=$(df -h / | tail -1 | tr -s ' ' | cut -d' ' -f2)

DISK_ICON="✅"
[ "$DISK_PCT" -ge 75 ] && DISK_ICON="⚠️"
[ "$DISK_PCT" -ge 85 ] && DISK_ICON="🔴"

# ---- Nginx ----
NGINX_STATUS=$(systemctl is-active nginx)
NGINX_ICON="✅"
[ "$NGINX_STATUS" != "active" ] && NGINX_ICON="🔴"

# ---- Site ----
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://ajyalalmaerifa.com/ 2>/dev/null)
SITE_ICON="✅"
[ "$HTTP_CODE" != "200" ] && SITE_ICON="🔴"
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 https://ajyalalmaerifa.com/ 2>/dev/null)

# ---- SSL ----
SSL_EXPIRY=$(echo | openssl s_client -servername ajyalalmaerifa.com \
    -connect ajyalalmaerifa.com:443 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null \
    | cut -d= -f2)
SSL_DAYS=""
if [ -n "$SSL_EXPIRY" ]; then
    SSL_EPOCH=$(date -d "$SSL_EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$SSL_EXPIRY" +%s 2>/dev/null)
    NOW_EPOCH=$(date +%s)
    SSL_DAYS=$(( (SSL_EPOCH - NOW_EPOCH) / 86400 ))
fi
SSL_ICON="✅"
[ -n "$SSL_DAYS" ] && [ "$SSL_DAYS" -le 14 ] && SSL_ICON="⚠️"
[ -n "$SSL_DAYS" ] && [ "$SSL_DAYS" -le 7 ] && SSL_ICON="🔴"

# ---- Load Average ----
LOAD=$(cat /proc/loadavg | cut -d' ' -f1-3)
UPTIME_DAYS=$(awk '{print int($1/86400)"d "int(($1%86400)/3600)"h"}' /proc/uptime)

# ---- Kong ----
KONG_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:8000/rest/v1/ 2>/dev/null)
KONG_ICON="✅"
[ "$KONG_CODE" != "401" ] && [ "$KONG_CODE" != "200" ] && KONG_ICON="🔴"

# ---- آخر أخطاء في nginx (24 ساعة) ----
NGINX_ERRORS=$(grep "$(date '+%Y/%m/%d')" /var/log/nginx/error.log 2>/dev/null | grep -c "\[error\]" || echo 0)

# ---- بناء الرسالة ----
MSG="📊 <b>التقرير اليومي — أجيال المعرفة</b>
📅 ${TODAY} | 🕐 ${NOW}
━━━━━━━━━━━━━━━━━━━━

🐳 <b>Docker Containers</b>
${DOCKER_ICON} يعمل: ${RUNNING} | متوقف: ${STOPPED} | غير صحي: ${UNHEALTHY}

🌐 <b>الموقع</b>
${SITE_ICON} HTTP: ${HTTP_CODE} | سرعة الاستجابة: ${RESPONSE_TIME}s

⚙️ <b>Nginx</b>
${NGINX_ICON} الحالة: ${NGINX_STATUS} | أخطاء اليوم: ${NGINX_ERRORS}

🔀 <b>Kong API</b>
${KONG_ICON} HTTP: ${KONG_CODE}

💾 <b>RAM</b>
${RAM_ICON} ${RAM_USED_GB}GB / ${RAM_TOTAL_GB}GB (${RAM_PCT}%)

💿 <b>القرص</b>
${DISK_ICON} ${DISK_USED} / ${DISK_TOTAL} (${DISK_PCT}%)

🔒 <b>شهادة SSL</b>
${SSL_ICON} تنتهي بعد: ${SSL_DAYS:-؟} يوم

⚡ <b>الخادم</b>
🔄 التشغيل: ${UPTIME_DAYS}
📈 Load: ${LOAD}
━━━━━━━━━━━━━━━━━━━━
🤖 نظام المراقبة التلقائي"

send_msg "$MSG"
echo "[$( date '+%Y-%m-%d %H:%M:%S')] Daily report sent" >> /var/log/ajyal-monitor.log
