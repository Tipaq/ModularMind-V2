import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@modularmind/ui";

import Chat from "./pages/Chat";
import Login from "./pages/Login";

export default function App() {
  return (
    <ThemeProvider defaultMode="system">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<Chat />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
