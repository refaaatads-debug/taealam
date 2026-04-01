import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Clock, DollarSign, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function SchedulePricingManager() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hourlyRate, setHourlyRate] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableTo, setAvailableTo] = useState("");
  const [bio, setBio] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("teacher_profiles")
        .select("hourly_rate, available_from, available_to, bio, years_experience")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setHourlyRate(data.hourly_rate?.toString() || "0");
        setAvailableFrom(data.available_from || "");
        setAvailableTo(data.available_to || "");
        setBio(data.bio || "");
        setYearsExperience(data.years_experience?.toString() || "0");
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("teacher_profiles")
      .update({
        hourly_rate: parseFloat(hourlyRate) || 0,
        available_from: availableFrom || null,
        available_to: availableTo || null,
        bio: bio || null,
        years_experience: parseInt(yearsExperience) || 0,
      })
      .eq("user_id", user.id);

    if (error) {
      toast.error("حدث خطأ في حفظ البيانات");
    } else {
      toast.success("تم حفظ التعديلات بنجاح ✅");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          المواعيد والأسعار
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Hourly Rate */}
        <div className="space-y-2">
          <Label className="text-sm font-bold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-secondary" />
            سعر الساعة (ر.س)
          </Label>
          <Input
            type="number"
            min="0"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            className="rounded-xl"
            placeholder="مثال: 100"
            dir="ltr"
          />
        </div>

        {/* Available Times */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-bold">متاح من</Label>
            <Input
              type="time"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              className="rounded-xl"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold">متاح إلى</Label>
            <Input
              type="time"
              value={availableTo}
              onChange={(e) => setAvailableTo(e.target.value)}
              className="rounded-xl"
              dir="ltr"
            />
          </div>
        </div>

        {/* Years Experience */}
        <div className="space-y-2">
          <Label className="text-sm font-bold">سنوات الخبرة</Label>
          <Input
            type="number"
            min="0"
            value={yearsExperience}
            onChange={(e) => setYearsExperience(e.target.value)}
            className="rounded-xl"
            dir="ltr"
          />
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <Label className="text-sm font-bold">نبذة تعريفية</Label>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="rounded-xl min-h-[100px]"
            placeholder="اكتب نبذة عنك وعن أسلوبك في التدريس..."
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full gradient-cta text-secondary-foreground rounded-xl shadow-button"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ التعديلات
        </Button>
      </CardContent>
    </Card>
  );
}
