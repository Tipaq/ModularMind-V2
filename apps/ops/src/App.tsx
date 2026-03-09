import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider, ErrorBoundary, RouteLoader } from "@modularmind/ui";

import DashboardLayout from "./layouts/DashboardLayout";
import Login from "./pages/Login";

// Lazy-loaded routes
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Setup = lazy(() => import("./pages/Setup"));
const Monitoring = lazy(() => import("./pages/Monitoring"));
const Configuration = lazy(() => import("./pages/Configuration"));
const Models = lazy(() => import("./pages/Models"));
const ModelDetail = lazy(() => import("./pages/ModelDetail"));
const Knowledge = lazy(() => import("./pages/Knowledge"));
const Users = lazy(() => import("./pages/Users"));
const UserDetail = lazy(() => import("./pages/UserDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));

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

export default function App() {
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
          <Route path="/" element={<Dashboard />} />
          <Route path="/monitoring" element={<Monitoring />} />
          <Route path="/configuration" element={<Configuration />} />
          <Route path="/models" element={<Models />} />
          <Route path="/models/:id" element={<ModelDetail />} />
          <Route path="/knowledge" element={<Knowledge />} />
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
