import { Check, MapPin, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type InPersonApprovalStatus = "pending" | "approved" | "rejected";

interface AdminInPersonApprovalProps {
  teacherName: string;
  city?: string | null;
  serviceRadius?: number | null;
  status: InPersonApprovalStatus;
  saving?: boolean;
  onApprove: () => void;
  onReject: () => void;
  className?: string;
}

const statusLabels: Record<InPersonApprovalStatus, string> = {
  pending: "بانتظار المراجعة",
  approved: "معتمد",
  rejected: "غير معتمد",
};

const AdminInPersonApproval = ({
  teacherName,
  city,
  serviceRadius,
  status,
  saving = false,
  onApprove,
  onReject,
  className = "",
}: AdminInPersonApprovalProps) => (
  <Card dir="rtl" className={`border-border/70 shadow-none ${className}`} data-testid="admin-in-person-approval">
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
      <div>
        <CardTitle className="text-base">{teacherName}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">طلب اعتماد التدريس الحضوري</p>
      </div>
      <Badge variant={status === "approved" ? "secondary" : status === "rejected" ? "destructive" : "outline"} data-testid="in-person-approval-status">
        {statusLabels[status]}
      </Badge>
    </CardHeader>
    <CardContent className="space-y-4">
      {(city || serviceRadius != null) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {city && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden="true" />{city}</span>}
          {serviceRadius != null && <span>نطاق الخدمة: {serviceRadius} كم</span>}
        </div>
      )}
      {status === "pending" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onApprove} disabled={saving} className="gap-2 rounded-xl" data-testid="admin-in-person-approve">
            <Check className="h-4 w-4" aria-hidden="true" />
            اعتماد
          </Button>
          <Button type="button" variant="outline" onClick={onReject} disabled={saving} className="gap-2 rounded-xl" data-testid="admin-in-person-reject">
            <X className="h-4 w-4" aria-hidden="true" />
            رفض
          </Button>
        </div>
      )}
    </CardContent>
  </Card>
);

export default AdminInPersonApproval;
