import { MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface TeacherInPersonSettingsProps {
  isAdminApproved: boolean;
  isInPersonEnabled: boolean;
  serviceRadius: number | "";
  saving?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onServiceRadiusChange: (radius: number | "") => void;
  onSave: () => void;
  className?: string;
}

const TeacherInPersonSettings = ({
  isAdminApproved,
  isInPersonEnabled,
  serviceRadius,
  saving = false,
  onEnabledChange,
  onServiceRadiusChange,
  onSave,
  className = "",
}: TeacherInPersonSettingsProps) => (
  <Card dir="rtl" className={`border-0 shadow-card ${className}`} data-testid="teacher-in-person-settings">
    <CardHeader className="pb-4">
      <CardTitle className="flex items-center gap-2 text-lg">
        <MapPin className="h-5 w-5 text-secondary" aria-hidden="true" />
        التدريس الحضوري
      </CardTitle>
      <p className="text-sm leading-relaxed text-muted-foreground">
        حدّد ما إذا كنت تستقبل حصصاً حضورية ونطاق الخدمة الذي تغطيه.
      </p>
    </CardHeader>
    <CardContent className="space-y-5">
      {!isAdminApproved && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300/50 bg-amber-50/60 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100" role="status" data-testid="teacher-in-person-approval-notice">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="text-sm">يتاح تفعيل التدريس الحضوري بعد اعتماد الحساب من الإدارة.</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-4">
        <div>
          <Label htmlFor="teacher-in-person-enabled" className="font-semibold">استقبال حصص حضورية</Label>
          <p className="mt-1 text-xs text-muted-foreground">عند التفعيل، يظهر خيار الحضور للطلاب بحسب توفره.</p>
        </div>
        <Switch
          id="teacher-in-person-enabled"
          checked={isInPersonEnabled}
          onCheckedChange={onEnabledChange}
          disabled={!isAdminApproved || saving}
          data-testid="teacher-in-person-enabled"
          aria-label="تفعيل استقبال الحصص الحضورية"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="teacher-service-radius">نطاق الخدمة</Label>
        <div className="flex items-center gap-2">
          <Input
            id="teacher-service-radius"
            type="number"
            min="0"
            inputMode="numeric"
            value={serviceRadius}
            onChange={(event) => onServiceRadiusChange(event.target.value === "" ? "" : Number(event.target.value))}
            disabled={!isAdminApproved || !isInPersonEnabled || saving}
            className="max-w-40 rounded-xl"
            dir="ltr"
            data-testid="teacher-service-radius"
          />
          <span className="text-sm text-muted-foreground">كم</span>
        </div>
      </div>

      <Button type="button" onClick={onSave} disabled={saving || !isAdminApproved} className="rounded-xl" data-testid="teacher-in-person-save">
        {saving ? "جارٍ الحفظ…" : "حفظ إعدادات الحضور"}
      </Button>
    </CardContent>
  </Card>
);

export default TeacherInPersonSettings;
