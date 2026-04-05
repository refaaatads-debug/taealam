import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function CustomerServiceButton() {
  const handleContact = () => {
    // Open WhatsApp or show contact info
    const message = encodeURIComponent("مرحباً، أحتاج مساعدة من خدمة العملاء");
    const whatsappUrl = `https://wa.me/?text=${message}`;
    window.open(whatsappUrl, "_blank");
    toast.info("جاري فتح خدمة العملاء...");
  };

  return (
    <Button
      onClick={handleContact}
      className="fixed bottom-20 left-4 md:bottom-6 z-50 h-14 w-14 rounded-full gradient-cta shadow-button text-secondary-foreground"
      size="icon"
      title="تواصل مع خدمة العملاء"
    >
      <MessageCircle className="h-6 w-6" />
    </Button>
  );
}
