import { Outlet } from "react-router-dom";
import { PageLoader } from "@modularmind/ui";
import { useAuth } from "../hooks/useAuth";
import { AppSidebar } from "../components/navigation/AppSidebar";

export default function PortalLayout() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <PageLoader />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-row bg-background">
      <AppSidebar />
      <main className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
