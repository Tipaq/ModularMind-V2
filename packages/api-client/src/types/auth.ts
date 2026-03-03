export interface User {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'user';
  is_active: boolean;
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
