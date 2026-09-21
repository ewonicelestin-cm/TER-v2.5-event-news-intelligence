# Workflow & Scenario Builder Enhancement

This plan aims to transform the current mock-based `WorkflowEngine` into a functional orchestration engine capable of evaluating real-time market conditions and triggering actions based on user-defined workflows.

## User Review Required

> [!IMPORTANT]
> The current execution remains a "Dry Run" in the sense that it doesn't execute real trades on a broker, but it will now evaluate real market data instead of hardcoded `success = true`.

## Proposed Changes

### [Component] Workflow Engine

#### [MODIFY] [workflowEngine.ts](file:///C:/Users/pc/Downloads/TER-v3.3-workflow-scenario-builder/src/services/workflowEngine.ts)
- Implement `evaluateNode` to handle real logic for different node types:
    - `CONDITION`: Compare metrics (`SIGNAL_SCORE`, `PRICE`, etc.) against thresholds.
    - `LOGIC`: Handle `ALL` (AND) and `ANY` (OR) branching.
    - `ACTION`: Simulate actions like `RECORD_DECISION`.
    - `NOTIFICATION`: Integrate with `notificationEngine`.
- Update `runWorkflow` to use `evaluateNode` and follow edges based on evaluation results.

### [Component] Automation & Integration

#### [MODIFY] [automationEngine.ts](file:///C:/Users/pc/Downloads/TER-v3.3-workflow-scenario-builder/src/services/automationEngine.ts)
- Export `compare` and `metricValue` (or move to a shared utility) so `WorkflowEngine` can use them.

#### [MODIFY] [server/index.ts](file:///C:/Users/pc/Downloads/TER-v3.3-workflow-scenario-builder/server/index.ts)
- Update `/api/workflows/:id/run` to fetch latest market data and signals to provide a rich `inputContext` for the workflow run.

### [Component] UI Enhancements

#### [MODIFY] [App.tsx](file:///C:/Users/pc/Downloads/TER-v3.3-workflow-scenario-builder/src/App.tsx)
- Add a modal or form to allow creating custom workflows with different nodes and configurations instead of a single hardcoded template.
- Improve the "Tracing" view to show why a condition failed (e.g., "Score 65 < 70").

## Verification Plan

### Automated Tests
- `npm run build` to ensure no regressions in types.
- Manual triggers via the UI to verify that workflows correctly follow "TRUE" or "FALSE" paths based on current market data.

### Manual Verification
- Create a workflow that triggers on `SIGNAL_SCORE >= 90`.
- Run it on an asset with a high score and verify it reaches the notification node.
- Run it on an asset with a low score and verify it stops at the condition node.
