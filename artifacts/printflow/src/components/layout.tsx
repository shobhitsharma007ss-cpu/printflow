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
  AlertTriangle,
  CheckCircle2,
  PackageX,
  Clock,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlantAlerts } from "@/hooks/use-notifications";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/floor-monitor", label: "Floor Monitor", icon: MonitorPlay },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NotificationBell() {
  const [isOpen, setIsOpen] = React.useState(false);
  const { data: alerts } = usePlantAlerts();

  const lowStock = alerts?.lowStock ?? [];
  const overdueJobs = alerts?.overdueJobs ?? [];
  const completedToday = alerts?.completedToday ?? [];
  const totalCount = lowStock.length + overdueJobs.length + completedToday.length;

  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
        aria-label="Open notifications"
      >
        <Bell size={20} />
        {totalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-destructive rounded-full border-2 border-card flex items-center justify-center text-[10px] font-bold text-white px-1">
            {totalCount > 9 ? "9+" : totalCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-[360px] bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm">Plant Alerts</h3>
                {totalCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-destructive text-white rounded-full">{totalCount}</span>
                )}
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-muted rounded text-muted-foreground">
                <X size={14} />
              </button>
            </div>

            <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
              {totalCount === 0 && (
                <div className="p-8 text-center">
                  <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500 opacity-60" />
                  <p className="text-sm font-medium text-muted-foreground">All clear</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">No active alerts right now</p>
                </div>
              )}

              {lowStock.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/20 border-b border-rose-200 dark:border-rose-800 flex items-center gap-2">
                    <PackageX size={13} className="text-rose-500" />
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Low Stock ({lowStock.length})</span>
                  </div>
                  {lowStock.map(m => (
                    <Link
                      key={m.id}
                      href="/inventory"
                      onClick={() => setIsOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 border-b border-rose-100 dark:border-rose-900/30 hover:bg-rose-50 dark:hover:bg-rose-950/10 transition-colors cursor-pointer"
                    >
                      <div className="p-1.5 rounded-lg shrink-0 mt-0.5 bg-rose-100 dark:bg-rose-900/30">
                        <AlertTriangle size={13} className="text-rose-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{m.materialName}</p>
                        <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">
                          {m.currentQty.toFixed(0)} {m.unit} remaining · reorder at {m.minReorderQty.toFixed(0)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {overdueJobs.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2">
                    <Clock size={13} className="text-amber-500" />
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Overdue Pending ({overdueJobs.length})</span>
                  </div>
                  {overdueJobs.map(j => (
                    <Link
                      key={j.id}
                      href="/jobs"
                      onClick={() => setIsOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 border-b border-amber-100 dark:border-amber-900/30 hover:bg-amber-50 dark:hover:bg-amber-950/10 transition-colors cursor-pointer"
                    >
                      <div className="p-1.5 rounded-lg shrink-0 mt-0.5 bg-amber-100 dark:bg-amber-900/30">
                        <Clock size={13} className="text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          <span className="font-mono text-primary text-xs">{j.jobCode}</span> {j.jobName}
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                          {j.clientName} · {j.daysOverdue}d overdue
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {completedToday.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/20 border-b border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-500" />
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Completed Today ({completedToday.length})</span>
                  </div>
                  {completedToday.map(j => (
                    <Link
                      key={j.id}
                      href="/jobs"
                      onClick={() => setIsOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 border-b border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/10 transition-colors cursor-pointer"
                    >
                      <div className="p-1.5 rounded-lg shrink-0 mt-0.5 bg-emerald-100 dark:bg-emerald-900/30">
                        <CheckCircle2 size={13} className="text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          <span className="font-mono text-primary text-xs">{j.jobCode}</span> {j.jobName}
                        </p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{j.clientName}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-center">
              <p className="text-[10px] text-muted-foreground/60">Refreshes every 60 seconds</p>
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
