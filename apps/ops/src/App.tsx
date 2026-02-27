import { BrowserRouter, Route, Routes } from "react-router-dom";

import DashboardLayout from "./layouts/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Monitoring from "./pages/Monitoring";
import Configuration from "./pages/Configuration";
import Agents from "./pages/Agents";
import Graphs from "./pages/Graphs";
import Models from "./pages/Models";
import Knowledge from "./pages/Knowledge";
import Users from "./pages/Users";
import Playground from "./pages/Playground";

export default function App() {
  return (
    <BrowserRouter basename="/ops">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/monitoring" element={<Monitoring />} />
          <Route path="/configuration" element={<Configuration />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/graphs" element={<Graphs />} />
          <Route path="/models" element={<Models />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/users" element={<Users />} />
          <Route path="/playground" element={<Playground />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
