import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, CheckCircle2, Clock, BookOpen } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentName?: string;
}

export default function FirstImpressionDialog({ open, onOpenChange, studentName }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-secondary">
            <Sparkles className="h-5 w-5" />
            تذكير مهم: الانطباع الأول
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm leading-relaxed">
          <p className="text-foreground">
            <span className="font-bold text-primary">
              {studentName ? `الطالب ${studentName}` : "هذا الطالب"} يحجز معك للمرة الأولى.
            </span>
          </p>

          <div className="bg-secondary/5 border border-secondary/20 rounded-xl p-3">
            <p className="font-bold text-foreground mb-1">
              الانطباع الأول مهم.
            </p>
            <p className="text-muted-foreground text-xs">
              الجلسة الأولى تترك أثرًا دائمًا — كن إيجابيًا، مهنيًا، ولطيفًا. كل طالب هو عميل مهم،
              تصرّف باحتراف والتزام.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-bold text-foreground">كن جاهزًا قبل الجلسة:</p>
            <div className="flex items-start gap-2">
              <BookOpen className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                حدّد المادة أو الموضوع المطلوب
              </p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                راجع أي ملاحظات أو أهداف خاصة (مثل: امتحان قريب أو مهارة يحتاج دعم فيها)
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">ابدأ على الموعد تمامًا</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            className="w-full gradient-cta text-secondary-foreground"
            onClick={() => onOpenChange(false)}
          >
            موافق، فهمت
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
