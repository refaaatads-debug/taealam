import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface PublicPageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

const PublicPageHeader = ({ eyebrow, title, description, icon: Icon }: PublicPageHeaderProps) => (
  <section className="border-b border-[#102f50]/10 bg-[#f7f9f8]">
    <div className="mx-auto max-w-5xl px-5 py-14 text-center md:py-20">
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#188779]/20 bg-[#188779]/[0.07] px-3 py-1.5 text-[11px] font-black text-[#188779]">
          <Icon className="h-4 w-4" />
          {eyebrow}
        </div>
        <h1 className="text-3xl font-black tracking-tight text-[#102f50] md:text-5xl">{title}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#102f50]/60 md:text-base">{description}</p>
      </motion.div>
    </div>
  </section>
);

export default PublicPageHeader;