export interface User {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "ADMIN" | "USER";
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
}
