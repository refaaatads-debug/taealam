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
}

const AdminSidebar = ({ activeTab, onTabChange, badgeCounts, pendingTeachersCount }: AdminSidebarProps) => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();

  const menuGroups: MenuGroupConfig[] = [
    {
      label: "الرئيسية",
      items: [
        { id: "overview", title: "نظرة عامة", icon: BarChart3 },
      ],
    },
    {
      label: "إدارة المستخدمين",
      items: [
        { id: "users", title: "المستخدمين", icon: Users },
        { id: "teachers", title: "طلبات المعلمين", icon: UserCheck, badge: pendingTeachersCount },
        { id: "teacher_performance", title: "أداء المعلمين", icon: TrendingUp },
      ],
    },
    {
      label: "الحجوزات والحصص",
      items: [
        { id: "bookings", title: "الحجوزات", icon: Clock, badge: badgeCounts.pendingBookings },
        { id: "session_reports", title: "تقارير الحصص", icon: FileText },
        { id: "session_pricing", title: "أسعار الحصص", icon: DollarSign },
        { id: "materials_monitor", title: "مراقبة المواد", icon: BookOpen },
      ],
    },
    {
      label: "المالية",
      items: [
        { id: "plans", title: "الباقات", icon: CreditCard },
        { id: "coupons", title: "الكوبونات", icon: Tag },
        { id: "withdrawals", title: "سحب الأرباح", icon: Wallet, badge: badgeCounts.withdrawals },
        { id: "teacher_payments", title: "المدفوعات", icon: DollarSign },
        { id: "teacher_earnings", title: "الأرباح اليدوية", icon: DollarSign },
        { id: "wallets", title: "المحافظ والمكالمات", icon: Wallet },
      ],
    },
    {
      label: "الأمان والمراقبة",
      items: [
        { id: "violations", title: "المخالفات", icon: ShieldAlert, badge: badgeCounts.unreviewed },
        { id: "ai_audit", title: "فحص AI", icon: Brain },
      ],
    },
    {
      label: "النظام",
      items: [
        { id: "site", title: "المحتوى", icon: Settings },
        { id: "support", title: "الدعم الفني", icon: MessageSquare, badge: badgeCounts.support },
        { id: "admin_notifications", title: "الإشعارات", icon: Bell },
      ],
    },
  ];

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
