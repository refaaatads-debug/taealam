import { motion } from "framer-motion";
import brandLogo from "@/assets/logo.png";

interface Props {
  text?: string;
  size?: number;
}

export default function BrandLoader({ text = "جاري التحميل...", size = 80 }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <motion.div
        className="relative"
        style={{ width: size, height: size }}
        animate={{ rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      >
        <motion.img
          src={brandLogo}
          alt="logo"
          className="w-full h-full object-contain drop-shadow-lg"
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
      {text && (
        <motion.p
          className="text-sm font-bold text-muted-foreground"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}
