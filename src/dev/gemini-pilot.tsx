import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceTutorPanel, type TutorState } from '../components/ai/VoiceTutorPanel';
import { createGeminiAudio, type GeminiAudio } from '../lib/geminiAudio';
import { connectGeminiPilot, type GeminiPilotTicket } from '../lib/geminiLivePilot';
import { supabase } from '../integrations/supabase/client';
import '../index.css';
import './gemini-pilot.css';

export function GeminiAdultPilot() {
  const [state, setState] = useState<TutorState>('idle');
  const [muted, setMuted] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState('معاينة محلية فقط. لم تبدأ أي جلسة مدفوعة.');
  const [seconds, setSeconds] = useState(0);
  const [userText, setUserText] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const audio = useRef<GeminiAudio>();
  const session = useRef<Awaited<ReturnType<typeof connectGeminiPilot>>>();
  const sequence = useRef(0);
  const started = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const deadline = useRef(0);
  const stop = useCallback(() => {
    sequence.current++; started.current = false;
    clearInterval(timer.current); timer.current = undefined;
    audio.current?.close(); audio.current = undefined;
    session.current?.stop(); session.current = undefined;
    setState('idle'); setMuted(false); setSeconds(0);
  }, []);
  useEffect(() => {
    const hidden = () => { if (document.hidden && started.current) { stop(); setMessage('انتهى الاختبار لأن الصفحة أصبحت في الخلفية.'); } };
    const leave = () => stop();
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', leave);
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', leave); stop(); };
  }, [stop]);
  const level = useCallback(() => audio.current?.level() ?? 0, []);
  const start = async () => {
    if (started.current || !accepted) return;
    started.current = true; const id = ++sequence.current; setState('connecting'); setMessage('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw Error('login_required');
      if (id !== sequence.current) return;
      const a = await createGeminiAudio(pcm => session.current?.sendPcm16(pcm), speaking => {
        if (id === sequence.current) setState(speaking ? 'speaking' : 'listening');
      }, () => { if (id === sequence.current) { stop(); setMessage('توقف الميكروفون أو إرسال الصوت. انتهى الاختبار.'); } });
      if (id !== sequence.current) { a.close(); return; } audio.current = a;
      const { data, error } = await supabase.functions.invoke('gemini-live-pilot', { body: {} });
      if (id !== sequence.current) return;
      if (error || !data?.allowed) throw Error(data?.reason_code || 'pilot_not_enabled');
      const ticket = data as GeminiPilotTicket; deadline.current = Date.parse(ticket.expiresAt);
      const s = await connectGeminiPilot(ticket, {
        onmessage: event => {
          if (id !== sequence.current) return;
          try {
            const content = event.serverContent;
            if (content?.interrupted) a.interrupt();
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) a.play(part.inlineData.data, part.inlineData.mimeType);
              if (part.text) setAssistantText(text => (text + part.text).slice(-2000));
            }
            if (content?.inputTranscription?.text) setUserText(text => (text + content.inputTranscription!.text).slice(-1000));
            if (content?.outputTranscription?.text) setAssistantText(text => (text + content.outputTranscription!.text).slice(-2000));
          } catch { stop(); setMessage('توقف الاختبار بسبب تنسيق صوت غير مدعوم.'); }
        },
        onclose: () => { if (id === sequence.current) { stop(); setMessage('انتهى الاختبار. لن نعيد الاتصال تلقائياً.'); } },
        onerror: () => { if (id === sequence.current) { stop(); setMessage('تعذر الاتصال. لن نحاول تلقائياً ولن نعيد حجز الوقت.'); } },
      });
      if (id !== sequence.current) { s.stop(); return; }
      session.current = s; setState('listening');
      timer.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)); setSeconds(remaining);
        if (!remaining) { stop(); setMessage('انتهى الوقت المحدد للاختبار.'); }
      }, 250);
    } catch (error) {
      if (id !== sequence.current) return;
      stop(); setMessage(error instanceof Error && error.message === 'login_required' ? 'سجّل الدخول بحساب الاختبار المعتمد أولاً. لا توجد جلسة مدفوعة.' : 'مسار الاختبار غير متاح أو غير مصرح به. لم تتم إعادة المحاولة.');
    }
  };
  return <main className="gemini-pilot-shell" dir="rtl">
    <div className="gemini-pilot-notice"><strong>Gemini Live · تجربة للبالغين فقط</strong><p>بيانات تجريبية غير شخصية. مخفية من الموقع والطلاب. لا تعمل إلا بتفعيل الخادم وقائمة الحسابات المعتمدة.</p></div>
    <VoiceTutorPanel state={state} getOutputVolume={level} userText={userText} assistantText={assistantText}>
      <div className="gemini-pilot-actions">
        <label><input type="checkbox" checked={accepted} disabled={state !== 'idle'} onChange={e => setAccepted(e.target.checked)} /> أنا بالغ وأستخدم بيانات وهمية فقط، وميزانية الاختبار معتمدة.</label>
        <div className="gemini-pilot-buttons">
          <button disabled={!accepted || state !== 'idle'} onClick={() => void start()}>بدء الاختبار المعتمد</button>
          <button disabled={state === 'idle'} onClick={() => { const value = !muted; audio.current?.setMuted(value); setMuted(value); }}>{muted ? 'تشغيل الميكروفون' : 'كتم الميكروفون'}</button>
          <button disabled={state === 'idle'} onClick={() => { stop(); setMessage('أغلقت الجلسة والميكروفون والصوت.'); }}>إنهاء</button>
        </div>
        {seconds > 0 && <p aria-live="off">المتبقي: {seconds} ثانية</p>}
        <p role="status">{message}</p>
      </div>
    </VoiceTutorPanel>
    <p className="gemini-pilot-footnote">عداد الصفحة لتحسين التجربة فقط. الحد الأمني على الخادم والرمز المؤقت. خصم الوقت محافظ وقد لا يُسترد عند فشل الاتصال.</p>
  </main>;
}
// This separate dev HTML is not in the production Vite build inputs or App routes.
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<GeminiAdultPilot />);
