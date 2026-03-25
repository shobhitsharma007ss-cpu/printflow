import React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  MonitorPlay, 
  Briefcase, 
  Package, 
  BarChart3, 
  Settings,
  Bell,
  Search,
  Menu,
  Check,
  CheckCheck,
  AlertTriangle,
  Play,
  CheckCircle2,
  PackagePlus,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/use-notifications";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/floor-monitor", label: "Floor Monitor", icon: MonitorPlay },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function getNotificationIcon(type: string) {
  switch (type) {
    case "low-stock": return AlertTriangle;
    case "step-started": return Play;
    case "step-completed": return Check;
    case "job-completed": return CheckCircle2;
    case "stock-inward": return PackagePlus;
    default: return Bell;
  }
}

function getNotificationColor(type: string) {
  switch (type) {
    case "low-stock": return "text-amber-500 bg-amber-500/10";
    case "step-started": return "text-blue-500 bg-blue-500/10";
    case "step-completed": return "text-emerald-500 bg-emerald-500/10";
    case "job-completed": return "text-emerald-600 bg-emerald-600/10";
    case "stock-inward": return "text-primary bg-primary/10";
    default: return "text-muted-foreground bg-muted";
  }
}

function NotificationBell() {
  const [isOpen, setIsOpen] = React.useState(false);
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-destructive rounded-full border-2 border-card flex items-center justify-center text-[10px] font-bold text-white px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-[380px] bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="font-bold text-sm">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                  >
                    <CheckCheck size={12} />
                    Mark all read
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-muted rounded">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {(!notifications || notifications.length === 0) && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No notifications yet
                </div>
              )}
              {notifications?.map(n => {
                const Icon = getNotificationIcon(n.type);
                const colorClass = getNotificationColor(n.type);
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.isRead && handleMarkRead(n.id)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b border-border/50 transition-colors cursor-pointer",
                      !n.isRead ? "bg-primary/[0.03] hover:bg-muted/50" : "hover:bg-muted/30"
                    )}
                  >
                    <div className={cn("p-1.5 rounded-lg shrink-0 mt-0.5", colorClass)}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn("text-sm font-semibold", !n.isRead && "text-foreground")}>{n.title}</p>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <aside className="hidden md:flex flex-col w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]">
            PF
          </div>
          <span className="text-xl font-bold tracking-tight text-white">PrintFlow</span>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                  isActive 
                    ? "bg-primary text-white shadow-md shadow-primary/20" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"
                )}
              >
                <item.icon size={18} className={cn(
                  "transition-transform duration-200", 
                  isActive ? "scale-110" : "group-hover:scale-110"
                )} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border mt-auto">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-9 h-9 rounded-full bg-sidebar-accent border border-sidebar-border flex items-center justify-center overflow-hidden">
               <span className="text-xs font-bold text-white">PI</span>
            </div>
            <div>
              <p className="text-sm font-medium text-white leading-tight">Prakash Industries</p>
              <p className="text-xs text-sidebar-foreground/50">Plant Manager</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex flex-col flex-1 w-full overflow-hidden relative">
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden p-2 rounded-md hover:bg-muted text-muted-foreground"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:flex relative w-64 md:w-96">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search jobs, materials, machines..." 
                className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-transparent rounded-full text-sm focus:bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
          {children}
        </main>
      </div>

      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <aside 
            className="w-64 h-full bg-sidebar flex flex-col animate-slide-in-right"
            onClick={e => e.stopPropagation()}
          >
             <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-white">PF</div>
              <span className="text-xl font-bold text-white">PrintFlow</span>
            </div>
            <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link 
                    key={item.href} 
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium",
                      isActive 
                        ? "bg-primary text-white" 
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"
                    )}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}
