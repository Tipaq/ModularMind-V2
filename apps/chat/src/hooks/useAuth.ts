import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";

export function useAuth({ requireAuth = true } = {}) {
  const { user, isLoading, loadFromSession } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadFromSession();
  }, [loadFromSession]);

  useEffect(() => {
    if (requireAuth && !isLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [requireAuth, isLoading, user, navigate]);

  return { user, isLoading };
}
