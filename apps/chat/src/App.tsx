import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider, ErrorBoundary, RouteLoader } from "@modularmind/ui";

import ChatLayout from "./layouts/ChatLayout";
import Login from "./pages/Login";

const SETUP_CHECK_TIMEOUT_MS = 5000;

// Lazy-loaded routes
const Chat = lazy(() => import("./pages/Chat"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));

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
          <Route element={<ChatLayout />}>
            <Route path="/" element={<Chat />} />
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
