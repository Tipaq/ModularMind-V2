import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider, ErrorBoundary, PageErrorBoundary, RouteLoader } from "@modularmind/ui";

import PortalLayout from "./layouts/PortalLayout";
import Login from "./pages/Login";

const SETUP_CHECK_TIMEOUT_MS = 5000;

const ConversationsPage = lazy(() => import("./pages/ConversationsPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const AppGallery = lazy(() => import("./pages/apps/AppGallery"));
const AppView = lazy(() => import("./pages/apps/AppView"));
const ProjectList = lazy(() => import("./pages/projects/ProjectList"));
const ProjectDetail = lazy(() => import("./pages/projects/ProjectDetail"));
const ProjectOverview = lazy(() => import("./pages/projects/ProjectOverview"));
const ProjectConversations = lazy(() => import("./pages/projects/ProjectConversations"));
const ProjectKnowledge = lazy(() => import("./pages/projects/ProjectKnowledge"));
const ProjectApps = lazy(() => import("./pages/projects/ProjectApps"));
const ProjectTasks = lazy(() => import("./pages/projects/ProjectTasks"));
const ProjectConnectors = lazy(() => import("./pages/projects/ProjectConnectors"));

function SetupRedirect({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(
    () => sessionStorage.getItem("mm_setup_ok") === "1",
  );

  useEffect(() => {
    if (ready) return;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SETUP_CHECK_TIMEOUT_MS);

    fetch("/api/v1/setup/status", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!data.initialized) {
          window.location.href = "/ops/setup";
        } else {
          sessionStorage.setItem("mm_setup_ok", "1");
          setReady(true);
        }
      })
      .catch(() => setReady(true));

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [ready]);

  if (!ready) return <RouteLoader />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider defaultMode="system">
      <BrowserRouter>
        <Suspense fallback={<RouteLoader />}>
        <SetupRedirect>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<PortalLayout />}>
            <Route index element={<Navigate to="/chat" replace />} />
            <Route path="/chat" element={<PageErrorBoundary pageName="conversations"><ConversationsPage /></PageErrorBoundary>} />
            <Route path="/chat/:conversationId" element={<PageErrorBoundary pageName="chat"><ChatPage /></PageErrorBoundary>} />
            <Route path="/projects" element={<PageErrorBoundary pageName="projects"><ProjectList /></PageErrorBoundary>} />
            <Route path="/projects/:projectId" element={<PageErrorBoundary pageName="project-detail"><ProjectDetail /></PageErrorBoundary>}>
              <Route index element={<ProjectOverview />} />
              <Route path="conversations" element={<ProjectConversations />} />
              <Route path="knowledge" element={<ProjectKnowledge />} />
              <Route path="apps" element={<ProjectApps />} />
              <Route path="tasks" element={<ProjectTasks />} />
              <Route path="connectors" element={<ProjectConnectors />} />
            </Route>
            <Route path="/projects/:projectId/conversations/:conversationId" element={<PageErrorBoundary pageName="project-chat"><ChatPage /></PageErrorBoundary>} />
            <Route path="/apps" element={<PageErrorBoundary pageName="app-gallery"><AppGallery /></PageErrorBoundary>} />
            <Route path="/apps/:appId" element={<PageErrorBoundary pageName="app-view"><AppView /></PageErrorBoundary>} />
            <Route path="/secrets" element={<Navigate to="/settings" replace />} />
            <Route path="/settings" element={<PageErrorBoundary pageName="settings"><Settings /></PageErrorBoundary>} />
            <Route path="/profile" element={<PageErrorBoundary pageName="profile"><Profile /></PageErrorBoundary>} />
          </Route>
        </Routes>
        </SetupRedirect>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
