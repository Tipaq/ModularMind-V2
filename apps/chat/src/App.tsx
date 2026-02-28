import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@modularmind/ui";

import ChatLayout from "./layouts/ChatLayout";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";

export default function App() {
  return (
    <ThemeProvider defaultMode="system">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ChatLayout />}>
            <Route path="/" element={<Chat />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
