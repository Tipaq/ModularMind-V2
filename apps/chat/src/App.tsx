import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider, ErrorBoundary, RouteLoader } from "@modularmind/ui";

import PortalLayout from "./layouts/PortalLayout";
import Login from "./pages/Login";

const SETUP_CHECK_TIMEOUT_MS = 5000;

// Lazy-loaded routes
const ChatPage = lazy(() => import("./pages/ChatPage"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const AppGallery = lazy(() => import("./pages/apps/AppGallery"));
const AppView = lazy(() => import("./pages/apps/AppView"));
const KnowledgeList = lazy(() => import("./pages/knowledge/KnowledgeList"));
const KnowledgeDetail = lazy(() => import("./pages/knowledge/KnowledgeDetail"));
const TaskList = lazy(() => import("./pages/tasks/TaskList"));
const TaskDetail = lazy(() => import("./pages/tasks/TaskDetail"));
const Secrets = lazy(() => import("./pages/Secrets"));
const ProjectList = lazy(() => import("./pages/projects/ProjectList"));
const ProjectDetail = lazy(() => import("./pages/projects/ProjectDetail"));
const ProjectOverview = lazy(() => import("./pages/projects/ProjectOverview"));
const ProjectConversations = lazy(() => import("./pages/projects/ProjectConversations"));
const ProjectKnowledge = lazy(() => import("./pages/projects/ProjectKnowledge"));
const ProjectApps = lazy(() => import("./pages/projects/ProjectApps"));
const ProjectTasks = lazy(() => import("./pages/projects/ProjectTasks"));

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
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:conversationId" element={<ChatPage />} />
            <Route path="/projects" element={<ProjectList />} />
            <Route path="/projects/:projectId" element={<ProjectDetail />}>
              <Route index element={<ProjectOverview />} />
              <Route path="conversations" element={<ProjectConversations />} />
              <Route path="knowledge" element={<ProjectKnowledge />} />
              <Route path="apps" element={<ProjectApps />} />
              <Route path="tasks" element={<ProjectTasks />} />
            </Route>
            <Route path="/apps" element={<AppGallery />} />
            <Route path="/apps/:appId" element={<AppView />} />
            <Route path="/knowledge" element={<KnowledgeList />} />
            <Route path="/knowledge/:collectionId" element={<KnowledgeDetail />} />
            <Route path="/tasks" element={<TaskList />} />
            <Route path="/tasks/:taskId" element={<TaskDetail />} />
            <Route path="/secrets" element={<Secrets />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
        </SetupRedirect>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
