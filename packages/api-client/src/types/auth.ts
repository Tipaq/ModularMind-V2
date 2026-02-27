export interface User {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'user';
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token_type: string;
  expires_in: number;
  user: User;
}
