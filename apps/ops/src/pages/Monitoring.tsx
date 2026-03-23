import { useSearchParams } from "react-router-dom";
import { Activity, LayoutDashboard, Play, Workflow, Bell, Server } from "lucide-react";
import { PageHeader, Tabs, TabsList, TabsTrigger, TabsContent } from "@modularmind/ui";
import { useMonitoringData } from "../hooks/useMonitoringData";
import { StatusBar } from "../components/monitoring/StatusBar";
import { OverviewTab } from "../components/monitoring/tabs/OverviewTab";
import { ExecutionsTab } from "../components/monitoring/tabs/ExecutionsTab";
import { PipelinesTab } from "../components/monitoring/tabs/PipelinesTab";
import { AlertsTab } from "../components/monitoring/tabs/AlertsTab";
import { InfraTab } from "../components/monitoring/tabs/InfraTab";

type TabId = "overview" | "executions" | "pipelines" | "alerts" | "infrastructure";

const TAB_IDS: TabId[] = ["overview", "executions", "pipelines", "alerts", "infrastructure"];

export function Monitoring() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: TabId = TAB_IDS.includes(rawTab as TabId) ? (rawTab as TabId) : "overview";

  const data = useMonitoringData();
  const { monitoring, pipeline, llmGpu, liveExecutions, pipelinesDetail, agentMetrics, lastUpdated, refetchAll } = data;

  const alerts = monitoring?.alerts.active_alerts ?? [];
  const dlqMessages = pipelinesDetail?.dlq_messages ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Activity}
        gradient="from-success to-success/70"
        title="Monitoring"
        description="System health, executions, pipelines, and infrastructure"
      />

      <StatusBar
        monitoring={monitoring}
        liveExecutions={liveExecutions}
        lastUpdated={lastUpdated}
        onRefresh={refetchAll}
      />

      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="executions" className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            Executions
            {liveExecutions && liveExecutions.total_active > 0 && (
              <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success leading-none">
                {liveExecutions.total_active}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pipelines" className="gap-1.5">
            <Workflow className="h-3.5 w-3.5" />
            Pipelines
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Alerts
            {alerts.length > 0 && (
              <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive leading-none">
                {alerts.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="infrastructure" className="gap-1.5">
            <Server className="h-3.5 w-3.5" />
            Infrastructure
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab data={data} />
        </TabsContent>

        <TabsContent value="executions" className="mt-6">
          <ExecutionsTab
            liveExecutions={liveExecutions}
            agentMetrics={agentMetrics}
            dlqMessages={dlqMessages}
            onRefresh={refetchAll}
          />
        </TabsContent>

        <TabsContent value="pipelines" className="mt-6">
          <PipelinesTab
            pipelines={pipelinesDetail}
            pipeline={pipeline}
            dlqMessages={dlqMessages}
            onRefresh={refetchAll}
          />
        </TabsContent>

        <TabsContent value="alerts" className="mt-6">
          <AlertsTab alerts={alerts} />
        </TabsContent>

        <TabsContent value="infrastructure" className="mt-6">
          <InfraTab
            monitoring={monitoring}
            llmGpu={llmGpu}
            pipeline={pipeline}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
