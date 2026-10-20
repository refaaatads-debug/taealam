import { MapPin, Monitor, Navigation } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SessionMode = "online" | "in_person";

export interface StudentAddress {
  city: string;
  district: string;
  streetAddress: string;
  additionalDetails: string;
}

interface StudentSessionChoiceProps {
  mode: SessionMode;
  address: StudentAddress;
  onModeChange: (mode: SessionMode) => void;
  onAddressChange: (address: StudentAddress) => void;
  inPersonAvailable?: boolean;
  inPersonUnavailableReason?: string;
  className?: string;
}

const StudentSessionChoice = ({
  mode,
  address,
  onModeChange,
  onAddressChange,
  inPersonAvailable = true,
  inPersonUnavailableReason,
  className = "",
}: StudentSessionChoiceProps) => {
  const updateAddress = (field: keyof StudentAddress, value: string) => {
    onAddressChange({ ...address, [field]: value });
  };

  return (
    <section dir="rtl" className={`space-y-4 ${className}`} data-testid="student-session-choice">
      <div>
        <h2 className="text-base font-bold text-foreground">طريقة الحصة</h2>
        <p className="mt-1 text-sm text-muted-foreground">اختر طريقة تقديم الحصة المناسبة لك.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="طريقة الحصة">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "online"}
          onClick={() => onModeChange("online")}
          data-testid="session-mode-online"
          className={`flex min-h-24 items-start gap-3 rounded-xl border p-4 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            mode === "online" ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Monitor className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-bold text-foreground">عن بُعد</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">تُعقد الحصة عبر الإنترنت.</span>
          </span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={mode === "in_person"}
          disabled={!inPersonAvailable}
          onClick={() => onModeChange("in_person")}
          data-testid="session-mode-in-person"
          aria-describedby={!inPersonAvailable && inPersonUnavailableReason ? "in-person-unavailable-reason" : undefined}
          className={`flex min-h-24 items-start gap-3 rounded-xl border p-4 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 ${
            mode === "in_person" ? "border-secondary bg-secondary/5" : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-bold text-foreground">حضوري</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">يلتقي الطالب والمعلم حضورياً.</span>
          </span>
        </button>
      </div>

      {!inPersonAvailable && inPersonUnavailableReason && (
        <p id="in-person-unavailable-reason" className="text-sm text-muted-foreground" data-testid="in-person-unavailable-reason">
          {inPersonUnavailableReason}
        </p>
      )}

      {mode === "in_person" && inPersonAvailable && (
        <Card className="border-border/70 shadow-none" data-testid="student-address-form">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Navigation className="h-4 w-4 text-secondary" aria-hidden="true" />
              عنوان الحصة
            </CardTitle>
            <p className="text-sm text-muted-foreground">أدخل موقع اللقاء لتسهيل تنسيق الحصة الحضورية.</p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="student-address-city">المدينة</Label>
              <Input id="student-address-city" value={address.city} onChange={(event) => updateAddress("city", event.target.value)} autoComplete="address-level2" data-testid="student-address-city" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="student-address-district">الحي</Label>
              <Input id="student-address-district" value={address.district} onChange={(event) => updateAddress("district", event.target.value)} autoComplete="address-level3" data-testid="student-address-district" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="student-address-street">الشارع والعنوان</Label>
              <Input id="student-address-street" value={address.streetAddress} onChange={(event) => updateAddress("streetAddress", event.target.value)} autoComplete="street-address" data-testid="student-address-street" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="student-address-details">تفاصيل إضافية <span className="font-normal text-muted-foreground">(اختياري)</span></Label>
              <Input id="student-address-details" value={address.additionalDetails} onChange={(event) => updateAddress("additionalDetails", event.target.value)} data-testid="student-address-details" />
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
};

export default StudentSessionChoice;
