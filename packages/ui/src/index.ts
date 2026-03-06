// Auth store
export { useAuthStore } from "./stores/auth";
export type { User, Role } from "./stores/auth";

// Auth hook
export { useAuth } from "./hooks/useAuth";

// Execution activities hook
export { useExecutionActivities } from "./hooks/useExecutionActivities";

// Chat utilities
export { extractResponse } from "./hooks/useChatUtils";

// Utilities
export { cn, formatBytes, formatDuration, formatNumber, formatTokens, relativeTime, stripProvider, isLocalModel, formatDurationMs, formatCost } from "./lib/utils";

// Color constants
export { ACTIVITY_COLORS, CHANNEL_COLORS, STATUS_COLORS, ROLE_COLORS, HEALTH_COLORS } from "./lib/colors";

// Chat config
export type { ChatConfig } from "./lib/chat-config";
export { DEFAULT_CHAT_CONFIG } from "./lib/chat-config";

// Chat types
export type { ActivityType, ActivityStatus, ToolCallData, LlmCallData, RoutingData, ErrorData, ExecutionActivity, KnowledgeCollection, KnowledgeChunk, KnowledgeData, InsightsMemoryEntry, SupervisorData, TokenUsage, ExecutionOutputData, ContextHistoryMessage, ContextHistoryBudget, ContextHistory, BudgetLayerInfo, BudgetOverview, ContextData, MessageExecutionData, AttachedFile } from "./types/chat";

// Resource types (shared table/filter/pagination primitives)
export type { ResourceColumn, ResourceFilterConfig, PaginationState, SortState } from "./types/resource";

// Engine config types (re-exported so platform can use them without depending on api-client)
export type { EngineAgent, EngineGraph, EngineModel, McpServer, SupervisorLayer } from "./types/engine";

// Theme
export { ThemeProvider } from "./theme/ThemeProvider";
export type { ThemeMode, ThemeConfig, ThemeContextValue } from "./theme/ThemeProvider";
export { useTheme } from "./theme/useTheme";
export { PRESETS, getPreset } from "./theme/presets";
export type { ThemePreset } from "./theme/presets";
export { generateAccentTokens, ANTI_FOUC_SCRIPT } from "./theme/utils";

// Components
export { Avatar, AvatarImage, AvatarFallback } from "./components/avatar";
export { Badge, badgeVariants } from "./components/badge";
export type { BadgeProps } from "./components/badge";
export { Button, buttonVariants } from "./components/button";
export type { ButtonProps } from "./components/button";
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "./components/card";
export { Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "./components/dialog";
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup } from "./components/dropdown-menu";
export { Input } from "./components/input";
export type { InputProps } from "./components/input";
export { Label } from "./components/label";
export { PageHeader } from "./components/page-header";
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator } from "./components/select";
export { Separator } from "./components/separator";
export { Slider } from "./components/slider";
export { StatusBadge, ChannelBadge } from "./components/status-badge";
export { Switch } from "./components/switch";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/tabs";
export { Textarea } from "./components/textarea";
export type { TextareaProps } from "./components/textarea";
export { AppearanceCard } from "./components/appearance-card";
export { ErrorBoundary } from "./components/error-boundary";
export { LoginForm } from "./components/login-form";
export type { LoginFormProps } from "./components/login-form";
export { ProfilePage } from "./components/profile-page";
export type { ProfilePageProps } from "./components/profile-page";
export { SettingsPage } from "./components/settings-page";
export { ThemeCustomizer } from "./components/theme-customizer";
export { ThemeToggle } from "./components/theme-toggle";
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./components/tooltip";
export { UserButton } from "./components/user-button";
export type { UserButtonUser } from "./components/user-button";
export { AttachmentChip } from "./components/attachment-chip";
export type { AttachmentChipData } from "./components/attachment-chip";
export { ChatMessages } from "./components/chat-messages";
export type { ChatMessagesProps, ChatMessage } from "./components/chat-messages";
export { ExecutionActivityList } from "./components/execution-activity";
export type { ExecutionActivityListProps } from "./components/execution-activity";
export { ChatPanel } from "./components/chat-panel";
export type { ChatPanelProps, ChatPanelTab } from "./components/chat-panel";
export { ChatInput } from "./components/chat-input";
export type { ChatInputProps } from "./components/chat-input";
export { ChatEmptyState } from "./components/chat-empty-state";
export type { ChatEmptyStateProps } from "./components/chat-empty-state";

// Conversation sidebar
export { ConversationSidebar } from "./components/conversation-sidebar";
export type { ConversationSidebarProps, SidebarConversation } from "./components/conversation-sidebar";

// Resource components (shared table, filters, empty state, detail header)
export { EmptyState } from "./components/empty-state";
export type { EmptyStateProps } from "./components/empty-state";
export { DetailHeader } from "./components/detail-header";
export type { DetailHeaderProps } from "./components/detail-header";
export { ResourceTable } from "./components/resource-table";
export { ResourceFilters } from "./components/resource-filters";

// Activity timeline system
export { ActivityTab } from "./components/activity";
export type { ActivityTabProps } from "./components/activity";
export { ExecutionTimeline } from "./components/activity";
export { ExecutionSummaryHeader, computeSummary } from "./components/activity";
export type { ExecutionSummary } from "./components/activity";
export { AgentDetailModal } from "./components/activity";
export type { AgentDetailModalProps } from "./components/activity";

// Insights panel system (shared InsightsPanel with Config, Activity, Context tabs)
export { InsightsPanel } from "./components/insights";
export type { InsightsPanelProps } from "./components/insights";
export { ConfigTab } from "./components/insights";
export type { ConfigTabProps, ExecutionMetrics } from "./components/insights";
export { MemoryTab } from "./components/insights";
export type { MemoryTabProps } from "./components/insights";
