export default function HomeCitySubjects() {
  return (
    <section id="city-subjects" dir="rtl" aria-label="أدلة المواد والمدن" className="bg-white px-5 py-5 md:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-2xl bg-[#17344d] px-4 py-4 text-white md:px-7">
        <p className="text-xs leading-6 text-white/85 sm:text-sm">ابحث عن بداية مناسبة للمادة ومدينتك.</p>
        <a href="/tutoring/" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[#c5e5d8] px-4 py-3 text-[11px] font-extrabold text-[#17344d] transition hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30">أدلة المواد <span aria-hidden="true">←</span></a>
      </div>
    </section>
  );
}
