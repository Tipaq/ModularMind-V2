export interface Model {
  id: string;
  name: string;
  provider: string;
  size?: string;
  capabilities: string[];
  is_loaded: boolean;
}
