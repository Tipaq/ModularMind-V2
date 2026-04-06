// Auth store
export { useAuthStore } from "./stores/auth";
export type { User, Role } from "./stores/auth";

// Auth hook
export { useAuth } from "./hooks/useAuth";

// Execution activities hook
export { useExecutionActivities } from "./hooks/useExecutionActivities";

// Chat adapter (transport abstraction for useChat)
export type { ChatAdapter, UploadedAttachment } from "./hooks/chat-adapter";

// Conversation adapter (transport abstraction for useConversations)
export type { ConversationAdapter } from "./hooks/conversation-adapter";

// Shared conversations hook
export { useConversations } from "./hooks/useConversations";
export type { UseConversationsOptions } from "./hooks/useConversations";

// Chat config adapter (transport abstraction for useChatConfig)
export type { ChatConfigAdapter, ChatConfigData } from "./hooks/chat-config-adapter";

// Shared chat config hook
export { useChatConfig } from "./hooks/useChatConfig";

// Shared chat hook
export { useChat } from "./hooks/useChat";

// Playground hook (shared state for agent/graph/model playgrounds)
export { usePlayground } from "./hooks/usePlayground";
export type { UsePlaygroundOptions } from "./hooks/usePlayground";

// Chat utilities
export { extractResponse } from "./hooks/useChatUtils";

// Utilities
export { cn, formatBytes, formatDuration, formatNumber, formatTokens, relativeTime, stripProvider, isLocalModel, formatModelName, formatDurationMs, formatCost, toggleArrayItem } from "./lib/utils";

// Mappers (snake_case API → camelCase UI)
export { mapKnowledgeData, mapContextData } from "./lib/mappers";
export type { RawKnowledgeData, RawContextData } from "./lib/mappers";

// Color constants
export { ACTIVITY_COLORS, CHANNEL_COLORS, STATUS_COLORS, ROLE_COLORS, HEALTH_COLORS } from "./lib/colors";

// Chat config
export type { ChatConfig } from "./lib/chat-config";
export { DEFAULT_CHAT_CONFIG } from "./lib/chat-config";

// Chat types
export type { ChatError, ActivityType, ActivityStatus, ToolCallData, LlmCallData, RoutingData, ErrorData, ExecutionActivity, KnowledgeCollection, KnowledgeChunk, KnowledgeData, SupervisorData, TokenUsage, ExecutionOutputData, ContextHistoryMessage, ContextHistoryBudget, ContextHistory, BudgetLayerInfo, BudgetOverview, ContextData, MessageExecutionData, AttachedFile } from "./types/chat";

// Resource types (shared table/filter/pagination primitives)
export type { ResourceColumn, ResourceFilterConfig, PaginationState, SortState } from "./types/resource";

// Engine config types (canonical source: @modularmind/api-client)
export type { EngineAgent, EngineGraph, EngineModel, McpServer, SupervisorLayer } from "@modularmind/api-client";

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
export { ConfirmDialog } from "./components/confirm-dialog";
export type { ConfirmDialogProps } from "./components/confirm-dialog";
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
export { PageErrorBoundary } from "./components/page-error-boundary";
export { RouteLoader, PageLoader } from "./components/route-loader";
export { LoginForm } from "./components/login-form";
export type { LoginFormProps } from "./components/login-form";
export { ProfilePage } from "./components/profile-page";
export type { ProfilePageProps } from "./components/profile-page";
export { SettingsPage } from "./components/settings-page";
export type { SettingsTab } from "./components/settings-page";
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
export { ApprovalCard } from "./components/approval-card";
export type { ApprovalCardProps, ApprovalRequest } from "./components/approval-card";
export { PromptCard } from "./components/prompt-card";
export type { PromptCardProps, HumanPromptRequest } from "./components/prompt-card";
export { ChatPanel } from "./components/chat-panel";
export type { ChatPanelProps, ChatPanelTab } from "./components/chat-panel";
export { ChatInput } from "./components/chat-input";
export type { ChatInputProps } from "./components/chat-input";
export { ChatEmptyState } from "./components/chat-empty-state";
export type { ChatEmptyStateProps } from "./components/chat-empty-state";
export { ChatErrorBanner } from "./components/chat-error-banner";

// Conversation sidebar
export { ConversationSidebar } from "./components/conversation-sidebar";
export type { ConversationSidebarProps, SidebarConversation } from "./components/conversation-sidebar";

// Conversation list (full-page hub)
export { ConversationList } from "./components/conversation-list";
export type { ConversationListProps, ConversationListItem } from "./components/conversation-list";

// New conversation button (unified)
export { NewConversationButton } from "./components/new-conversation-button";
export type { NewConversationButtonProps } from "./components/new-conversation-button";

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

// Mini-app system
export { MiniAppViewer } from "./components/mini-app";
export { MiniAppCard } from "./components/mini-app";

// Shell layout
export { SectionShell } from "./components/section-shell";

// Shared layout components
export { SectionCard } from "./components/section-card";
export type { SectionCardProps } from "./components/section-card";
export { AgentConfigGrid } from "./components/agent-config-grid";
export type { AgentConfigGridProps } from "./components/agent-config-grid";
export { PromptDisplay } from "./components/prompt-display";
export type { PromptDisplayProps } from "./components/prompt-display";
export { ToggleRow } from "./components/toggle-row";
export type { ToggleRowProps } from "./components/toggle-row";

// Code & copy components
export { CopyButton } from "./components/copy-button";
export { CodeBlock } from "./components/code-block";
export { MarkdownRenderer } from "./components/markdown-renderer";

// Artifact system
export type { DetectedArtifact, ArtifactType } from "./types/artifact";
export { extractCodeArtifacts, extractToolArtifact } from "./lib/artifact-detection";
export { useArtifacts } from "./hooks/useArtifacts";
export { ArtifactPanel } from "./components/artifact-panel";
export { ArtifactViewer } from "./components/artifact-panel";
export { ArtifactList } from "./components/artifact-panel";
