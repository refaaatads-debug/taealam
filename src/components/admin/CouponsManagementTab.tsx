import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Loader2, Trash2, Tag, Copy, ToggleLeft, ToggleRight, Percent, DollarSign } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PromotionCode {
  id: string;
  code: string;
  active: boolean;
  max_redemptions: number | null;
  times_redeemed: number;
  expires_at: number | null;
}

interface Coupon {
  id: string;
  name: string;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  duration: string;
  duration_in_months: number | null;
  valid: boolean;
  times_redeemed: number;
  promotion_codes: PromotionCode[];
}

const CouponsManagementTab = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [newCoupon, setNewCoupon] = useState({
    name: "",
    percent_off: 10,
    amount_off: 0,
    duration: "once",
    duration_in_months: 3,
    code: "",
    max_redemptions: 0,
    expires_at: "",
  });

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("manage-coupons", {
      body: { action: "list" },
    });
    if (error) {
      toast.error("خطأ في جلب الكوبونات");
    } else if (data?.coupons) {
      setCoupons(data.coupons);
    }
    setLoading(false);
  };

  const createCoupon = async () => {
    if (!newCoupon.name || !newCoupon.code) {
      toast.error("الاسم والكود مطلوبان");
      return;
    }
    setSaving(true);
    const body: any = {
      action: "create",
      name: newCoupon.name,
      duration: newCoupon.duration,
      code: newCoupon.code,
    };
    if (discountType === "percent") {
      body.percent_off = newCoupon.percent_off;
    } else {
      body.amount_off = newCoupon.amount_off;
    }
    if (newCoupon.duration === "repeating") {
      body.duration_in_months = newCoupon.duration_in_months;
    }
    if (newCoupon.max_redemptions > 0) {
      body.max_redemptions = newCoupon.max_redemptions;
    }
    if (newCoupon.expires_at) {
      body.expires_at = newCoupon.expires_at;
    }

    const { error } = await supabase.functions.invoke("manage-coupons", { body });
    if (error) {
      toast.error("خطأ في إنشاء الكوبون");
    } else {
      toast.success("تم إنشاء الكوبون بنجاح");
      setShowNewForm(false);
      setNewCoupon({ name: "", percent_off: 10, amount_off: 0, duration: "once", duration_in_months: 3, code: "", max_redemptions: 0, expires_at: "" });
      fetchCoupons();
    }
    setSaving(false);
  };

  const togglePromoCode = async (promoId: string, active: boolean) => {
    const action = active ? "deactivate" : "activate";
    const { error } = await supabase.functions.invoke("manage-coupons", {
      body: { action, promotion_code_id: promoId },
    });
    if (error) {
      toast.error("خطأ في تحديث الكوبون");
    } else {
      toast.success(active ? "تم تعطيل الكوبون" : "تم تفعيل الكوبون");
      fetchCoupons();
    }
  };

  const deleteCoupon = async (couponId: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الكوبون؟")) return;
    const { error } = await supabase.functions.invoke("manage-coupons", {
      body: { action: "delete", coupon_id: couponId },
    });
    if (error) {
      toast.error("خطأ في حذف الكوبون");
    } else {
      toast.success("تم حذف الكوبون");
      fetchCoupons();
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("تم نسخ الكود");
  };

  const generateRandomCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    setNewCoupon(p => ({ ...p, code }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">إدارة كوبونات الخصم ({coupons.length})</h3>
        <Button size="sm" className="rounded-lg gap-1.5" onClick={() => setShowNewForm(!showNewForm)}>
          <Plus className="h-4 w-4" />
          إنشاء كوبون
        </Button>
      </div>

      {showNewForm && (
        <Card className="border-2 border-dashed border-primary/30 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">كوبون جديد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                placeholder="اسم الكوبون (مثال: خصم العودة للمدارس)"
                value={newCoupon.name}
                onChange={e => setNewCoupon(p => ({ ...p, name: e.target.value }))}
                className="rounded-lg text-sm"
              />
              <div className="flex gap-2">
                <Input
                  placeholder="كود الخصم (مثال: BACK2SCHOOL)"
                  value={newCoupon.code}
                  onChange={e => setNewCoupon(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                  className="rounded-lg text-sm font-mono"
                  dir="ltr"
                />
                <Button size="sm" variant="outline" className="rounded-lg shrink-0 text-xs" onClick={generateRandomCode}>
                  توليد
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">نوع الخصم</label>
                <Select value={discountType} onValueChange={v => setDiscountType(v as "percent" | "amount")}>
                  <SelectTrigger className="rounded-lg text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">نسبة مئوية %</SelectItem>
                    <SelectItem value="amount">مبلغ ثابت (ر.س)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {discountType === "percent" ? "نسبة الخصم %" : "مبلغ الخصم (ر.س)"}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={discountType === "percent" ? 100 : undefined}
                  value={discountType === "percent" ? newCoupon.percent_off : newCoupon.amount_off}
                  onChange={e => {
                    const val = Number(e.target.value);
                    if (discountType === "percent") setNewCoupon(p => ({ ...p, percent_off: val }));
                    else setNewCoupon(p => ({ ...p, amount_off: val }));
                  }}
                  className="rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">مدة الخصم</label>
                <Select value={newCoupon.duration} onValueChange={v => setNewCoupon(p => ({ ...p, duration: v }))}>
                  <SelectTrigger className="rounded-lg text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">مرة واحدة</SelectItem>
                    <SelectItem value="repeating">عدة أشهر</SelectItem>
                    <SelectItem value="forever">دائم</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newCoupon.duration === "repeating" && (
              <div className="w-48">
                <label className="text-xs text-muted-foreground mb-1 block">عدد الأشهر</label>
                <Input
                  type="number"
                  min={1}
                  value={newCoupon.duration_in_months}
                  onChange={e => setNewCoupon(p => ({ ...p, duration_in_months: Number(e.target.value) }))}
                  className="rounded-lg text-sm"
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الحد الأقصى للاستخدام (0 = غير محدود)</label>
                <Input
                  type="number"
                  min={0}
                  value={newCoupon.max_redemptions}
                  onChange={e => setNewCoupon(p => ({ ...p, max_redemptions: Number(e.target.value) }))}
                  className="rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">تاريخ الانتهاء (اختياري)</label>
                <Input
                  type="date"
                  value={newCoupon.expires_at}
                  onChange={e => setNewCoupon(p => ({ ...p, expires_at: e.target.value }))}
                  className="rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="rounded-lg gap-1.5" disabled={saving} onClick={createCoupon}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                إنشاء الكوبون
              </Button>
              <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setShowNewForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {coupons.length === 0 && !showNewForm && (
        <Card className="border-0 shadow-card">
          <CardContent className="p-8 text-center">
            <Tag className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">لا توجد كوبونات بعد</p>
            <p className="text-muted-foreground text-xs mt-1">أنشئ كوبون خصم جديد ليستخدمه الطلاب عند الاشتراك</p>
          </CardContent>
        </Card>
      )}

      {coupons.map(coupon => (
        <Card key={coupon.id} className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  {coupon.percent_off ? (
                    <Percent className="h-5 w-5 text-primary" />
                  ) : (
                    <DollarSign className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div>
                  <p className="font-bold text-foreground text-sm">{coupon.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {coupon.percent_off
                      ? `خصم ${coupon.percent_off}%`
                      : `خصم ${(coupon.amount_off || 0) / 100} ر.س`}
                    {" • "}
                    {coupon.duration === "once" ? "مرة واحدة" : coupon.duration === "forever" ? "دائم" : `${coupon.duration_in_months} أشهر`}
                    {" • "}
                    استُخدم {coupon.times_redeemed} مرة
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!coupon.valid && <Badge variant="destructive" className="text-[10px]">منتهي</Badge>}
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => deleteCoupon(coupon.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {coupon.promotion_codes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {coupon.promotion_codes.map(promo => (
                  <div
                    key={promo.id}
                    className="flex items-center gap-1.5 bg-muted rounded-lg px-2.5 py-1.5"
                  >
                    <span className="font-mono text-xs font-bold" dir="ltr">{promo.code}</span>
                    <Badge
                      variant={promo.active ? "default" : "secondary"}
                      className="text-[10px] px-1.5"
                    >
                      {promo.active ? "نشط" : "معطل"}
                    </Badge>
                    {promo.max_redemptions && (
                      <span className="text-[10px] text-muted-foreground">
                        {promo.times_redeemed}/{promo.max_redemptions}
                      </span>
                    )}
                    {promo.expires_at && (
                      <span className="text-[10px] text-muted-foreground">
                        ينتهي {new Date(promo.expires_at * 1000).toLocaleDateString("ar-SA")}
                      </span>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => copyCode(promo.code)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => togglePromoCode(promo.id, promo.active)}
                    >
                      {promo.active ? (
                        <ToggleRight className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default CouponsManagementTab;
