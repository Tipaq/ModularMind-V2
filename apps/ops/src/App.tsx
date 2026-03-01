import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@modularmind/ui";

import DashboardLayout from "./layouts/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Monitoring from "./pages/Monitoring";
import Configuration from "./pages/Configuration";
import Models from "./pages/Models";
import ModelDetail from "./pages/ModelDetail";
import Knowledge from "./pages/Knowledge";
import Users from "./pages/Users";
import Playground from "./pages/Playground";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";

export default function App() {
  return (
    <ThemeProvider defaultMode="system">
    <BrowserRouter basename="/ops">
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
          <Route path="/playground" element={<Playground />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ThemeProvider>
  );
}
