import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Upload, Image, Type, Globe, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings, SiteSetting } from "@/hooks/useSiteSettings";

const categoryLabels: Record<string, string> = {
  homepage: "الصفحة الرئيسية",
  header: "الهيدر (شريط التنقل)",
  footer: "الفوتر (أسفل الصفحة)",
  general: "إعدادات عامة",
};

const SiteSettingsTab = () => {
  const { settings, loading, updateSetting, refetch } = useSiteSettings();
  const [editValues, setEditValues] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentImageKey, setCurrentImageKey] = useState<string>("");

  const handleChange = (key: string, value: string) => {
    setEditValues(prev => new Map(prev).set(key, value));
  };

  const getValue = (setting: SiteSetting) => {
    return editValues.has(setting.key) ? editValues.get(setting.key)! : (setting.value || "");
  };

  const handleSave = async (key: string) => {
    const value = editValues.get(key);
    if (value === undefined) return;
    setSaving(key);
    const { error } = await updateSetting(key, value);
    if (error) {
      toast.error("حدث خطأ في الحفظ");
    } else {
      toast.success("تم الحفظ بنجاح");
      setEditValues(prev => { const m = new Map(prev); m.delete(key); return m; });
    }
    setSaving(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentImageKey) return;
    
    setUploading(currentImageKey);
    const ext = file.name.split(".").pop();
    const path = `${currentImageKey}-${Date.now()}.${ext}`;
    
    const { error: uploadError } = await supabase.storage
      .from("site-assets")
      .upload(path, file, { upsert: true });
    
    if (uploadError) {
      toast.error("خطأ في رفع الصورة: " + uploadError.message);
      setUploading(null);
      return;
    }

    const { data: urlData } = supabase.storage.from("site-assets").getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    const { error } = await updateSetting(currentImageKey, publicUrl);
    if (error) {
      toast.error("خطأ في حفظ رابط الصورة");
    } else {
      toast.success("تم رفع الصورة بنجاح");
    }
    setUploading(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const categories = [...new Set(settings.map(s => s.category))];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {categories.map(cat => (
        <Card key={cat} className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              {categoryLabels[cat] || cat}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings.filter(s => s.category === cat).map(setting => (
              <div key={setting.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    {setting.type === "image" ? (
                      <Image className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Type className="h-4 w-4 text-muted-foreground" />
                    )}
                    {setting.label_ar || setting.key}
                  </label>
                  <Badge variant="outline" className="text-[10px]">{setting.type}</Badge>
                </div>

                {setting.type === "image" ? (
                  <div className="space-y-2">
                    {setting.value && (
                      <div className="relative w-full max-w-md h-32 rounded-xl overflow-hidden border bg-muted/30">
                        <img src={setting.value} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg gap-2"
                      disabled={uploading === setting.key}
                      onClick={() => {
                        setCurrentImageKey(setting.key);
                        fileInputRef.current?.click();
                      }}
                    >
                      {uploading === setting.key ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {uploading === setting.key ? "جاري الرفع..." : "رفع صورة جديدة"}
                    </Button>
                  </div>
                ) : getValue(setting).length > 80 ? (
                  <div className="flex gap-2">
                    <Textarea
                      value={getValue(setting)}
                      onChange={(e) => handleChange(setting.key, e.target.value)}
                      className="rounded-xl text-sm min-h-[80px]"
                      dir="rtl"
                    />
                    {editValues.has(setting.key) && (
                      <Button
                        size="sm"
                        className="rounded-lg shrink-0 self-end"
                        disabled={saving === setting.key}
                        onClick={() => handleSave(setting.key)}
                      >
                        {saving === setting.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={getValue(setting)}
                      onChange={(e) => handleChange(setting.key, e.target.value)}
                      className="rounded-xl text-sm"
                      dir="rtl"
                    />
                    {editValues.has(setting.key) && (
                      <Button
                        size="sm"
                        className="rounded-lg shrink-0"
                        disabled={saving === setting.key}
                        onClick={() => handleSave(setting.key)}
                      >
                        {saving === setting.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default SiteSettingsTab;
