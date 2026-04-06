import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function TeacherCustomerServiceButton() {
  const handleClick = () => {
    toast.info("سيتم التواصل مع خدمة العملاء قريباً. يرجى إرسال استفسارك عبر البريد الإلكتروني: support@taealam.com");
  };

  return (
    <Button
      onClick={handleClick}
      className="fixed bottom-20 left-4 md:bottom-6 z-40 rounded-full w-14 h-14 shadow-lg gradient-cta text-secondary-foreground hover:scale-105 transition-transform"
      size="icon"
    >
      <MessageCircle className="h-6 w-6" />
    </Button>
  );
}
