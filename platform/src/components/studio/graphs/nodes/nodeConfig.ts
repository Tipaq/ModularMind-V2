import {
  Play,
  Square,
  Bot,
  Wrench,
  Workflow,
  GitBranch,
  Columns2,
  Merge,
  Repeat,
  Crown,
  type LucideIcon,
} from "lucide-react";
import { Position } from "@xyflow/react";

export type NodeType =
  | "start"
  | "end"
  | "agent"
  | "tool"
  | "subgraph"
  | "condition"
  | "parallel"
  | "merge"
  | "loop"
  | "supervisor";

export interface HandleConfig {
  position: Position;
  id?: string;
  style?: React.CSSProperties;
}

export interface NodeTypeConfig {
  icon: LucideIcon;
  label: string;
  description: string;
  color: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  iconBgClass: string;
  targets: HandleConfig[];
  sources: HandleConfig[];
}

export const NODE_CONFIG: Record<NodeType, NodeTypeConfig> = {
  start: {
    icon: Play,
    label: "Start",
    description: "Entry point",
    color: "success",
    bgClass: "bg-card",
    borderClass: "border-success",
    textClass: "text-success",
    iconBgClass: "bg-success/10 text-success",
    targets: [],
    sources: [{ position: Position.Bottom }],
  },
  end: {
    icon: Square,
    label: "End",
    description: "Exit point",
    color: "destructive",
    bgClass: "bg-card",
    borderClass: "border-destructive",
    textClass: "text-destructive",
    iconBgClass: "bg-destructive/10 text-destructive",
    targets: [{ position: Position.Top }],
    sources: [],
  },
  agent: {
    icon: Bot,
    label: "Agent",
    description: "AI Agent",
    color: "primary",
    bgClass: "bg-card",
    borderClass: "border-primary",
    textClass: "text-primary",
    iconBgClass: "bg-primary/10 text-primary",
    targets: [{ position: Position.Top }],
    sources: [{ position: Position.Bottom }],
  },
  tool: {
    icon: Wrench,
    label: "Tool",
    description: "Tool call",
    color: "accent",
    bgClass: "bg-card",
    borderClass: "border-accent",
    textClass: "text-accent-foreground",
    iconBgClass: "bg-accent text-accent-foreground",
    targets: [{ position: Position.Top }],
    sources: [{ position: Position.Bottom }],
  },
  subgraph: {
    icon: Workflow,
    label: "Subgraph",
    description: "Nested graph",
    color: "warning",
    bgClass: "bg-card",
    borderClass: "border-warning",
    textClass: "text-warning",
    iconBgClass: "bg-warning/10 text-warning",
    targets: [{ position: Position.Top }],
    sources: [{ position: Position.Bottom }],
  },
  condition: {
    icon: GitBranch,
    label: "Condition",
    description: "Branch logic",
    color: "warning",
    bgClass: "bg-card",
    borderClass: "border-warning",
    textClass: "text-warning",
    iconBgClass: "bg-warning/10 text-warning",
    targets: [{ position: Position.Top }],
    sources: [
      { position: Position.Bottom, id: "true", style: { left: "30%" } },
      { position: Position.Bottom, id: "false", style: { left: "70%" } },
    ],
  },
  parallel: {
    icon: Columns2,
    label: "Parallel",
    description: "Parallel exec",
    color: "info",
    bgClass: "bg-card",
    borderClass: "border-info",
    textClass: "text-info",
    iconBgClass: "bg-info/10 text-info",
    targets: [{ position: Position.Top }],
    sources: [
      { position: Position.Bottom, id: "out1", style: { left: "30%" } },
      { position: Position.Bottom, id: "out2", style: { left: "70%" } },
    ],
  },
  merge: {
    icon: Merge,
    label: "Merge",
    description: "Sync point",
    color: "info",
    bgClass: "bg-card",
    borderClass: "border-info",
    textClass: "text-info",
    iconBgClass: "bg-info/10 text-info",
    targets: [
      { position: Position.Top, id: "in1", style: { left: "30%" } },
      { position: Position.Top, id: "in2", style: { left: "70%" } },
    ],
    sources: [{ position: Position.Bottom }],
  },
  loop: {
    icon: Repeat,
    label: "Loop",
    description: "Iterative loop",
    color: "secondary",
    bgClass: "bg-card",
    borderClass: "border-secondary",
    textClass: "text-secondary-foreground",
    iconBgClass: "bg-secondary text-secondary-foreground",
    targets: [{ position: Position.Top }],
    sources: [{ position: Position.Bottom }],
  },
  supervisor: {
    icon: Crown,
    label: "Supervisor",
    description: "Orchestrator agent",
    color: "warning",
    bgClass: "bg-card",
    borderClass: "border-warning",
    textClass: "text-warning",
    iconBgClass: "bg-warning/10 text-warning",
    targets: [{ position: Position.Top }],
    sources: [{ position: Position.Bottom }],
  },
};
