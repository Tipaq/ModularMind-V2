import {
  ChatMessages, ChatInput, ChatErrorBanner, ApprovalCard,
} from "@modularmind/ui";
import { ConversationProvider } from "../contexts/ConversationContext";
import { ChatHeader } from "../components/chat/ChatHeader";
import { ChatRightPanels } from "../components/chat/ChatRightPanels";
import { useChatPage } from "../hooks/useChatPage";

export function ChatPage() {
  const state = useChatPage();

  return (
    <ConversationProvider value={state.conversationContextValue}>
      <div className="flex h-full w-full">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ChatHeader
            title={state.activeTitle}
            runningActivityLabel={state.runningActivityLabel}
            latestTokenUsage={state.latestTokenUsage}
            rightPanel={state.rightPanel}
            onTogglePanel={state.togglePanel}
            projectId={state.projectId}
          />

          <ChatErrorBanner
            error={state.error}
            crudError={state.crudError}
            onDismiss={state.clearError}
            onRetry={state.regenerateLastMessage}
          />

          <ChatMessages
            messages={state.messages}
            isStreaming={state.isStreaming}
            activities={state.activities}
            showRoutingMetadata
            approvalDecision={state.approvalDecision}
            onRegenerate={state.regenerateLastMessage}
            onEditMessage={state.editMessage}
            onArtifactDetected={state.handleArtifactDetected}
            selectedMessageId={state.selectedMessageId}
            onSelectMessage={state.setSelectedMessageId}
            stickyFooter={
              state.pendingApproval ? (
                <div className="px-4 py-3">
                  <ApprovalCard
                    key={state.pendingApproval.promptId || state.pendingApproval.approvalId || state.pendingApproval.nodeId}
                    approval={state.pendingApproval}
                    onApprove={state.approveExecution}
                    onReject={state.rejectExecution}
                    onRespond={state.respondToPrompt}
                  />
                </div>
              ) : (
                <ChatInput
                  value={state.inputValue}
                  onChange={state.setInputValue}
                  onSend={state.handleSend}
                  isStreaming={state.isStreaming}
                  onCancel={state.cancelStream}
                  agents={state.agents}
                  graphs={state.graphs}
                  enabledAgentIds={state.enabledAgentIds}
                  enabledGraphIds={state.enabledGraphIds}
                  onToggleAgent={state.handleToggleAgent}
                  onToggleGraph={state.handleToggleGraph}
                  onFilesChange={state.setAttachedFiles}
                  disabledReason={state.disabledReason}
                  models={state.models}
                  selectedModelId={state.effectiveModelId}
                  onModelChange={state.handleModelChange}
                  modelLabel={state.modelLabel}
                  onCompact={state.handleCompact}
                  compactDisabled={state.isCompactDisabled}
                />
              )
            }
          />
        </div>

        <ChatRightPanels
          rightPanel={state.rightPanel}
          onCloseArtifacts={state.handleCloseRightPanel}
          insightsProps={{
            selectedExecution: state.selectedExecution,
            liveActivities: state.activities,
            isStreaming: state.isStreaming,
            isLiveSelected: state.isLiveSelected,
            config: state.insightsConfig,
            onConfigChange: state.handleConfigChange,
            models: state.models,
            supervisorLayers: state.supervisorLayers ?? [],
            onUpdateLayer: state.updateSupervisorLayer ?? (async () => false),
            selectedModelContextWindow: state.selectedModel?.context_window ?? null,
            enabledAgents: state.enabledAgents,
            enabledGraphs: state.enabledGraphs,
            allAgents: state.agents,
            allGraphs: state.graphs,
            onCompact: state.activeConversationId ? state.handleCompact : undefined,
          }}
          artifactProps={{
            artifacts: state.artifacts,
            selectedArtifactId: state.selectedArtifactId,
            selectedArtifact: state.selectedArtifact,
            onSelectArtifact: state.selectArtifact,
          }}
        />
      </div>
    </ConversationProvider>
  );
}

export default ChatPage;
