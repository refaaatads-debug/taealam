import { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Users, Camera, Bell, Lock, Globe, Shield, LogOut, ChevronLeft, Save, BookOpen, Clock, Star, Loader2, CheckCircle, X, CreditCard, FileText, Upload, Trash2, Award } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Profile = () => {
  const { user, profile, roles, signOut } = useAuth();
  const isTeacher = roles.includes("teacher");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [notifyBefore, setNotifyBefore] = useState(true);
  const [notifyAfter, setNotifyAfter] = useState(true);
  const [notifyExpiry, setNotifyExpiry] = useState(true);
  const [saving, setSaving] = useState(false);

  // Teacher-specific
  const [bio, setBio] = useState("");
  const [yearsExp, setYearsExp] = useState("");
  const [nationality, setNationality] = useState("");
  const [availFrom, setAvailFrom] = useState("");
  const [availTo, setAvailTo] = useState("");
  const [teacherSubjects, setTeacherSubjects] = useState<string[]>([]);
  const [allSubjects, setAllSubjects] = useState<{ id: string; name: string }[]>([]);
  const [teacherProfileId, setTeacherProfileId] = useState<string | null>(null);
  const [loadingTeacher, setLoadingTeacher] = useState(false);
  const [teachingStages, setTeachingStages] = useState<string[]>([]);

  // Payment details
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [accountHolder, setAccountHolder] = useState("");

  // Certificates
  const [certificates, setCertificates] = useState<any[]>([]);
  const [certName, setCertName] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const certFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;

    supabase.from("profiles").select("notify_before_session, notify_after_session, notify_subscription_expiry")
      .eq("user_id", user.id).single().then(({ data }) => {
        if (data) {
          setNotifyBefore(data.notify_before_session ?? true);
          setNotifyAfter(data.notify_after_session ?? true);
          setNotifyExpiry(data.notify_subscription_expiry ?? true);
        }
      });

    if (isTeacher) {
      setLoadingTeacher(true);
      Promise.all([
        supabase.from("teacher_profiles").select("*").eq("user_id", user.id).single(),
        supabase.from("subjects").select("id, name").order("name"),
        supabase.from("teacher_certificates" as any).select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }),
      ]).then(([{ data: tp }, { data: subs }, { data: certs }]) => {
        if (tp) {
          setTeacherProfileId(tp.id);
          setBio(tp.bio || "");
          setYearsExp(String(tp.years_experience || ""));
          setNationality((tp as any).nationality || "");
          setAvailFrom(tp.available_from || "");
          setAvailTo(tp.available_to || "");
          setBankName((tp as any).bank_name || "");
          setIban((tp as any).iban || "");
          setAccountHolder((tp as any).account_holder_name || "");
          setTeachingStages((tp as any).teaching_stages || []);
          supabase.from("teacher_subjects").select("subject_id").eq("teacher_id", tp.id).then(({ data: ts }) => {
            if (ts) setTeacherSubjects(ts.map(t => t.subject_id));
          });
        }
        if (subs) setAllSubjects(subs);
        setCertificates((certs as any[]) || []);
        setLoadingTeacher(false);
      });
    }
  }, [user, isTeacher]);

  const toggleSubject = (subjectId: string) => {
    // Allow only one subject per teacher
    setTeacherSubjects(prev =>
      prev.includes(subjectId) ? [] : [subjectId]
    );
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error: profileErr } = await supabase.from("profiles").update({
        full_name: fullName,
        phone,
        notify_before_session: notifyBefore,
        notify_after_session: notifyAfter,
        notify_subscription_expiry: notifyExpiry,
      }).eq("user_id", user.id);
      if (profileErr) throw profileErr;

      if (isTeacher && teacherProfileId) {
        const { error: teacherErr } = await supabase.from("teacher_profiles").update({
          bio,
          years_experience: Number(yearsExp) || 0,
          available_from: availFrom || null,
          available_to: availTo || null,
          nationality: nationality || null,
          bank_name: bankName || null,
          iban: iban || null,
          account_holder_name: accountHolder || null,
          teaching_stages: teachingStages,
        } as any).eq("id", teacherProfileId);
        if (teacherErr) throw teacherErr;

        await supabase.from("teacher_subjects").delete().eq("teacher_id", teacherProfileId);
        if (teacherSubjects.length > 0) {
          await supabase.from("teacher_subjects").insert(
            teacherSubjects.map(sid => ({ teacher_id: teacherProfileId, subject_id: sid }))
          );
        }
      }

      toast.success("تم حفظ التغييرات بنجاح");
    } catch (err: any) {
      toast.error("حدث خطأ: " + (err.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const handleUploadCert = async () => {
    if (!user || !certName.trim() || !certFile) {
      toast.error("يرجى إدخال اسم الشهادة واختيار ملف");
      return;
    }
    setUploadingCert(true);
    try {
      const ext = certFile.name.split(".").pop();
      const path = `certificates/${user.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("support-files").upload(path, certFile);
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("support-files").getPublicUrl(path);

      const { error } = await supabase.from("teacher_certificates" as any).insert({
        teacher_id: user.id,
        name: certName.trim(),
        file_url: urlData.publicUrl,
        file_name: certFile.name,
      } as any);
      if (error) throw error;

      setCertName("");
      setCertFile(null);
      // Refresh
      const { data: certs } = await supabase.from("teacher_certificates" as any).select("*").eq("teacher_id", user.id).order("created_at", { ascending: false });
      setCertificates((certs as any[]) || []);
      toast.success("تم رفع الشهادة بنجاح");
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setUploadingCert(false);
    }
  };

  const handleDeleteCert = async (certId: string) => {
    await supabase.from("teacher_certificates" as any).delete().eq("id", certId);
    setCertificates(prev => prev.filter(c => c.id !== certId));
    toast.success("تم حذف الشهادة");
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-16 md:pb-0">
      <Navbar />
      <div className="container py-8 max-w-2xl">
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-black text-foreground mb-8">الملف الشخصي</motion.h1>

        {/* Avatar */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="border-0 shadow-card mb-6 overflow-hidden">
            <div className="h-20 gradient-hero" />
            <CardContent className="p-6 flex flex-col items-center -mt-10">
              <div className="relative mb-4">
                <div className="w-20 h-20 rounded-2xl gradient-hero flex items-center justify-center border-4 border-card">
                  <Users className="h-10 w-10 text-primary-foreground/80" />
                </div>
                <button className="absolute bottom-0 left-0 w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-secondary-foreground shadow-button">
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <h2 className="font-black text-lg text-foreground">{profile?.full_name || "مستخدم"}</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <div className="flex gap-2 mt-2">
                {roles.map(r => (
                  <Badge key={r} variant="secondary" className="text-xs">
                    {r === "teacher" ? "معلم" : r === "student" ? "طالب" : r === "parent" ? "ولي أمر" : "مسؤول"}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Personal Info */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-0 shadow-card mb-6">
            <CardHeader>
              <CardTitle className="text-lg font-bold">البيانات الشخصية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs font-bold text-muted-foreground">الاسم الكامل</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} className="mt-1.5 text-right rounded-xl bg-muted/30 border-border/50" />
              </div>
              <div>
                <Label className="text-xs font-bold text-muted-foreground">البريد الإلكتروني</Label>
                <Input value={user?.email || ""} disabled className="mt-1.5 text-right rounded-xl bg-muted/30 border-border/50 opacity-60" />
              </div>
              <div>
                <Label className="text-xs font-bold text-muted-foreground">رقم الجوال</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="05X XXX XXXX" className="mt-1.5 text-right rounded-xl bg-muted/30 border-border/50" dir="ltr" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Teacher Section */}
        {isTeacher && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="border-0 shadow-card mb-6">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  بيانات المعلم
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {loadingTeacher ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <>
                    <div>
                      <Label className="text-xs font-bold text-muted-foreground">السيرة الذاتية</Label>
                      <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="اكتب نبذة عنك وخبراتك..." className="mt-1.5 text-right rounded-xl bg-muted/30 border-border/50 min-h-[100px]" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-bold text-muted-foreground">سنوات الخبرة</Label>
                        <Input type="number" value={yearsExp} onChange={e => setYearsExp(e.target.value)} className="mt-1.5 rounded-xl bg-muted/30 border-border/50" dir="ltr" />
                      </div>
                      <div>
                        <Label className="text-xs font-bold text-muted-foreground">الجنسية</Label>
                        <select
                          value={nationality}
                          onChange={e => setNationality(e.target.value)}
                          className="mt-1.5 w-full h-10 rounded-xl bg-muted/30 border border-border/50 px-3 text-sm text-right"
                        >
                          <option value="">اختر الجنسية</option>
                          <option value="سعودي">سعودي</option>
                          <option value="مصري">مصري</option>
                          <option value="أردني">أردني</option>
                          <option value="سوري">سوري</option>
                          <option value="عراقي">عراقي</option>
                          <option value="يمني">يمني</option>
                          <option value="فلسطيني">فلسطيني</option>
                          <option value="لبناني">لبناني</option>
                          <option value="تونسي">تونسي</option>
                          <option value="جزائري">جزائري</option>
                          <option value="مغربي">مغربي</option>
                          <option value="سوداني">سوداني</option>
                          <option value="ليبي">ليبي</option>
                          <option value="إماراتي">إماراتي</option>
                          <option value="كويتي">كويتي</option>
                          <option value="بحريني">بحريني</option>
                          <option value="عماني">عماني</option>
                          <option value="قطري">قطري</option>
                          <option value="موريتاني">موريتاني</option>
                          <option value="أخرى">أخرى</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 mb-2">
                        <Clock className="h-3.5 w-3.5" /> ساعات التوفر
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">من</Label>
                          <Input type="time" value={availFrom} onChange={e => setAvailFrom(e.target.value)} className="mt-1 rounded-xl bg-muted/30 border-border/50" dir="ltr" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">إلى</Label>
                          <Input type="time" value={availTo} onChange={e => setAvailTo(e.target.value)} className="mt-1 rounded-xl bg-muted/30 border-border/50" dir="ltr" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 mb-2">
                        <Star className="h-3.5 w-3.5" /> التخصص (اختر تخصص واحد فقط)
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {allSubjects.map(s => {
                          const selected = teacherSubjects.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              onClick={() => toggleSubject(s.id)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                selected
                                  ? "bg-primary text-primary-foreground shadow-button"
                                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {selected && <CheckCircle className="h-3 w-3 inline ml-1" />}
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Payment Details - Teacher Only */}
        {isTeacher && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.17 }}>
            <Card className="border-0 shadow-card mb-6">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-secondary" />
                  بيانات الدفع البنكية
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs font-bold text-muted-foreground">اسم البنك</Label>
                  <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="مثال: البنك الأهلي" className="mt-1.5 text-right rounded-xl bg-muted/30 border-border/50" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-muted-foreground">رقم الآيبان (IBAN)</Label>
                  <Input value={iban} onChange={e => setIban(e.target.value)} placeholder="SA00 0000 0000 0000 0000 0000" className="mt-1.5 rounded-xl bg-muted/30 border-border/50" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-muted-foreground">اسم صاحب الحساب</Label>
                  <Input value={accountHolder} onChange={e => setAccountHolder(e.target.value)} placeholder="الاسم كما هو في البنك" className="mt-1.5 text-right rounded-xl bg-muted/30 border-border/50" />
                </div>
                <p className="text-[10px] text-muted-foreground">🔒 بياناتك البنكية محمية ولا تُعرض إلا للإدارة عند معالجة طلبات السحب</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Certificates - Teacher Only */}
        {isTeacher && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.19 }}>
            <Card className="border-0 shadow-card mb-6">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  الشهادات والمؤهلات
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Upload new */}
                <div className="space-y-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">اسم الشهادة</Label>
                    <Input value={certName} onChange={e => setCertName(e.target.value)} placeholder="مثال: بكالوريوس تربية" className="mt-1.5 text-right rounded-xl bg-background border-border/50" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={certFileRef}
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={e => setCertFile(e.target.files?.[0] || null)}
                    />
                    <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => certFileRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" />
                      اختر ملف
                    </Button>
                    {certFile && (
                      <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 text-xs">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        <span className="truncate max-w-[150px]">{certFile.name}</span>
                        <button onClick={() => setCertFile(null)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <Button onClick={handleUploadCert} disabled={uploadingCert || !certName.trim() || !certFile} size="sm" className="w-full rounded-xl gradient-cta text-secondary-foreground shadow-button gap-1.5">
                    {uploadingCert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    رفع الشهادة
                  </Button>
                </div>

                {/* List */}
                {certificates.length > 0 && (
                  <div className="space-y-2">
                    {certificates.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-primary" />
                          <div>
                            <p className="text-sm font-bold text-foreground">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleDateString("ar-SA")}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <a href={c.file_url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><FileText className="h-3.5 w-3.5 text-primary" /></Button>
                          </a>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteCert(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {certificates.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">لم يتم رفع أي شهادات بعد</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Settings */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-0 shadow-card mb-6">
            <CardHeader>
              <CardTitle className="text-lg font-bold">الإشعارات والإعدادات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {[
                { icon: Bell, title: "قبل الحصة", desc: "تذكير قبل الحصة بـ 30 دقيقة", checked: notifyBefore, onChange: setNotifyBefore },
                { icon: Bell, title: "بعد الحصة", desc: "طلب تقييم بعد انتهاء الحصة", checked: notifyAfter, onChange: setNotifyAfter },
                ...(!isTeacher ? [{ icon: Bell, title: "انتهاء الاشتراك", desc: "تنبيه عند اقتراب انتهاء الباقة", checked: notifyExpiry, onChange: setNotifyExpiry }] : []),
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                  <Switch checked={item.checked} onCheckedChange={item.onChange} />
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Save & Actions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="space-y-3">
          <Button onClick={handleSaveProfile} disabled={saving} className="w-full gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold h-12 text-base">
            {saving ? <Loader2 className="h-5 w-5 animate-spin ml-2" /> : <Save className="h-5 w-5 ml-2" />}
            حفظ جميع التغييرات
          </Button>
          <Button onClick={handleSignOut} variant="outline" className="w-full rounded-xl gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" /> تسجيل الخروج
          </Button>
        </motion.div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Profile;
