import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function TeacherCustomerServiceButton() {
  const navigate = useNavigate();

  return (
    <Button
      onClick={() => navigate("/support")}
      className="fixed bottom-20 left-4 md:bottom-6 z-40 rounded-full w-14 h-14 shadow-lg gradient-cta text-secondary-foreground hover:scale-105 transition-transform"
      size="icon"
    >
      <MessageCircle className="h-6 w-6" />
    </Button>
  );
}
