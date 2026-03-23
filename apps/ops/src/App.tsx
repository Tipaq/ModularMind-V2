import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider, ErrorBoundary, RouteLoader } from "@modularmind/ui";

import { DashboardLayout } from "./layouts/DashboardLayout";
import { Login } from "./pages/Login";

const Setup = lazy(() => import("./pages/Setup").then((m) => ({ default: m.Setup })));
const Monitoring = lazy(() => import("./pages/Monitoring").then((m) => ({ default: m.Monitoring })));
const Configuration = lazy(() => import("./pages/Configuration").then((m) => ({ default: m.Configuration })));
const Models = lazy(() => import("./pages/Models").then((m) => ({ default: m.Models })));
const ModelDetail = lazy(() => import("./pages/ModelDetail").then((m) => ({ default: m.ModelDetail })));
const Knowledge = lazy(() => import("./pages/Knowledge").then((m) => ({ default: m.Knowledge })));
const CollectionDetail = lazy(() => import("./pages/CollectionDetail").then((m) => ({ default: m.CollectionDetail })));
const Users = lazy(() => import("./pages/Users").then((m) => ({ default: m.Users })));
const UserDetail = lazy(() => import("./pages/UserDetail").then((m) => ({ default: m.UserDetail })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const Tools = lazy(() => import("./pages/Tools").then((m) => ({ default: m.Tools })));
const MiniApps = lazy(() => import("./pages/MiniApps").then((m) => ({ default: m.MiniApps })));
const MiniAppDetail = lazy(() => import("./pages/MiniAppDetail").then((m) => ({ default: m.MiniAppDetail })));
const ScheduledTasks = lazy(() => import("./pages/ScheduledTasks").then((m) => ({ default: m.ScheduledTasks })));
const ScheduledTaskDetail = lazy(() => import("./pages/ScheduledTaskDetail").then((m) => ({ default: m.ScheduledTaskDetail })));
const Graphs = lazy(() => import("./pages/Graphs").then((m) => ({ default: m.Graphs })));
const GraphDetail = lazy(() => import("./pages/GraphDetail").then((m) => ({ default: m.GraphDetail })));
const Agents = lazy(() => import("./pages/Agents").then((m) => ({ default: m.Agents })));
const AgentDetail = lazy(() => import("./pages/AgentDetail").then((m) => ({ default: m.AgentDetail })));

function SetupGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "initialized" | "needs-setup">("loading");
  const location = useLocation();

  useEffect(() => {
    fetch("/api/v1/setup/status")
      .then((r) => r.json())
      .then((data) => setStatus(data.initialized ? "initialized" : "needs-setup"))
      .catch(() => setStatus("initialized")); // if endpoint fails, don't block
  }, []);

  if (status === "loading") return <RouteLoader />;

  // Not initialized → force /setup (unless already there)
  if (status === "needs-setup" && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }

  // Already initialized → block /setup page
  if (status === "initialized" && location.pathname === "/setup") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider defaultMode="system">
    <BrowserRouter basename="/ops">
      <Suspense fallback={<RouteLoader />}>
      <SetupGuard>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Navigate to="/configuration" replace />} />
          <Route path="/monitoring" element={<Monitoring />} />
          <Route path="/configuration" element={<Configuration />} />
          <Route path="/models" element={<Models />} />
          <Route path="/models/:id" element={<ModelDetail />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/knowledge/:id" element={<CollectionDetail />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/mini-apps" element={<MiniApps />} />
          <Route path="/mini-apps/:id" element={<MiniAppDetail />} />
          <Route path="/scheduled-tasks" element={<ScheduledTasks />} />
          <Route path="/scheduled-tasks/:id" element={<ScheduledTaskDetail />} />
          <Route path="/graphs" element={<Graphs />} />
          <Route path="/graphs/:id" element={<GraphDetail />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
          <Route path="/users" element={<Users />} />
          <Route path="/users/:userId" element={<UserDetail />} />

          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Routes>
      </SetupGuard>
      </Suspense>
    </BrowserRouter>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

