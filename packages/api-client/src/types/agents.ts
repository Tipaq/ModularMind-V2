export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  provider: string;
  system_prompt?: string;
  tools: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
}
