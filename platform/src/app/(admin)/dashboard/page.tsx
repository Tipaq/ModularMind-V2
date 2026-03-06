"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Server,
  Bot,
  GitFork,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { relativeTime } from "@modularmind/ui";
import { EngineStatusBadge as StatusBadge } from "@/components/EngineStatusBadge";

interface DashboardStats {
  clients: number;
  engines: { total: number; synced: number; registered: number; offline: number };
  agents: number;
  graphs: number;
  recentEngines: {
    id: string;
    name: string;
    status: string;
    lastSeen: string | null;
    client: { id: string; name: string };
  }[];
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  gradient,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  subtitle?: string;
  gradient: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border bg-card p-5 transition-all hover:shadow-md hover:border-primary/30"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${gradient}`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard/stats");
        if (res.ok) setStats(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Failed to load dashboard data.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Platform overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Clients"
          value={stats.clients}
          gradient="from-primary to-primary/60"
          href="/clients"
        />
        <StatCard
          icon={Server}
          label="Engines"
          value={stats.engines.total}
          subtitle={`${stats.engines.synced} synced`}
          gradient="from-info to-info/60"
          href="/engines"
        />
        <StatCard
          icon={Bot}
          label="Agents"
          value={stats.agents}
          gradient="from-success to-success/60"
          href="/agents"
        />
        <StatCard
          icon={GitFork}
          label="Graphs"
          value={stats.graphs}
          gradient="from-warning to-warning/60"
          href="/graphs"
        />
      </div>

      {/* Engine Health */}
      <section className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-3">
          <Server className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Engine Health</h2>
        </div>

        {stats.recentEngines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Server className="mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">No engines registered yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5">Engine</th>
                  <th className="px-5 py-2.5">Client</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5 hidden md:table-cell">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentEngines.map((engine) => (
                  <tr key={engine.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-2.5 font-medium">{engine.name}</td>
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/clients/${engine.client.id}`}
                        className="text-primary hover:underline"
                      >
                        {engine.client.name}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5">
                      <StatusBadge status={engine.status} />
                    </td>
                    <td className="px-5 py-2.5 hidden md:table-cell text-muted-foreground">
                      {engine.lastSeen ? relativeTime(engine.lastSeen) : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
