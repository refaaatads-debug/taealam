import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  groupSupportTransferAgents,
  type SupportTransferAgent,
} from "@/lib/supportDepartments";

export interface SupportTransferTarget extends SupportTransferAgent {
  department_label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: SupportTransferAgent[];
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  target: SupportTransferTarget | null;
  onTargetChange: (target: SupportTransferTarget | null) => void;
  note: string;
  onNoteChange: (note: string) => void;
  transferring: boolean;
  onConfirm: () => void;
}

const initials = (name?: string) =>
  (name || "?").trim().split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export default function SupportTransferDialog({
  open,
  onOpenChange,
  agents,
  loading,
  loadError,
  onRetry,
  target,
  onTargetChange,
  note,
  onNoteChange,
  transferring,
  onConfirm,
}: Props) {
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const groups = useMemo(() => groupSupportTransferAgents(agents), [agents]);
  const selectedGroup = groups.find((group) => group.key === selectedDepartment);
  const visibleAgents = useMemo(() => {
    const searchTerm = search.trim().toLocaleLowerCase();
    return (selectedGroup?.agents ?? []).filter((agent) =>
      !searchTerm || (agent.full_name || "").toLocaleLowerCase().includes(searchTerm),
    );
  }, [search, selectedGroup]);

  useEffect(() => {
    if (!open) {
      setSelectedDepartment(null);
      setSearch("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            تحويل المحادثة لموظف آخر
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            اختر قسماً وموظفاً مخوّلاً، ثم أكّد تحويل المحادثة.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!target ? (
            <>
              {loading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  جاري تحميل أقسام وموظفي الدعم...
                </div>
              ) : loadError ? (
                <div className="space-y-3 py-5 text-center">
                  <p className="text-sm text-destructive">
                    تعذر تحميل قائمة موظفي الدعم. تحقق من تحديث صلاحيات الأقسام وحاول مجدداً.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="retry-load-support-agents"
                    onClick={onRetry}
                  >
                    <RefreshCw className="ml-2 h-4 w-4" /> إعادة المحاولة
                  </Button>
                </div>
              ) : selectedDepartment === null ? (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {groups.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      data-testid={`transfer-department-${group.key}`}
                      onClick={() => {
                        setSelectedDepartment(group.key);
                        setSearch("");
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border p-3 text-right transition-colors hover:bg-muted/50"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <FolderOpen className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold">{group.label}</span>
                        <span className="block text-xs text-muted-foreground">{group.agents.length} موظف</span>
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                  {groups.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      لا يوجد موظفو دعم آخرون متاحون للتحويل.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-testid="back-to-transfer-departments"
                      onClick={() => {
                        setSelectedDepartment(null);
                        setSearch("");
                      }}
                    >
                      <ArrowRight className="ml-1 h-4 w-4" /> الأقسام
                    </Button>
                    <span className="text-sm font-bold">{selectedGroup?.label}</span>
                  </div>
                  <div className="relative">
                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      data-testid="transfer-agent-search"
                      className="rounded-xl pr-8"
                      placeholder="ابحث باسم الموظف..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <div className="max-h-52 space-y-1 overflow-y-auto">
                    {visibleAgents.map((agent) => (
                      <button
                        key={agent.user_id}
                        type="button"
                        data-testid={`transfer-agent-${agent.user_id}`}
                        onClick={() => onTargetChange({
                          ...agent,
                          department_label: selectedGroup?.label || "",
                        })}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right transition-colors hover:bg-muted"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                            {initials(agent.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{agent.full_name || "بدون اسم"}</span>
                      </button>
                    ))}
                    {visibleAgents.length === 0 && (
                      <p className="py-5 text-center text-xs text-muted-foreground">
                        {search ? "لا يوجد موظفون مطابقون في هذا القسم." : "لا يوجد موظفون في هذا القسم."}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/15 font-bold text-primary">
                    {initials(target.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground">سيستلمها · {target.department_label}</p>
                  <p className="truncate text-sm font-bold">{target.full_name}</p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  data-testid="clear-support-transfer-target"
                  onClick={() => onTargetChange(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-foreground">
                  ملاحظة للموظف الجديد (اختياري)
                </label>
                <textarea
                  data-testid="support-transfer-note"
                  className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="مثال: العميل يحتاج متابعة استرداد المبلغ، تواصلت معه مسبقاً..."
                  value={note}
                  onChange={(event) => onNoteChange(event.target.value)}
                  maxLength={500}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {note.length}/500 — ستظهر هذه الملاحظة كرسالة داخل المحادثة.
                </p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            data-testid="cancel-support-transfer"
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            data-testid="confirm-support-transfer"
            disabled={!target || transferring}
            onClick={onConfirm}
            className="gap-1"
          >
            {transferring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <><ArrowLeftRight className="h-4 w-4" /> تأكيد التحويل</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
