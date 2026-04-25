interface Props {
  url: string;
  className?: string;
}

/** Inline audio player styled for chat bubbles. */
export default function VoicePlayer({ url, className }: Props) {
  return (
    <audio
      src={url}
      controls
      preload="metadata"
      className={`mt-2 w-full max-w-[260px] rounded-lg ${className || ""}`}
    >
      المتصفح لا يدعم تشغيل الصوت
    </audio>
  );
}
