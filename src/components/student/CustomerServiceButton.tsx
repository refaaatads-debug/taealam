import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function CustomerServiceButton() {
  const navigate = useNavigate();

  return (
    <Button
      onClick={() => navigate("/support")}
      className="fixed bottom-20 left-4 md:bottom-6 z-50 h-14 w-14 rounded-full gradient-cta shadow-button text-secondary-foreground"
      size="icon"
      title="تواصل مع خدمة العملاء"
    >
      <MessageCircle className="h-6 w-6" />
    </Button>
  );
}
