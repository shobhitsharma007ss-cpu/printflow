import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";

import { AppLayout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { defaultPathForRole, type Role } from "@/lib/auth-api";
import LoginPage from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import FloorMonitor from "@/pages/floor-monitor";
import Inventory from "@/pages/inventory";
import Jobs from "@/pages/jobs";
import Costing from "@/pages/costing";
import LayoutPlanner from "@/pages/layout-planner";
import OperatorStation, { StationsPicker } from "@/pages/operator-station";
import JobCard from "@/pages/job-card";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    }
  }
});

function RoleRoute({
  path,
  allowed,
  role,
  component,
}: {
  path: string;
  allowed: Role[];
  role: Role;
  component: React.ComponentType;
}) {
  if (!allowed.includes(role)) {
    return (
      <Route path={path}>
        <Redirect to={defaultPathForRole(role)} />
      </Route>
    );
  }
  return <Route path={path} component={component} />;
}

function AuthedRouter() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const role = user.role;

  // Full-screen operator & job-card views (available to every authenticated role).
  if (location.startsWith("/floor/station") || location.startsWith("/job-card")) {
    return (
      <Switch>
        <Route path="/floor/stations" component={StationsPicker} />
        <Route path="/floor/station/:machineId" component={OperatorStation} />
        <Route path="/job-card/:id" component={JobCard} />
      </Switch>
    );
  }

  return (
    <AppLayout>
      <Switch>
        <RoleRoute path="/" allowed={["owner", "supervisor"]} role={role} component={Dashboard} />
        <RoleRoute path="/floor-monitor" allowed={["owner", "supervisor", "operator"]} role={role} component={FloorMonitor} />
        <RoleRoute path="/inventory" allowed={["owner", "supervisor"]} role={role} component={Inventory} />
        <RoleRoute path="/jobs" allowed={["owner", "supervisor"]} role={role} component={Jobs} />
        <RoleRoute path="/layout" allowed={["owner", "supervisor"]} role={role} component={LayoutPlanner} />
        <RoleRoute path="/costing" allowed={["owner"]} role={role} component={Costing} />
        <RoleRoute path="/reports" allowed={["owner"]} role={role} component={Reports} />
        <RoleRoute path="/settings" allowed={["owner"]} role={role} component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthedRouter />
        </WouterRouter>
        <Toaster position="bottom-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
