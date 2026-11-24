import { useLocation } from "react-router-dom";
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
  Bell, LogOut, ShieldCheck, KeyRound, Lock, Star, FolderOpen,
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
      label: "مركز القيادة",
      items: [
        { id: "overview", title: "نظرة عامة", icon: BarChart3, permission: "view_overview" },
        { id: "advanced_analytics", title: "التحليلات المتقدمة", icon: TrendingUp, permission: "view_advanced_analytics" },
      ],
    },
    {
      label: "المستخدمون والمعلمون",
      items: [
        { id: "users", title: "المستخدمين", icon: Users, permission: "manage_users" },
        { id: "student_profiles", title: "ملفات الطلاب", icon: FolderOpen, permission: "manage_student_profiles" },
        { id: "teacher_profiles", title: "ملفات المعلمين", icon: FolderOpen, permission: "manage_teacher_profiles" },
        { id: "teachers", title: "طلبات المعلمين", icon: UserCheck, badge: pendingTeachersCount, permission: "manage_pending_teachers" },
        { id: "teacher_performance", title: "أداء المعلمين", icon: TrendingUp, permission: "view_teacher_performance" },
        { id: "featured_teachers", title: "المدرسون المميزون", icon: Star, permission: "manage_featured_teachers" },
      ],
    },
    {
      label: "التجربة التعليمية",
      items: [
        { id: "bookings", title: "الحجوزات", icon: Clock, badge: badgeCounts.pendingBookings, permission: "manage_bookings" },
        { id: "sessions_status", title: "حالات الجلسات", icon: Monitor, permission: "manage_sessions_status" },
        { id: "session_reports", title: "تقارير الحصص", icon: FileText, permission: "manage_session_reports" },
        { id: "session_pricing", title: "أسعار الحصص", icon: DollarSign, permission: "manage_session_pricing" },
        { id: "materials_monitor", title: "مراقبة المواد", icon: BookOpen, permission: "manage_materials" },
      ],
    },
    {
      label: "المالية والتحصيل",
      items: [
        { id: "plans", title: "الباقات", icon: CreditCard, permission: "manage_plans" },
        { id: "coupons", title: "الكوبونات", icon: Tag, permission: "manage_coupons" },
        { id: "withdrawals", title: "سحب الأرباح", icon: Wallet, badge: badgeCounts.withdrawals, permission: "manage_withdrawals" },
        { id: "teacher_payments", title: "المدفوعات", icon: DollarSign, permission: "manage_teacher_payments" },
        { id: "teacher_earnings", title: "الأرباح اليدوية", icon: DollarSign, permission: "manage_teacher_earnings" },
        { id: "wallets", title: "المحافظ والمكالمات", icon: Wallet, permission: "manage_wallets" },
        { id: "financial_hub", title: "المركز المالي", icon: ShieldCheck, permission: "manage_teacher_earnings" },
      ],
    },
    {
      label: "الأمان والمراقبة",
      items: [
        { id: "violations", title: "المخالفات", icon: ShieldAlert, badge: badgeCounts.unreviewed, permission: "manage_violations" },
        { id: "call_transcripts", title: "تفريغ المكالمات", icon: MessageSquare, permission: "view_call_transcripts" },
        { id: "ai_audit", title: "فحص AI", icon: Brain, permission: "manage_ai_audit" },
      ],
    },
    {
      label: "الدعم والحوكمة",
      items: [
        { id: "site", title: "المحتوى", icon: Settings, permission: "manage_content" },
        { id: "support", title: "الدعم الفني", icon: MessageSquare, badge: badgeCounts.support, permission: "customer_support" },
        { id: "admin_notifications", title: "الإشعارات", icon: Bell, permission: "manage_notifications" },
        { id: "domain_ssl", title: "حالة SSL/HTTPS", icon: Lock, permission: "manage_domain_ssl" },
        { id: "team", title: "فريق الإدارة وسجل العمليات", icon: ShieldCheck, permission: "manage_admins" },
        { id: "admin_permissions", title: "صلاحيات أقسام لوحة الإدارة", icon: KeyRound, permission: "manage_admins" },
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
    <Sidebar side="right" collapsible="icon" className="border-l-0 border-r border-border/60 bg-card/95">
      <SidebarHeader className="px-4 py-4 border-b border-border/50 bg-gradient-to-b from-primary/[0.07] to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0 shadow-sm">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h2 className="text-sm font-black text-foreground leading-tight truncate">منصة أجيال المعرفة</h2>
              <p className="text-[10px] text-muted-foreground mt-1">مركز العمليات والإدارة</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {menuGroups.map((group, gi) => (
          <SidebarGroup key={group.label} className={gi > 0 ? "mt-1" : ""}>
            <SidebarGroupLabel className="text-[10px] font-medium text-muted-foreground/60 px-2 mb-0.5 mt-3">
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
                      className={[
                        "relative rounded-xl h-10 transition-all duration-200",
                        activeTab === item.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                      ].join(" ")}
                    >
                      <item.icon className={["h-4 w-4 shrink-0 transition-colors", activeTab === item.id ? "text-primary" : ""].join(" ")} />
                      <span className="truncate text-[13px]">{item.title}</span>
                      {item.badge && item.badge > 0 ? (
                        <Badge
                          variant="destructive"
                          className="mr-auto text-[9px] px-1.5 py-0 h-4 min-w-[16px] flex items-center justify-center rounded-full"
                        >
                          {item.badge}
                        </Badge>
                      ) : null}
                      {activeTab === item.id && (
                        <span className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-l-full" />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              tooltip="تسجيل الخروج"
              className="rounded-md h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors duration-150"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-[13px]">تسجيل الخروج</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AdminSidebar;
