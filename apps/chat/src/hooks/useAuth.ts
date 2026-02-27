/**
 * Auth hook — JWT login/logout with HttpOnly cookies.
 */

// TODO: Implement auth state management
// - POST /api/v1/auth/login
// - POST /api/v1/auth/refresh
// - POST /api/v1/auth/logout
export function useAuth() {
  return {
    user: null,
    isAuthenticated: false,
    login: async (_email: string, _password: string) => {},
    logout: async () => {},
  };
}
