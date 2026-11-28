import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface PersonAvatarProps {
  src?: string | null;
  name?: string | null;
  /** Size and shape classes, e.g. "h-9 w-9 rounded-xl". */
  className?: string;
  fallbackClassName?: string;
  iconClassName?: string;
}

/** Profile photo when avatar_url exists, otherwise the generic person icon. */
export default function PersonAvatar({ src, name, className, fallbackClassName, iconClassName }: PersonAvatarProps) {
  return (
    <Avatar className={cn("h-9 w-9", className)}>
      {src ? <AvatarImage src={src} alt={name || ""} className="object-cover" loading="lazy" /> : null}
      <AvatarFallback className={cn("bg-primary/10", className?.includes("rounded") ? "rounded-[inherit]" : "", fallbackClassName)}>
        <User className={cn("h-4 w-4 text-primary", iconClassName)} />
      </AvatarFallback>
    </Avatar>
  );
}
