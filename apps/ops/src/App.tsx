import { lazy, Suspense, useEffect, useState } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
} from "react-router-dom";
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

function SetupGuard() {
  const [status, setStatus] = useState<"loading" | "initialized" | "needs-setup">("loading");
  const location = useLocation();

  useEffect(() => {
    fetch("/api/v1/setup/status")
      .then((r) => r.json())
      .then((data) => setStatus(data.initialized ? "initialized" : "needs-setup"))
      .catch(() => setStatus("initialized"));
  }, []);

  if (status === "loading") return <RouteLoader />;

  if (status === "needs-setup" && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }

  if (status === "initialized" && location.pathname === "/setup") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function SuspenseWrapper() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Outlet />
    </Suspense>
  );
}

const router = createBrowserRouter(
  [
    {
      element: <SuspenseWrapper />,
      children: [
        {
          element: <SetupGuard />,
          children: [
            { path: "/login", element: <Login /> },
            { path: "/setup", element: <Setup /> },
            {
              element: <DashboardLayout />,
              children: [
                { path: "/", element: <Navigate to="/configuration" replace /> },
                { path: "/monitoring", element: <Monitoring /> },
                { path: "/configuration", element: <Configuration /> },
                { path: "/models", element: <Models /> },
                { path: "/models/:id", element: <ModelDetail /> },
                { path: "/knowledge", element: <Knowledge /> },
                { path: "/knowledge/:id", element: <CollectionDetail /> },
                { path: "/tools", element: <Tools /> },
                { path: "/mini-apps", element: <MiniApps /> },
                { path: "/mini-apps/:id", element: <MiniAppDetail /> },
                { path: "/scheduled-tasks", element: <ScheduledTasks /> },
                { path: "/scheduled-tasks/:id", element: <ScheduledTaskDetail /> },
                { path: "/graphs", element: <Graphs /> },
                { path: "/graphs/:id", element: <GraphDetail /> },
                { path: "/agents", element: <Agents /> },
                { path: "/agents/:id", element: <AgentDetail /> },
                { path: "/users", element: <Users /> },
                { path: "/users/:userId", element: <UserDetail /> },
                { path: "/settings", element: <Settings /> },
                { path: "/profile", element: <Profile /> },
              ],
            },
          ],
        },
      ],
    },
  ],
  { basename: "/ops" },
);

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultMode="system">
        <RouterProvider router={router} />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
