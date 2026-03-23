import { useNavigate } from "react-router-dom";
import { LoginForm, useAuthStore } from "@modularmind/ui";

export function Login() {
  const { login } = useAuthStore();
  const navigate = useNavigate();

  return (
    <LoginForm
      subtitle="Operations Console"
      emailPlaceholder="admin@example.com"
      onLogin={login}
      onSuccess={() => navigate("/", { replace: true })}
    />
  );
}
