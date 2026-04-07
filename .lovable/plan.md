
## خطة بناء نظام WebRTC مخصص

### 1. جدول Signaling في قاعدة البيانات
- إنشاء جدول `webrtc_signals` لتبادل SDP offers/answers و ICE candidates عبر Supabase Realtime
- تفعيل Realtime على الجدول

### 2. صفحة الجلسة المباشرة (LiveSession.tsx)
- إعادة بناء الصفحة بالكامل بواجهة مخصصة تشمل:
  - عرض فيديو المعلم والطالب
  - أزرار تحكم (كتم الصوت، إيقاف الكاميرا، مشاركة الشاشة، إنهاء)
  - مؤقت الجلسة
  - شريط أدوات مخصص بالكامل

### 3. WebRTC Hook مخصص
- `useWebRTC` hook يدير:
  - إنشاء RTCPeerConnection
  - تبادل SDP عبر Supabase Realtime
  - إدارة ICE candidates
  - التسجيل المحلي (MediaRecorder API)
  - إعادة الاتصال التلقائي

### 4. التسجيل
- تسجيل محلي باستخدام MediaRecorder API
- رفع التسجيل إلى Supabase Storage بعد انتهاء الجلسة

### ⚠️ ملاحظة مهمة
- خوادم STUN المجانية تكفي لـ 80% من الحالات
- لضمان اتصال 100% (شبكات مقيدة)، ستحتاج خدمة TURN مثل Metered.ca (مجاني حتى 500GB/شهر)
- هل تريد المتابعة بدون TURN حالياً أم تريد إعداده؟
