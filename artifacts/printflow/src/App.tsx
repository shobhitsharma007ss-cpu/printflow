import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { AppLayout } from "@/components/layout";
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

function Router() {
  const [location] = useLocation();
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
        <Route path="/" component={Dashboard} />
        <Route path="/floor-monitor" component={FloorMonitor} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/jobs" component={Jobs} />
        <Route path="/layout" component={LayoutPlanner} />
        <Route path="/costing" component={Costing} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}

export default App;
