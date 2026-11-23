import { useState } from "react";

const cities = [
  { id: "jeddah", name: "جدة" },
  { id: "riyadh", name: "الرياض" },
  { id: "dammam", name: "الدمام" },
  { id: "makkah", name: "مكة المكرمة" },
  { id: "madinah", name: "المدينة المنورة" },
  { id: "khobar", name: "الخبر" },
  { id: "taif", name: "الطائف" },
  { id: "abha", name: "أبها" },
  { id: "tabuk", name: "تبوك" },
  { id: "buraidah", name: "بريدة" },
];
const subjects = [
  { id: "math", name: "رياضيات", symbol: "x²", description: "من الأساسيات إلى الجبر والهندسة. حدد الدرس الذي تريد فهمه.", tone: "#e7f2ed" },
  { id: "english", name: "لغة إنجليزية", symbol: "Aa", description: "قراءة وقواعد وكتابة. ابدأ بالمهارة التي تحتاج إلى تطويرها.", tone: "#edf1f5" },
  { id: "physics", name: "فيزياء", symbol: "F", description: "افهم المفاهيم والوحدات، ورتب خطوات حل المسألة.", tone: "#f5efdf" },
];

// City discovery links to three shared, substantive subject guides.
export default function HomeCitySubjects() {
  const [active, setActive] = useState("jeddah");
  const [mode, setMode] = useState<"online" | "in_person">("online");
  return (
    <section id="city-subjects" dir="rtl" aria-labelledby="city-subjects-title" className="bg-white px-5 py-16 text-[#17344d] md:px-8 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><p className="text-xs font-extrabold tracking-[.12em] text-[#16776c]">بدايتك من المادة التي تحتاجها</p><h2 id="city-subjects-title" className="mt-4 text-3xl font-black leading-tight md:text-4xl">دروس خصوصية لطلاب مدينتك</h2><p className="mt-4 max-w-2xl text-sm leading-8 text-[#17344d]/65">اختر مدينتك، ثم المادة. تعرّف على ما يساعدك في اختيار الدرس قبل الانتقال إلى البحث عن مدرس.</p></div>
          <a href="/search" className="inline-flex min-h-11 shrink-0 items-center gap-3 self-start text-xs font-extrabold text-[#16776c] md:self-auto">ابحث عن مدرس <span aria-hidden="true">←</span></a>
        </div>
        <div className="mt-6 flex gap-2" aria-label="نوع الدرس">
          <button type="button" aria-pressed={mode === "online"} onClick={() => setMode("online")} className={`min-h-11 rounded-xl border px-5 text-xs font-extrabold ${mode === "online" ? "border-[#16776c] bg-[#16776c] text-white" : "border-[#17344d]/15"}`}>أونلاين</button>
          <button type="button" aria-pressed={mode === "in_person"} onClick={() => setMode("in_person")} className={`min-h-11 rounded-xl border px-5 text-xs font-extrabold ${mode === "in_person" ? "border-[#16776c] bg-[#16776c] text-white" : "border-[#17344d]/15"}`}>حضوري <span className="mr-2 text-[9px] opacity-70">بحسب التغطية</span></button>
        </div>
        <div role="tablist" aria-label="اختر مدينة الطالب" className="mt-8 flex max-w-full flex-wrap gap-1 rounded-2xl border border-[#17344d]/[.08] bg-[#f4f7f6] p-1.5">
          {cities.map((city, index) => <button key={city.id} id={`city-tab-${city.id}`} type="button" role="tab" aria-selected={active === city.id} aria-controls={`city-panel-${city.id}`} tabIndex={active === city.id ? 0 : -1} onClick={() => setActive(city.id)} onKeyDown={(event) => { const change = event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0; if (change) { event.preventDefault(); const next = cities[(index + change + cities.length) % cities.length]; setActive(next.id); document.getElementById(`city-tab-${next.id}`)?.focus(); } }} className={`min-h-11 min-w-[84px] rounded-xl px-5 py-2.5 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#16776c]/25 sm:min-w-[110px] ${active === city.id ? "bg-[#16776c] text-white shadow-sm" : "text-[#17344d]/60 hover:bg-white"}`}>{city.name}</button>)}
        </div>
        {cities.map((city) => <div key={city.id} id={`city-panel-${city.id}`} role="tabpanel" aria-labelledby={`city-tab-${city.id}`} hidden={active !== city.id} className="mt-6">
          {mode === "in_person" && <div className="mb-5 rounded-2xl border border-[#16776c]/15 bg-[#edf5f0] p-5">
            <h3 className="text-sm font-extrabold">الحضوري في {city.name}: تحقق من التغطية</h3>
            <p className="mt-2 text-xs leading-7 text-[#17344d]/65">التوفر يعتمد على تفعيل المدينة وعنوانك والمادة والمرحلة والموعد. بعد الدخول كطالب اختر «حضوري» في البحث؛ إذا لم يظهر مدرس مناسب فلن تُرسل طلبًا من البحث وحده.</p>
            <a className="mt-3 inline-flex min-h-11 items-center text-xs font-extrabold text-[#16776c]" href="/login">تحقق من التغطية بعد الدخول ←</a>
            <a className="mr-4 inline-flex min-h-11 items-center text-xs font-extrabold text-[#16776c]" href="/tutoring/dammam/in-person/">كيف يعمل طلب الحضوري؟ ←</a>
          </div>}
          <div className="grid gap-4 md:grid-cols-3">
            {subjects.map((subject) => <a key={subject.id} href={`/tutoring/${subject.id}/`} className="group block rounded-[1.35rem] border border-[#17344d]/10 bg-[#fffefa] p-6 transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-30px_rgba(23,52,77,.45)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#16776c]/25">
              <div className="flex items-center justify-between"><span aria-hidden="true" style={{ backgroundColor: subject.tone }} className="flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-extrabold text-[#16776c]">{subject.symbol}</span><span className="text-[10px] font-bold text-[#17344d]/45">{mode === "online" ? "أونلاين" : "دليل المادة"} · {city.name}</span></div>
              <h3 className="mt-6 text-lg font-black">{subject.name} لطلاب {city.name}</h3><p className="mt-2 text-xs leading-7 text-[#17344d]/65">{subject.description}</p><span className="mt-5 flex items-center justify-between border-t border-[#17344d]/[.08] pt-4 text-xs font-extrabold text-[#16776c]">تعرّف على الدروس <span aria-hidden="true">←</span></span>
            </a>)}
          </div>
        </div>)}
        <p className="mt-5 text-[11px] leading-6 text-[#17344d]/55">تغطية الحضوري تختلف حسب المدينة والمادة والعنوان والموعد. لا يؤكد اختيار المدينة توفر مدرس أو قبول حجز.</p>
      </div>
    </section>
  );
}
