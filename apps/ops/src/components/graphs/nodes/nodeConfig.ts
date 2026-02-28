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
import type { NodeType } from "@modularmind/api-client";

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
    color: "emerald",
    bgClass: "bg-white",
    borderClass: "border-emerald-500",
    textClass: "text-emerald-700",
    iconBgClass: "bg-emerald-50 text-emerald-600",
    targets: [],
    sources: [{ position: Position.Bottom }],
  },
  end: {
    icon: Square,
    label: "End",
    description: "Exit point",
    color: "rose",
    bgClass: "bg-white",
    borderClass: "border-rose-500",
    textClass: "text-rose-700",
    iconBgClass: "bg-rose-50 text-rose-600",
    targets: [{ position: Position.Top }],
    sources: [],
  },
  agent: {
    icon: Bot,
    label: "Agent",
    description: "AI Agent",
    color: "blue",
    bgClass: "bg-white",
    borderClass: "border-blue-500",
    textClass: "text-blue-700",
    iconBgClass: "bg-blue-50 text-blue-600",
    targets: [{ position: Position.Top }],
    sources: [{ position: Position.Bottom }],
  },
  tool: {
    icon: Wrench,
    label: "Tool",
    description: "Tool call",
    color: "purple",
    bgClass: "bg-white",
    borderClass: "border-purple-500",
    textClass: "text-purple-700",
    iconBgClass: "bg-purple-50 text-purple-600",
    targets: [{ position: Position.Top }],
    sources: [{ position: Position.Bottom }],
  },
  subgraph: {
    icon: Workflow,
    label: "Subgraph",
    description: "Nested graph",
    color: "orange",
    bgClass: "bg-white",
    borderClass: "border-orange-500",
    textClass: "text-orange-700",
    iconBgClass: "bg-orange-50 text-orange-600",
    targets: [{ position: Position.Top }],
    sources: [{ position: Position.Bottom }],
  },
  condition: {
    icon: GitBranch,
    label: "Condition",
    description: "Branch logic",
    color: "amber",
    bgClass: "bg-white",
    borderClass: "border-amber-500",
    textClass: "text-amber-700",
    iconBgClass: "bg-amber-50 text-amber-600",
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
    color: "cyan",
    bgClass: "bg-white",
    borderClass: "border-cyan-500",
    textClass: "text-cyan-700",
    iconBgClass: "bg-cyan-50 text-cyan-600",
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
    color: "teal",
    bgClass: "bg-white",
    borderClass: "border-teal-500",
    textClass: "text-teal-700",
    iconBgClass: "bg-teal-50 text-teal-600",
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
    color: "indigo",
    bgClass: "bg-white",
    borderClass: "border-indigo-500",
    textClass: "text-indigo-700",
    iconBgClass: "bg-indigo-50 text-indigo-600",
    targets: [{ position: Position.Top }],
    sources: [{ position: Position.Bottom }],
  },
  supervisor: {
    icon: Crown,
    label: "Supervisor",
    description: "Orchestrator agent",
    color: "yellow",
    bgClass: "bg-white",
    borderClass: "border-yellow-500",
    textClass: "text-yellow-700",
    iconBgClass: "bg-yellow-50 text-yellow-600",
    targets: [{ position: Position.Top }],
    sources: [{ position: Position.Bottom }],
  },
};
