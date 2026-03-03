import { useNavigate } from "react-router-dom";
import { LoginForm, useAuthStore } from "@modularmind/ui";

export default function Login() {
  const { login } = useAuthStore();
  const navigate = useNavigate();

  return (
    <LoginForm
      onLogin={login}
      onSuccess={() => navigate("/", { replace: true })}
    />
  );
}
