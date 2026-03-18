import { useSearchParams } from "react-router-dom";
import { LayoutDashboard, Play, Workflow, Bell, Server } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@modularmind/ui";
import { useMonitoringData } from "../hooks/useMonitoringData";
import { StatusBar } from "../components/monitoring/StatusBar";
import { OverviewTab } from "../components/monitoring/tabs/OverviewTab";
import { ExecutionsTab } from "../components/monitoring/tabs/ExecutionsTab";
import { PipelinesTab } from "../components/monitoring/tabs/PipelinesTab";
import { AlertsTab } from "../components/monitoring/tabs/AlertsTab";
import { InfraTab } from "../components/monitoring/tabs/InfraTab";

type TabId = "overview" | "executions" | "pipelines" | "alerts" | "infrastructure";

export default function Monitoring() {
  const [searchParams, setSearchParams] = useSearchParams();
  const TAB_IDS: TabId[] = ["overview", "executions", "pipelines", "alerts", "infrastructure"];
  const rawTab = searchParams.get("tab");
  const activeTab: TabId = TAB_IDS.includes(rawTab as TabId) ? (rawTab as TabId) : "overview";

  const setActiveTab = (tab: TabId) => {
    setSearchParams({ tab }, { replace: true });
  };

  const data = useMonitoringData();
  const { monitoring, pipeline, llmGpu, liveExecutions, pipelinesDetail, agentMetrics, lastUpdated, refetchAll } = data;

  const alerts = monitoring?.alerts.active_alerts ?? [];
  const dlqMessages = pipelinesDetail?.dlq_messages ?? [];

  return (
    <div className="space-y-5">
      {/* Status Bar */}
      <StatusBar
        monitoring={monitoring}
        liveExecutions={liveExecutions}
        lastUpdated={lastUpdated}
        onRefresh={refetchAll}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutDashboard className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="executions" className="gap-1.5">
            <Play className="h-4 w-4" />
            Executions
            {liveExecutions && liveExecutions.total_active > 0 && (
              <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success leading-none">
                {liveExecutions.total_active}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pipelines">
            <Workflow className="h-4 w-4" />
            Pipelines
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <Bell className="h-4 w-4" />
            Alerts
            {alerts.length > 0 && (
              <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive leading-none">
                {alerts.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="infrastructure">
            <Server className="h-4 w-4" />
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
