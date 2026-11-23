import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SiteSetting {
  id: string;
  key: string;
  value: string | null;
  type: string;
  label_ar: string | null;
  category: string;
}

export function useSiteSettings(category?: string) {
  const [settings, setSettings] = useState<SiteSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsMap, setSettingsMap] = useState<Map<string, string>>(new Map());

  const fetchSettings = async () => {
    let query = (supabase as any).from("site_settings").select("*");
    if (category) query = query.eq("category", category);
    const { data } = await query.order("created_at");
    if (data) {
      setSettings(data);
      const map = new Map<string, string>();
      data.forEach((s: SiteSetting) => map.set(s.key, s.value || ""));
      setSettingsMap(map);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); }, [category]);

  const updateSetting = async (key: string, value: string) => {
    const { error } = await (supabase as any)
      .from("site_settings")
      .update({ value })
      .eq("key", key);
    if (!error) {
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
      setSettingsMap(prev => new Map(prev).set(key, value));
    }
    return { error };
  };

  const getSetting = (key: string, fallback = "") => settingsMap.get(key) || fallback;

  return { settings, loading, updateSetting, getSetting, refetch: fetchSettings };
}
