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
  Bell, LogOut,
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
      label: "الرئيسية",
      items: [
        { id: "overview", title: "نظرة عامة", icon: BarChart3, permission: "view_overview" },
      ],
    },
    {
      label: "إدارة المستخدمين",
      items: [
        { id: "users", title: "المستخدمين", icon: Users, permission: "manage_users" },
        { id: "teachers", title: "طلبات المعلمين", icon: UserCheck, badge: pendingTeachersCount, permission: "manage_teachers" },
        { id: "teacher_performance", title: "أداء المعلمين", icon: TrendingUp, permission: "view_teacher_performance" },
      ],
    },
    {
      label: "الحجوزات والحصص",
      items: [
        { id: "bookings", title: "الحجوزات", icon: Clock, badge: badgeCounts.pendingBookings, permission: "manage_bookings" },
        { id: "sessions_status", title: "حالات الجلسات", icon: Monitor, permission: "manage_bookings" },
        { id: "session_reports", title: "تقارير الحصص", icon: FileText, permission: "manage_session_reports" },
        { id: "session_pricing", title: "أسعار الحصص", icon: DollarSign, permission: "manage_session_pricing" },
        { id: "materials_monitor", title: "مراقبة المواد", icon: BookOpen, permission: "manage_materials" },
      ],
    },
    {
      label: "المالية",
      items: [
        { id: "plans", title: "الباقات", icon: CreditCard, permission: "manage_plans" },
        { id: "coupons", title: "الكوبونات", icon: Tag, permission: "manage_coupons" },
        { id: "withdrawals", title: "سحب الأرباح", icon: Wallet, badge: badgeCounts.withdrawals, permission: "manage_withdrawals" },
        { id: "teacher_payments", title: "المدفوعات", icon: DollarSign, permission: "manage_teacher_payments" },
        { id: "teacher_earnings", title: "الأرباح اليدوية", icon: DollarSign, permission: "manage_teacher_earnings" },
        { id: "wallets", title: "المحافظ والمكالمات", icon: Wallet, permission: "manage_wallets" },
      ],
    },
    {
      label: "الأمان والمراقبة",
      items: [
        { id: "violations", title: "المخالفات", icon: ShieldAlert, badge: badgeCounts.unreviewed, permission: "manage_violations" },
        { id: "call_transcripts", title: "تفريغ المكالمات", icon: MessageSquare, permission: "manage_violations" },
        { id: "ai_audit", title: "فحص AI", icon: Brain, permission: "manage_ai_audit" },
      ],
    },
    {
      label: "النظام",
      items: [
        { id: "site", title: "المحتوى", icon: Settings, permission: "manage_content" },
        { id: "support", title: "الدعم الفني", icon: MessageSquare, badge: badgeCounts.support, permission: "customer_support" },
        { id: "admin_notifications", title: "الإشعارات", icon: Bell, permission: "manage_notifications" },
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
    <Sidebar side="right" collapsible="icon" className="border-l-0 border-r">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <h2 className="text-sm font-black text-foreground leading-tight">لوحة التحكم</h2>
              <p className="text-[10px] text-muted-foreground">إدارة المنصة</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
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
                      className="relative"
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

      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="تسجيل الخروج" className="text-destructive hover:text-destructive hover:bg-destructive/10">
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
