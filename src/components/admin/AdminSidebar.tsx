import { useLocation } from "react-router-dom";
import platformLogo from "@/assets/logo.png";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  BarChart3, Users, UserCheck, Clock, ShieldAlert, DollarSign,
  Tag, TrendingUp, MessageSquare, Settings, FileText, BookOpen,
  AlertTriangle, Shield, CreditCard, Wallet, Brain, Monitor,
  Bell, LogOut, ShieldCheck, Lock, Star, FolderOpen, Cpu, Activity,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface MenuItemConfig {
  id: string;
  title: string;
  icon: React.ElementType;
  badge?: number;
  permission?: string;
}

interface MenuGroupConfig {
  label: string;
  items: MenuItemConfig[];
}

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  badgeCounts: {
    withdrawals: number;
    support: number;
    pendingBookings: number;
    unreviewed: number;
  };
  pendingTeachersCount: number;
  isFullAdmin: boolean;
  permissions: Set<string>;
}

const AdminSidebar = ({ activeTab, onTabChange, badgeCounts, pendingTeachersCount, isFullAdmin, permissions }: AdminSidebarProps) => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();

  const allGroups: MenuGroupConfig[] = [
    {
      label: "الرئيسية والتحليلات",
      items: [
        { id: "overview", title: "نظرة عامة", icon: BarChart3, permission: "view_overview" },
        { id: "advanced_analytics", title: "التحليلات المتقدمة", icon: TrendingUp, permission: "view_advanced_analytics" },
      ],
    },
    {
      label: "المستخدمون والكوادر",
      items: [
        { id: "users", title: "إدارة المستخدمين", icon: Users, permission: "manage_users" },
        { id: "student_profiles", title: "ملفات الطلاب", icon: FolderOpen, permission: "manage_student_profiles" },
        { id: "teacher_profiles", title: "ملفات المعلمين", icon: FolderOpen, permission: "manage_teacher_profiles" },
        { id: "teachers", title: "طلبات تسجيل المعلمين", icon: UserCheck, badge: pendingTeachersCount, permission: "manage_pending_teachers" },
        { id: "teacher_performance", title: "أداء المعلمين", icon: TrendingUp, permission: "view_teacher_performance" },
        { id: "featured_teachers", title: "المعلمون المميزون", icon: Star, permission: "manage_featured_teachers" },
      ],
    },
    {
      label: "الحجوزات والجلسات",
      items: [
        { id: "bookings", title: "إدارة الحجوزات", icon: Clock, badge: badgeCounts.pendingBookings, permission: "manage_bookings" },
        { id: "sessions_status", title: "مراقبة حالات الجلسات", icon: Monitor, permission: "manage_sessions_status" },
        { id: "session_reports", title: "تقارير الجلسات", icon: FileText, permission: "manage_session_reports" },
      ],
    },
    {
      label: "المالية والمدفوعات",
      items: [
        { id: "financial_hub", title: "المركز المالي والمطابقة", icon: ShieldCheck, permission: "manage_teacher_earnings" },
        { id: "plans", title: "الباقات والاشتراكات", icon: CreditCard, permission: "manage_plans" },
        { id: "coupons", title: "الكوبونات والعروض", icon: Tag, permission: "manage_coupons" },
        { id: "session_pricing", title: "تسعير الجلسات", icon: DollarSign, permission: "manage_session_pricing" },
        { id: "teacher_payments", title: "مدفوعات المعلمين", icon: DollarSign, permission: "manage_teacher_payments" },
        { id: "teacher_earnings", title: "الأرباح اليدوية", icon: DollarSign, permission: "manage_teacher_earnings" },
        { id: "withdrawals", title: "طلبات سحب الأرباح", icon: Wallet, badge: badgeCounts.withdrawals, permission: "manage_withdrawals" },
        { id: "wallets", title: "المحافظ والمكالمات", icon: Wallet, permission: "manage_wallets" },
      ],
    },
    {
      label: "المنصة والمحتوى",
      items: [
        { id: "materials_monitor", title: "مركز مراقبة المواد التعليمية", icon: BookOpen, permission: "manage_materials" },
        { id: "site", title: "إدارة محتوى المنصة", icon: Settings, permission: "manage_content" },
        { id: "platform_health", title: "صحة المنصة وجودة البيانات", icon: Activity, permission: "view_overview" },
        { id: "admin_notifications", title: "إشعارات المنصة", icon: Bell, permission: "manage_notifications" },
      ],
    },
    {
      label: "الذكاء الاصطناعي",
      items: [
        { id: "ai_models", title: "نماذج الذكاء الاصطناعي", icon: Cpu, permission: "manage_ai_models" },
        { id: "ai_audit", title: "تدقيق مخرجات الذكاء الاصطناعي", icon: Brain, permission: "manage_ai_audit" },
        { id: "call_transcripts", title: "تفريغ وتحليل المكالمات", icon: MessageSquare, permission: "view_call_transcripts" },
        { id: "domain_ssl", title: "تقرير حالة HTTPS / SSL", icon: Lock, permission: "manage_domain_ssl" },
      ],
    },
    {
      label: "الدعم والأمان",
      items: [
        { id: "support", title: "مركز الدعم الفني", icon: MessageSquare, badge: badgeCounts.support, permission: "customer_support" },
        { id: "violations", title: "المخالفات والمراجعة الأمنية", icon: ShieldAlert, badge: badgeCounts.unreviewed, permission: "manage_violations" },
      ],
    },
    {
      label: "الإدارة والنظام",
      items: [
        { id: "team", title: "فريق الإدارة وسجل العمليات", icon: ShieldCheck, permission: "manage_admins" },
      ],
    },
  ];

  const menuGroups = allGroups
    .map(g => ({ ...g, items: g.items.filter(i => isFullAdmin || !i.permission || permissions.has(i.permission)) }))
    .filter(g => g.items.length > 0);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-login");
  };

  return (
    <Sidebar side="right" collapsible="icon" className="border-l-0 border-r border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_46%,#f2f7f7_100%)] shadow-[8px_0_35px_-25px_rgba(15,42,78,0.45)]">
      <SidebarHeader className="border-b border-slate-200/70 p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"><img src={platformLogo} alt="أجيال المعرفة" className="h-full w-full object-contain" /></div>
          {!collapsed && (<div className="min-w-0 animate-fade-in"><h2 className="truncate text-sm font-black leading-tight text-[#12345d]">أجيال المعرفة</h2><p className="mt-1 text-[10px] font-semibold tracking-wide text-emerald-700/80">مركز إدارة المنصة</p></div>)}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2.5 py-2">
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label} className="mb-1">
            <SidebarGroupLabel className="mx-1 mb-2 rounded-lg border border-slate-200/80 bg-slate-100/80 px-3 py-2 text-[13px] font-black leading-5 tracking-wide text-[#123d6b] shadow-sm">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeTab === item.id}
                      onClick={() => onTabChange(item.id)}
                      tooltip={item.title}
                      className="relative h-11 rounded-xl text-[13px] font-semibold leading-5 text-slate-600 transition-all hover:bg-white hover:text-[#12345d] hover:shadow-sm data-[active=true]:bg-[#123d6b] data-[active=true]:text-white data-[active=true]:shadow-lg data-[active=true]:shadow-blue-950/10"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.title}</span>
                      {item.badge && item.badge > 0 ? (
                        <Badge
                          variant="destructive"
                          className="mr-auto text-[9px] px-1.5 py-0 h-4 min-w-4 flex items-center justify-center rounded-full"
                        >
                          {item.badge}
                        </Badge>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-slate-200/70 bg-white/60 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="تسجيل الخروج" className="h-10 rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700">
              <LogOut className="h-4 w-4" />
              <span>تسجيل الخروج</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AdminSidebar;
