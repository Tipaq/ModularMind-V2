# Guide de style TypeScript — Frontend

## Configuration TypeScript

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "target": "ES2022",
    "module": "ESNext",
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## Component Patterns

### Function Components (préféré)

```tsx
// Correct — named function export
export function UserCard({ user, onSelect }: UserCardProps) {
  return (
    <Card onClick={() => onSelect(user.id)}>
      <CardHeader>{user.name}</CardHeader>
    </Card>
  );
}

// Incorrect — arrow function with FC type
const UserCard: React.FC<UserCardProps> = ({ user, onSelect }) => { ... }
```

### Props Interface

```tsx
// Props defined inline for simple components
export function Badge({ label, variant = "default" }: {
  label: string;
  variant?: "default" | "success" | "destructive";
}) { ... }

// Separate interface for complex components
interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  pagination?: PaginationConfig;
}

export function DataTable<T>({ data, columns, ...props }: DataTableProps<T>) { ... }
```

## State Management (Zustand)

```tsx
// stores/auth-store.ts
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: async (credentials) => {
    const user = await apiClient.auth.login(credentials);
    set({ user, isAuthenticated: true });
  },
  logout: async () => {
    await apiClient.auth.logout();
    set({ user: null, isAuthenticated: false });
  },
}));
```

## Styling Rules

### Semantic Tokens (obligatoire)

```tsx
// Correct — semantic tokens
<div className="bg-primary text-primary-foreground" />
<Badge className="bg-success text-success-foreground" />
<Card className="bg-card border-border" />

// Incorrect — hardcoded colors (NEVER)
<div className="bg-blue-500 text-white" />
<Badge className="bg-green-600 text-green-50" />
```

### Available Tokens

`primary`, `secondary`, `muted`, `accent`, `destructive`, `success`, `warning`, `info`
Each with `-foreground` variant. Plus: `card`, `popover`, `sidebar-*`, `border`, `input`, `ring`.

### Shared Color Maps

```tsx
import { STATUS_COLORS, CHANNEL_COLORS, ROLE_COLORS } from '@modularmind/ui';

<Badge className={STATUS_COLORS[status]} />
```

## "use client" Directive

All components using React hooks in `packages/ui` MUST have the directive:

```tsx
"use client";

import { useState } from 'react';

export function ThemeToggle() {
  const [mode, setMode] = useState('system');
  // ...
}
```

This is required for Next.js SSR compatibility and is harmless in Vite apps.

## File Naming

| Entity | Convention | Example |
|--------|-----------|---------|
| Components | kebab-case | `user-card.tsx` |
| Pages | kebab-case | `settings-page.tsx` |
| Hooks | camelCase with `use` prefix | `useAuthStore.ts` |
| Utilities | kebab-case | `format-date.ts` |
| Types | kebab-case | `api-types.ts` |
| Constants | kebab-case | `color-maps.ts` |