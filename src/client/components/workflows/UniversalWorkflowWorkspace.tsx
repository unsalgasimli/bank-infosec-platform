import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  Braces,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  Clock3,
  Code2,
  Copy,
  Diamond,
  GitBranch,
  Grid3X3,
  Layers3,
  Loader2,
  Maximize2,
  Network,
  PanelLeft,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Split,
  Square,
  TestTube2,
  TimerReset,
  Trash2,
  Undo2,
  Users,
  Workflow,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  FormFieldDefinition,
  RequestTypeDefinition,
  SimulationResult,
  WorkflowCatalogTemplate,
  WorkflowEdgeDefinition,
  WorkflowNodeDefinition,
  WorkflowNodeType,
  WorkflowVersion,
} from "../../../shared/types/orchestration.js";
import { useAuth } from "../../context/AuthContext.js";

type WorkspaceTab = "CATALOG" | "BUILDER" | "EXECUTIONS" | "ANALYTICS";
type CatalogPayload = {
  sections: Array<{ name: string; templates: WorkflowCatalogTemplate[] }>;
  templates: WorkflowCatalogTemplate[];
  requestTypes: RequestTypeDefinition[];
};
type TemplateDetail = {
  template: WorkflowCatalogTemplate;
  definition: any;
  version: WorkflowVersion;
  preflight: any;
};
type RuntimeExecution = any;

const nodePalette: Array<{
  group: string;
  type: WorkflowNodeType;
  label: string;
  icon: React.ElementType;
  color: string;
}> = [
  {
    group: "Human work",
    type: "TASK",
    label: "Task",
    icon: Square,
    color: "#2563EB",
  },
  {
    group: "Human work",
    type: "APPROVAL",
    label: "Approval",
    icon: ShieldCheck,
    color: "#7C3AED",
  },
  {
    group: "Human work",
    type: "INFORMATION_REQUEST",
    label: "Information request",
    icon: Send,
    color: "#0F766E",
  },
  {
    group: "Flow control",
    type: "CONDITION",
    label: "Condition",
    icon: Diamond,
    color: "#D97706",
  },
  {
    group: "Flow control",
    type: "PARALLEL_SPLIT",
    label: "Parallel split",
    icon: Split,
    color: "#0891B2",
  },
  {
    group: "Flow control",
    type: "PARALLEL_JOIN",
    label: "Parallel join",
    icon: GitBranch,
    color: "#0891B2",
  },
  {
    group: "Flow control",
    type: "WAIT_TIMER",
    label: "Wait / timer",
    icon: Clock3,
    color: "#EA580C",
  },
  {
    group: "Flow control",
    type: "MILESTONE",
    label: "Milestone",
    icon: Layers3,
    color: "#475569",
  },
  {
    group: "Flow control",
    type: "SUBWORKFLOW",
    label: "Subworkflow",
    icon: Network,
    color: "#4F46E5",
  },
  {
    group: "Automation",
    type: "SYSTEM_ACTION",
    label: "System action",
    icon: Braces,
    color: "#0284C7",
  },
  {
    group: "Automation",
    type: "INTEGRATION_ACTION",
    label: "Integration action",
    icon: Boxes,
    color: "#0284C7",
  },
  {
    group: "Automation",
    type: "NOTIFICATION",
    label: "Notification",
    icon: Bell,
    color: "#0284C7",
  },
  {
    group: "Termination",
    type: "SUCCESS_END",
    label: "Success end",
    icon: CheckCircle2,
    color: "#16A34A",
  },
  {
    group: "Termination",
    type: "REJECTED_END",
    label: "Rejected end",
    icon: CircleStop,
    color: "#DC2626",
  },
  {
    group: "Termination",
    type: "FAILED_END",
    label: "Failed end",
    icon: AlertCircle,
    color: "#B91C1C",
  },
];

const apiError = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false)
    throw new Error(payload.error || fallback);
  return payload;
};

const localCondition = (
  condition: any,
  values: Record<string, any>,
): boolean => {
  if (!condition) return true;
  const evaluate = (entry: any): boolean => {
    if (entry.clauses)
      return entry.combinator === "ANY"
        ? entry.clauses.some(evaluate)
        : entry.clauses.every(evaluate);
    const left =
      entry.left?.source === "LITERAL"
        ? entry.left.value
        : String(entry.left?.path || "")
            .split(".")
            .reduce((value: any, key: string) => value?.[key], values);
    const right =
      entry.right?.source === "LITERAL"
        ? entry.right.value
        : String(entry.right?.path || "")
            .split(".")
            .reduce((value: any, key: string) => value?.[key], values);
    if (entry.operator === "EQUALS") return left === right;
    if (entry.operator === "NOT_EQUALS") return left !== right;
    if (entry.operator === "EXISTS")
      return left !== undefined && left !== null && left !== "";
    if (entry.operator === "IN")
      return Array.isArray(right) && right.includes(left);
    return true;
  };
  return evaluate(condition);
};

export const UniversalWorkflowWorkspace: React.FC<{
  onRefreshTickets?: () => void;
}> = ({ onRefreshTickets }) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const [tab, setTab] = useState<WorkspaceTab>(() => {
    const stored = sessionStorage.getItem(
      "orchestration-workspace-tab",
    ) as WorkspaceTab | null;
    sessionStorage.removeItem("orchestration-workspace-tab");
    return stored &&
      ["CATALOG", "BUILDER", "EXECUTIONS", "ANALYTICS"].includes(stored)
      ? stored
      : "CATALOG";
  });
  const [catalog, setCatalog] = useState<CatalogPayload>({
    sections: [],
    templates: [],
    requestTypes: [],
  });
  const [instances, setInstances] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateDetail | null>(null);
  const [selectedExecution, setSelectedExecution] =
    useState<RuntimeExecution | null>(null);
  const [launchRequestType, setLaunchRequestType] =
    useState<RequestTypeDefinition | null>(null);
  const [launchForm, setLaunchForm] = useState<any>(null);
  const [launchValues, setLaunchValues] = useState<Record<string, any>>({});
  const [launching, setLaunching] = useState(false);

  const [builderDefinition, setBuilderDefinition] = useState<any>(null);
  const [builderVersion, setBuilderVersion] = useState<WorkflowVersion | null>(
    null,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [connectFrom, setConnectFrom] = useState<string>("");
  const [connectionDraft, setConnectionDraft] = useState<{
    sourceNodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
  const [zoom, setZoom] = useState(0.8);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [collapsedStageIds, setCollapsedStageIds] = useState<string[]>([]);
  const [clipboardNodes, setClipboardNodes] = useState<
    WorkflowNodeDefinition[]
  >([]);
  const [nodeSearch, setNodeSearch] = useState("");
  const [history, setHistory] = useState<WorkflowVersion[]>([]);
  const [future, setFuture] = useState<WorkflowVersion[]>([]);
  const [preflight, setPreflight] = useState<any>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [builderBusy, setBuilderBusy] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panOrigin = useRef<{
    pointerX: number;
    pointerY: number;
    panX: number;
    panY: number;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [catalogResponse, instanceResponse, analyticsResponse] =
        await Promise.all([
          fetchWithAuth(
            `/api/orchestration/catalog${query ? `?q=${encodeURIComponent(query)}` : ""}`,
          ),
          fetchWithAuth("/api/orchestration/instances"),
          fetchWithAuth("/api/orchestration/analytics"),
        ]);
      const [catalogData, instanceData, analyticsData] = await Promise.all([
        apiError(catalogResponse, "Catalog failed"),
        apiError(instanceResponse, "Runtime list failed"),
        apiError(analyticsResponse, "Analytics failed"),
      ]);
      setCatalog(catalogData);
      setInstances(instanceData.instances || []);
      setAnalytics(analyticsData.analytics || null);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (tab === "BUILDER" && !builderVersion) {
      setBuilderDefinition(blankDefinition(currentUser?.id || ""));
      setBuilderVersion(blankWorkflow(currentUser?.id || ""));
      setSelectedStageId("stage-main");
    }
  }, [tab, builderVersion, currentUser?.id]);
  useEffect(() => {
    if (!query) return;
    const timeout = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const openTemplate = async (
    template: WorkflowCatalogTemplate,
    target: "PREVIEW" | "BUILDER" = "PREVIEW",
  ) => {
    setError("");
    try {
      const response = await fetchWithAuth(
        `/api/orchestration/catalog/${template.id}`,
      );
      const detail = (await apiError(
        response,
        "Template preview failed",
      )) as TemplateDetail;
      setSelectedTemplate(detail);
      if (target === "BUILDER") {
        setBuilderDefinition(detail.definition);
        setBuilderVersion(structuredClone(detail.version));
        setSelectedStageId(detail.version.stages[0]?.id || "");
        setSelectedNodeId(detail.version.nodes[0]?.id || "");
        setSelectedNodeIds(
          detail.version.nodes[0]?.id ? [detail.version.nodes[0].id] : [],
        );
        setHistory([]);
        setFuture([]);
        setPreflight(detail.preflight);
        setSimulation(null);
        setTab("BUILDER");
      }
    } catch (reason: any) {
      setError(reason.message);
    }
  };

  const openLaunch = async (template: WorkflowCatalogTemplate) => {
    const requestType =
      catalog.requestTypes.find(
        (item) => item.workflowDefinitionId === template.workflowDefinitionId,
      ) ||
      catalog.requestTypes.find((item) => item.id === "request-standard-task")!;
    setLaunchRequestType(requestType);
    setLaunchValues({ summary: "", requesterId: currentUser?.id || "" });
    try {
      const response = await fetchWithAuth(
        `/api/orchestration/request-types/${requestType.id}/form`,
      );
      setLaunchForm(await apiError(response, "Intake form failed"));
    } catch (reason: any) {
      setError(reason.message);
      setLaunchRequestType(null);
    }
  };

  const cloneTemplate = async (template: WorkflowCatalogTemplate) => {
    setError("");
    try {
      const response = await fetchWithAuth(
        `/api/orchestration/catalog/${template.id}/clone`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "CLONE" }),
        },
      );
      const cloned = await apiError(response, "Template clone failed");
      setBuilderDefinition(cloned.definition);
      setBuilderVersion(cloned.version);
      setSelectedStageId(cloned.version.stages[0]?.id || "");
      setSelectedNodeId(cloned.version.nodes[0]?.id || "");
      setSelectedNodeIds(
        cloned.version.nodes[0]?.id ? [cloned.version.nodes[0].id] : [],
      );
      setHistory([]);
      setFuture([]);
      setPreflight(cloned.preflight);
      setSimulation(null);
      setSelectedTemplate(null);
      setTab("BUILDER");
    } catch (reason: any) {
      setError(reason.message);
    }
  };

  const submitLaunch = async () => {
    if (!selectedTemplate && launchRequestType?.id !== "request-standard-task")
      return;
    setLaunching(true);
    setError("");
    try {
      const template =
        selectedTemplate?.template ||
        catalog.templates.find(
          (item) =>
            item.workflowDefinitionId ===
            launchRequestType?.workflowDefinitionId,
        );
      const endpoint = template
        ? `/api/orchestration/catalog/${template.id}/launch`
        : "/api/orchestration/quick-work";
      const body = template
        ? {
            context: {
              ...launchValues,
              requesterId: launchValues.requesterId || currentUser?.id,
            },
            requestTypeId: launchRequestType?.id,
            idempotencyKey: `ui-${cryptoRandom()}`,
          }
        : {
            requestTypeId: launchRequestType?.id,
            values: {
              ...launchValues,
              requesterId: launchValues.requesterId || currentUser?.id,
            },
            idempotencyKey: `ui-${cryptoRandom()}`,
          };
      const response = await fetchWithAuth(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await apiError(response, "Workflow launch failed");
      setLaunchRequestType(null);
      setLaunchForm(null);
      setLaunchValues({});
      await load();
      const executionResponse = await fetchWithAuth(
        `/api/orchestration/instances/${result.instance.id}`,
      );
      const executionData = await apiError(
        executionResponse,
        "Execution failed",
      );
      setSelectedExecution(executionData.execution);
      setTab("EXECUTIONS");
      onRefreshTickets?.();
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setLaunching(false);
    }
  };

  const openExecution = async (id: string) => {
    setError("");
    try {
      const response = await fetchWithAuth(
        `/api/orchestration/instances/${id}`,
      );
      const data = await apiError(response, "Execution failed");
      setSelectedExecution(data.execution);
      setTab("EXECUTIONS");
    } catch (reason: any) {
      setError(reason.message);
    }
  };

  const completeWorkItem = async (workItemId: string) => {
    if (!selectedExecution) return;
    try {
      const response = await fetchWithAuth(
        `/api/orchestration/instances/${selectedExecution.instance.id}/work-items/${workItemId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            output: { completedFrom: "runtime-workspace" },
          }),
        },
      );
      const data = await apiError(response, "Work item completion failed");
      setSelectedExecution(data.execution);
      await load();
    } catch (reason: any) {
      setError(reason.message);
    }
  };

  const requeueDeadLetter = async (deadLetterId: string) => {
    if (!selectedExecution) return;
    try {
      const response = await fetchWithAuth(
        `/api/orchestration/instances/${selectedExecution.instance.id}/dead-letters/${deadLetterId}/requeue`,
        { method: "POST" },
      );
      const data = await apiError(response, "Action retry failed");
      setSelectedExecution(data.execution);
      await load();
    } catch (reason: any) {
      setError(reason.message);
    }
  };

  const commitBuilder = (next: WorkflowVersion) => {
    if (builderVersion)
      setHistory((items) => [
        ...items.slice(-29),
        structuredClone(builderVersion),
      ]);
    setFuture([]);
    setBuilderVersion(next);
  };
  const undo = () => {
    if (!builderVersion || !history.length) return;
    const previous = history[history.length - 1];
    setFuture((items) => [structuredClone(builderVersion), ...items]);
    setHistory((items) => items.slice(0, -1));
    setBuilderVersion(structuredClone(previous));
  };
  const redo = () => {
    if (!builderVersion || !future.length) return;
    const next = future[0];
    setHistory((items) => [...items, structuredClone(builderVersion)]);
    setFuture((items) => items.slice(1));
    setBuilderVersion(structuredClone(next));
  };

  const addNode = (type: WorkflowNodeType, x = 300, y = 160) => {
    if (!builderVersion) return;
    const palette = nodePalette.find((item) => item.type === type)!;
    const id = `node-${type.toLowerCase()}-${Date.now()}`;
    const stageId = selectedStageId || builderVersion.stages[0]?.id;
    const nextNode: WorkflowNodeDefinition = {
      id,
      key: id,
      type,
      title: palette?.label || type,
      stageId,
      position: { x, y },
      ...(type === "TASK"
        ? { assignment: { strategy: "UNASSIGNED_TEAM_QUEUE" as const } }
        : {}),
      ...(type === "APPROVAL"
        ? {
            approval: {
              approverSource: "ROLE" as const,
              approvalMode: "ANY_ONE" as const,
              role: "APPROVER" as const,
              timeoutMinutes: 480,
              reminderMinutes: 120,
              commentsMandatoryOnReject: true,
              allowDelegation: true,
              preventSelfApproval: true,
            },
          }
        : {}),
      ...(type === "PARALLEL_JOIN"
        ? { join: { strategy: "ALL" as const } }
        : {}),
      ...(type === "WAIT_TIMER"
        ? {
            timer: {
              mode: "DURATION" as const,
              durationMinutes: 60,
              businessCalendarId: "calendar-bank-baku",
            },
          }
        : {}),
    };
    const stages = builderVersion.stages.map((item) =>
      item.id === stageId ? { ...item, nodeIds: [...item.nodeIds, id] } : item,
    );
    commitBuilder({
      ...builderVersion,
      nodes: [...builderVersion.nodes, nextNode],
      stages,
    });
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
  };

  const updateNode = (patch: Partial<WorkflowNodeDefinition>) => {
    if (!builderVersion || !selectedNodeId) return;
    commitBuilder({
      ...builderVersion,
      nodes: builderVersion.nodes.map((item) =>
        item.id === selectedNodeId ? { ...item, ...patch } : item,
      ),
    });
  };
  const removeNode = () => {
    if (!builderVersion || (!selectedNodeId && !selectedNodeIds.length)) return;
    const ids = new Set(
      selectedNodeIds.length ? selectedNodeIds : [selectedNodeId],
    );
    commitBuilder({
      ...builderVersion,
      nodes: builderVersion.nodes.filter((item) => !ids.has(item.id)),
      edges: builderVersion.edges.filter(
        (item) =>
          !ids.has(item.sourceNodeId) && !ids.has(item.destinationNodeId),
      ),
      stages: builderVersion.stages.map((item) => ({
        ...item,
        nodeIds: item.nodeIds.filter((nodeId) => !ids.has(nodeId)),
      })),
    });
    setSelectedNodeId("");
    setSelectedNodeIds([]);
  };
  const duplicateNode = () => {
    if (!builderVersion) return;
    const sources = builderVersion.nodes.filter((item) =>
      (selectedNodeIds.length ? selectedNodeIds : [selectedNodeId]).includes(
        item.id,
      ),
    );
    if (!sources.length) return;
    const suffix = Date.now();
    const copies = sources.map((source, index) => {
      const id = `${source.id}-copy-${suffix}-${index}`;
      return {
        ...structuredClone(source),
        id,
        key: id,
        title: `${source.title} copy`,
        position: { x: source.position.x + 40, y: source.position.y + 40 },
      };
    });
    commitBuilder({
      ...builderVersion,
      nodes: [...builderVersion.nodes, ...copies],
      stages: builderVersion.stages.map((stage) => ({
        ...stage,
        nodeIds: [
          ...stage.nodeIds,
          ...copies
            .filter((copy) => copy.stageId === stage.id)
            .map((copy) => copy.id),
        ],
      })),
    });
    setSelectedNodeId(copies[0].id);
    setSelectedNodeIds(copies.map((copy) => copy.id));
  };
  const connectNodes = (sourceNodeId: string, destinationNodeId: string) => {
    if (!builderVersion) return false;
    const source = builderVersion.nodes.find((node) => node.id === sourceNodeId);
    const destination = builderVersion.nodes.find(
      (node) => node.id === destinationNodeId,
    );
    if (!source || !destination || sourceNodeId === destinationNodeId) return false;
    if (source.type.endsWith("_END")) {
      setError("Terminal nodes cannot have an outgoing connection.");
      return false;
    }
    if (destination.type === "START") {
      setError("The Start node cannot have an incoming connection.");
      return false;
    }
    if (
      builderVersion.edges.some(
        (edge) =>
          edge.sourceNodeId === sourceNodeId &&
          edge.destinationNodeId === destinationNodeId,
      )
    ) {
      setError("These two nodes are already connected.");
      return false;
    }

    const outgoing = builderVersion.edges.filter(
      (edge) => edge.sourceNodeId === sourceNodeId,
    );
    let outcome: string | undefined;
    let branchLabel: string | undefined;
    if (source.type === "CONDITION") {
      if (!outgoing.some((edge) => edge.outcome === "TRUE")) {
        outcome = "TRUE";
        branchLabel = "True";
      } else if (!outgoing.some((edge) => edge.outcome === "FALSE")) {
        outcome = "FALSE";
        branchLabel = "False";
      } else {
        setError(
          "A condition can have one True and one False connection. Remove or edit an existing branch first.",
        );
        return false;
      }
    }
    const nextEdge: WorkflowEdgeDefinition = {
      id: `edge-${sourceNodeId}-${destinationNodeId}-${Date.now()}`,
      sourceNodeId,
      destinationNodeId,
      dependencyType: "FINISH_TO_START",
      outcome,
      branchLabel,
    };
    commitBuilder({ ...builderVersion, edges: [...builderVersion.edges, nextEdge] });
    setSelectedEdgeId(nextEdge.id);
    setConnectFrom("");
    setConnectionDraft(null);
    return true;
  };
  const beginConnection = (
    event: React.PointerEvent<HTMLButtonElement>,
    nodeId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!builderVersion) return;
    const source = builderVersion.nodes.find((node) => node.id === nodeId);
    if (!source || source.type.endsWith("_END")) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (event.clientX - rect.left - pan.x) / zoom;
    const y = (event.clientY - rect.top - pan.y) / zoom;
    setConnectFrom(nodeId);
    setConnectionDraft({ sourceNodeId: nodeId, x, y });
    setSelectedNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
  };
  const finishConnection = (destinationNodeId: string) => {
    const sourceNodeId = connectionDraft?.sourceNodeId || connectFrom;
    if (!sourceNodeId) return;
    connectNodes(sourceNodeId, destinationNodeId);
  };
  const cancelConnection = () => {
    setConnectFrom("");
    setConnectionDraft(null);
  };
  const removeSelectedEdge = () => {
    if (!builderVersion || !selectedEdgeId) return;
    commitBuilder({
      ...builderVersion,
      edges: builderVersion.edges.filter((edge) => edge.id !== selectedEdgeId),
    });
    setSelectedEdgeId("");
  };
  const autoLayout = () => {
    if (!builderVersion) return;
    const nodes = builderVersion.nodes.map((item, index) => ({
      ...item,
      position: {
        x: 100 + (index % 5) * 240,
        y: 100 + Math.floor(index / 5) * 150,
      },
    }));
    commitBuilder({ ...builderVersion, nodes });
  };

  const selectNode = (nodeId: string, additive = false) => {
    setSelectedNodeId(nodeId);
    setSelectedNodeIds((current) =>
      additive
        ? current.includes(nodeId)
          ? current.filter((id) => id !== nodeId)
          : [...current, nodeId]
        : [nodeId],
    );
  };
  const copySelection = () => {
    if (!builderVersion) return;
    const ids = selectedNodeIds.length
      ? selectedNodeIds
      : selectedNodeId
        ? [selectedNodeId]
        : [];
    setClipboardNodes(
      builderVersion.nodes
        .filter((node) => ids.includes(node.id))
        .map((node) => structuredClone(node)),
    );
  };
  const pasteSelection = () => {
    if (!builderVersion || !clipboardNodes.length) return;
    const suffix = Date.now();
    const copies = clipboardNodes.map((source, index) => {
      const id = `${source.id}-paste-${suffix}-${index}`;
      return {
        ...structuredClone(source),
        id,
        key: id,
        position: { x: source.position.x + 60, y: source.position.y + 60 },
      };
    });
    commitBuilder({
      ...builderVersion,
      nodes: [...builderVersion.nodes, ...copies],
      stages: builderVersion.stages.map((stage) => ({
        ...stage,
        nodeIds: [
          ...stage.nodeIds,
          ...copies
            .filter((copy) => copy.stageId === stage.id)
            .map((copy) => copy.id),
        ],
      })),
    });
    setSelectedNodeId(copies[0].id);
    setSelectedNodeIds(copies.map((copy) => copy.id));
  };
  const alignSelection = (axis: "HORIZONTAL" | "VERTICAL") => {
    if (!builderVersion || selectedNodeIds.length < 2) return;
    const selected = builderVersion.nodes.filter((node) =>
      selectedNodeIds.includes(node.id),
    );
    const anchor =
      axis === "HORIZONTAL"
        ? selected.reduce((sum, node) => sum + node.position.y, 0) /
          selected.length
        : selected.reduce((sum, node) => sum + node.position.x, 0) /
          selected.length;
    commitBuilder({
      ...builderVersion,
      nodes: builderVersion.nodes.map((node) =>
        !selectedNodeIds.includes(node.id)
          ? node
          : {
              ...node,
              position: {
                x:
                  axis === "VERTICAL"
                    ? Math.round(anchor / 20) * 20
                    : Math.round(node.position.x / 20) * 20,
                y:
                  axis === "HORIZONTAL"
                    ? Math.round(anchor / 20) * 20
                    : Math.round(node.position.y / 20) * 20,
              },
            },
      ),
    });
  };
  const fitToScreen = () => {
    if (!builderVersion?.nodes.length || !canvasRef.current) {
      setZoom(0.8);
      setPan({ x: 0, y: 0 });
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const minX = Math.min(
      ...builderVersion.nodes.map((node) => node.position.x),
    );
    const minY = Math.min(
      ...builderVersion.nodes.map((node) => node.position.y),
    );
    const maxX = Math.max(
      ...builderVersion.nodes.map((node) => node.position.x + 180),
    );
    const maxY = Math.max(
      ...builderVersion.nodes.map((node) => node.position.y + 90),
    );
    const nextZoom = Math.max(
      0.35,
      Math.min(
        1.2,
        (rect.width - 100) / Math.max(1, maxX - minX),
        (rect.height - 100) / Math.max(1, maxY - minY),
      ),
    );
    setZoom(nextZoom);
    setPan({ x: 50 - minX * nextZoom, y: 50 - minY * nextZoom });
  };
  const toggleStage = (stageId: string) =>
    setCollapsedStageIds((current) =>
      current.includes(stageId)
        ? current.filter((id) => id !== stageId)
        : [...current, stageId],
    );

  // Keep the pointer interaction independent of native HTML drag events. This
  // lets an author either drag an output port onto any node or click an output
  // port and then an input port. The edge is committed only after the target
  // passes the same graph checks used by the API pre-flight.
  useEffect(() => {
    if (!connectionDraft) return;
    const move = (event: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setConnectionDraft((draft) =>
        draft
          ? {
              ...draft,
              x: (event.clientX - rect.left - pan.x) / zoom,
              y: (event.clientY - rect.top - pan.y) / zoom,
            }
          : null,
      );
    };
    const complete = (event: PointerEvent) => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const node = element?.closest<HTMLElement>("[data-workflow-node-id]");
      const targetNodeId = node?.dataset.workflowNodeId;
      if (targetNodeId && targetNodeId !== connectionDraft.sourceNodeId) {
        finishConnection(targetNodeId);
        return;
      }
      // Releasing on the source port keeps a click-to-connect draft open;
      // releasing anywhere else cancels it so a stale line is never saved.
      if (!targetNodeId) cancelConnection();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", complete);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", complete);
    };
  }, [connectionDraft?.sourceNodeId, pan.x, pan.y, zoom]);

  useEffect(() => {
    if (tab !== "BUILDER") return;
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]'))
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        redo();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        copySelection();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "v"
      ) {
        event.preventDefault();
        pasteSelection();
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        (selectedNodeId || selectedNodeIds.length)
      ) {
        event.preventDefault();
        removeNode();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        duplicateNode();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    tab,
    builderVersion,
    selectedNodeId,
    selectedNodeIds,
    clipboardNodes,
    history,
    future,
  ]);

  const saveDraft = async () => {
    if (!builderVersion) return;
    setBuilderBusy(true);
    setError("");
    try {
      const payload = {
        workflowDefinitionId: builderDefinition?.id,
        definition: builderDefinition,
        version: { ...builderVersion, status: "DRAFT" },
      };
      const response = await fetchWithAuth(
        "/api/orchestration/definitions/drafts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await apiError(response, "Draft save failed");
      setBuilderDefinition(data.definition);
      setBuilderVersion(data.version);
      setPreflight(data.preflight);
      setHistory([]);
      setFuture([]);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setBuilderBusy(false);
    }
  };
  const testWorkflow = async () => {
    if (!builderDefinition || !builderVersion) return;
    setBuilderBusy(true);
    try {
      const response = await fetchWithAuth(
        `/api/orchestration/definitions/${builderDefinition.id}/simulate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: builderVersion.version,
            context: {
              summary: "Test Workflow",
              requesterId: currentUser?.id,
              employeeId: "test-employee",
              departmentId: "dept-core",
              managerId: currentUser?.id,
              location: "Baku HQ",
              startDate: "2026-09-01T05:00:00.000Z",
              remote: true,
              privilegedRole: true,
              risk: "HIGH",
              change: { risk: "HIGH" },
            },
          }),
        },
      );
      const data = await apiError(response, "Simulation failed");
      setSimulation(data.simulation);
      setPreflight(data.simulation.preflight);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setBuilderBusy(false);
    }
  };
  const publish = async () => {
    if (!builderDefinition || !builderVersion) return;
    setBuilderBusy(true);
    try {
      const response = await fetchWithAuth(
        `/api/orchestration/definitions/${builderDefinition.id}/versions/${builderVersion.version}/publish`,
        { method: "POST" },
      );
      const data = await apiError(response, "Publish failed");
      setBuilderVersion(data.version);
      setPreflight(data.preflight);
      await load();
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setBuilderBusy(false);
    }
  };

  const selectedNode = builderVersion?.nodes.find(
    (item) => item.id === selectedNodeId,
  );
  const selectedEdge = builderVersion?.edges.find(
    (item) => item.id === selectedEdgeId,
  );
  const updateSelectedEdge = (patch: Partial<WorkflowEdgeDefinition>) => {
    if (!builderVersion || !selectedEdgeId) return;
    commitBuilder({
      ...builderVersion,
      edges: builderVersion.edges.map((edge) =>
        edge.id === selectedEdgeId ? { ...edge, ...patch } : edge,
      ),
    });
  };
  const visibleNodes =
    builderVersion?.nodes.filter(
      (item) =>
        !collapsedStageIds.includes(item.stageId || "") &&
        (!nodeSearch ||
          item.title.toLowerCase().includes(nodeSearch.toLowerCase())),
    ) || [];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F4F6FB] text-[#162136]">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E6F7EF] text-[#007860]">
            <Workflow className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold">
              Universal Work Orchestration
            </h1>
            <p className="text-xs text-slate-500">
              One engine for requests, work items, approvals, automations, and
              long-running enterprise processes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setLaunchRequestType(
                catalog.requestTypes.find(
                  (item) => item.id === "request-standard-task",
                ) || null,
              );
              setLaunchValues({
                summary: "",
                description: "",
                requesterId: currentUser?.id || "",
              });
              const request = catalog.requestTypes.find(
                (item) => item.id === "request-standard-task",
              );
              if (request)
                void fetchWithAuth(
                  `/api/orchestration/request-types/${request.id}/form`,
                )
                  .then((res) => apiError(res, "Form failed"))
                  .then(setLaunchForm);
            }}
            className="wrike-btn-secondary flex items-center gap-2 px-3 py-2"
          >
            <Plus className="h-4 w-4" /> Quick Work Item
          </button>
          <button
            onClick={() => {
              const workflow = blankWorkflow(currentUser?.id || "");
              setBuilderDefinition(blankDefinition(currentUser?.id || ""));
              setBuilderVersion(workflow);
              setSelectedStageId("stage-main");
              setSelectedNodeId("node-start");
              setSelectedNodeIds(["node-start"]);
              setTab("BUILDER");
            }}
            className="wrike-btn-primary flex items-center gap-2 px-3 py-2"
          >
            <Sparkles className="h-4 w-4" /> Create Workflow
          </button>
        </div>
      </header>

      <nav className="flex h-12 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-6">
        {(
          [
            ["CATALOG", "Workflow Catalog", Boxes],
            ["BUILDER", "Workflow Builder", GitBranch],
            ["EXECUTIONS", "Running Work", Activity],
            ["ANALYTICS", "Analytics", BarChart3],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex h-full items-center gap-2 border-b-2 px-4 text-sm font-semibold ${tab === value ? "border-[#00B259] text-[#007860]" : "border-transparent text-slate-500 hover:text-slate-900"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
        <button
          onClick={() => void load()}
          className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </nav>

      {error && (
        <div className="mx-6 mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button onClick={() => setError("")} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#00B259]" />
          Loading orchestration platform…
        </div>
      ) : tab === "CATALOG" ? (
        <CatalogView
          catalog={catalog}
          query={query}
          setQuery={setQuery}
          onPreview={(item: WorkflowCatalogTemplate) => void openTemplate(item)}
          onLaunch={(item: WorkflowCatalogTemplate) => {
            setSelectedTemplate(null);
            void openLaunch(item);
          }}
          onEdit={(item: WorkflowCatalogTemplate) =>
            void openTemplate(item, "BUILDER")
          }
          onClone={(item: WorkflowCatalogTemplate) => void cloneTemplate(item)}
        />
      ) : tab === "BUILDER" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 text-xs">
            <span className="font-semibold text-slate-500">
              Workflow Catalog
            </span>
            <ArrowRight className="h-3 w-3 text-slate-300" />
            <input
              value={builderDefinition?.name || ""}
              onChange={(event) =>
                setBuilderDefinition((current: any) => ({
                  ...(current || {}),
                  name: event.target.value,
                }))
              }
              className="w-52 rounded border border-transparent px-2 py-1 font-semibold outline-none hover:border-slate-200 focus:border-blue-300"
              placeholder="Workflow name"
            />
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={undo}
                disabled={!history.length}
                className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                onClick={redo}
                disabled={!future.length}
                className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30"
              >
                <Undo2 className="h-4 w-4 scale-x-[-1]" />
              </button>
              <button
                onClick={saveDraft}
                disabled={builderBusy}
                className="wrike-btn-secondary flex items-center gap-1.5 px-3 py-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                Save Draft
              </button>
              <button
                onClick={testWorkflow}
                disabled={!builderDefinition || builderBusy}
                className="wrike-btn-secondary flex items-center gap-1.5 px-3 py-1.5"
              >
                <TestTube2 className="h-3.5 w-3.5" />
                Test
              </button>
              <button
                onClick={publish}
                disabled={
                  !builderDefinition ||
                  !builderVersion ||
                  builderVersion.status === "PUBLISHED" ||
                  preflight?.summary?.errors > 0 ||
                  builderBusy
                }
                className="wrike-btn-primary flex items-center gap-1.5 px-3 py-1.5"
              >
                <Rocket className="h-3.5 w-3.5" />
                Publish
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
            <aside className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3">
              <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-[11px] font-bold">
                <button className="rounded bg-white px-2 py-1.5 shadow-xs">
                  Nodes
                </button>
                <button className="px-2 py-1.5 text-slate-500">Stages</button>
                <button className="px-2 py-1.5 text-slate-500">
                  Variables
                </button>
              </div>
              {builderVersion?.stages.length ? (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Stage visibility
                  </div>
                  {builderVersion.stages.map((stage) => (
                    <button
                      key={stage.id}
                      onClick={() => {
                        setSelectedStageId(stage.id);
                        toggleStage(stage.id);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] hover:bg-white"
                    >
                      <ChevronDown
                        className={`h-3 w-3 transition ${collapsedStageIds.includes(stage.id) ? "-rotate-90" : ""}`}
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {stage.title}
                      </span>
                      <span className="text-slate-400">
                        {stage.nodeIds.length}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {[...new Set(nodePalette.map((item) => item.group))].map(
                (group) => (
                  <div key={group} className="mb-4">
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {group}
                    </div>
                    <div className="space-y-1">
                      {nodePalette
                        .filter((item) => item.group === group)
                        .map((item) => (
                          <button
                            key={item.type}
                            draggable
                            onDragStart={(event) =>
                              event.dataTransfer.setData(
                                "workflow-node-type",
                                item.type,
                              )
                            }
                            onClick={() => addNode(item.type)}
                            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs font-semibold hover:border-slate-300 hover:bg-slate-50"
                          >
                            <item.icon
                              className="h-4 w-4"
                              style={{ color: item.color }}
                            />
                            {item.label}
                            <Plus className="ml-auto h-3 w-3 text-slate-300" />
                          </button>
                        ))}
                    </div>
                  </div>
                ),
              )}
            </aside>
            <div
              className="relative min-w-0 flex-1 cursor-grab overflow-hidden bg-[#F8FAFC] active:cursor-grabbing"
              ref={canvasRef}
              onPointerDown={(event) => {
                if (
                  (event.target as HTMLElement).closest(
                    '[data-workflow-node="true"],button,input',
                  )
                )
                  return;
                panOrigin.current = {
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  panX: pan.x,
                  panY: pan.y,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!panOrigin.current) return;
                setPan({
                  x:
                    panOrigin.current.panX +
                    event.clientX -
                    panOrigin.current.pointerX,
                  y:
                    panOrigin.current.panY +
                    event.clientY -
                    panOrigin.current.pointerY,
                });
              }}
              onPointerUp={(event) => {
                panOrigin.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const type = event.dataTransfer.getData(
                  "workflow-node-type",
                ) as WorkflowNodeType;
                const rect = canvasRef.current?.getBoundingClientRect();
                if (type && rect)
                  addNode(
                    type,
                    (event.clientX - rect.left - pan.x) / zoom,
                    (event.clientY - rect.top - pan.y) / zoom,
                  );
              }}
            >
              <div
                className="absolute inset-0 opacity-60"
                style={{
                  backgroundImage:
                    "radial-gradient(#CBD5E1 1px, transparent 1px)",
                  backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                }}
              />
              <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <Search className="ml-1 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={nodeSearch}
                  onChange={(event) => setNodeSearch(event.target.value)}
                  placeholder="Find node"
                  className="w-28 border-0 px-1 py-1 text-xs outline-none"
                />
                <button
                  onClick={autoLayout}
                  className="rounded p-1.5 hover:bg-slate-100"
                  title="Auto-layout"
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setZoom((value) => Math.min(1.4, value + 0.1))}
                  className="rounded p-1.5 hover:bg-slate-100"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  onClick={() =>
                    setZoom((value) => Math.max(0.45, value - 0.1))
                  }
                  className="rounded p-1.5 hover:bg-slate-100"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setZoom(0.8)}
                  className="rounded p-1.5 hover:bg-slate-100"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
              <div className="absolute left-3 top-14 z-20 flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  onClick={copySelection}
                  disabled={!selectedNodeIds.length && !selectedNodeId}
                  className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30"
                  title="Copy selection (Ctrl+C)"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={pasteSelection}
                  disabled={!clipboardNodes.length}
                  className="rounded px-2 py-1.5 text-[10px] font-bold hover:bg-slate-100 disabled:opacity-30"
                  title="Paste (Ctrl+V)"
                >
                  Paste
                </button>
                <button
                  onClick={() => alignSelection("HORIZONTAL")}
                  disabled={selectedNodeIds.length < 2}
                  className="rounded px-2 py-1.5 text-[10px] font-bold hover:bg-slate-100 disabled:opacity-30"
                >
                  Align H
                </button>
                <button
                  onClick={() => alignSelection("VERTICAL")}
                  disabled={selectedNodeIds.length < 2}
                  className="rounded px-2 py-1.5 text-[10px] font-bold hover:bg-slate-100 disabled:opacity-30"
                >
                  Align V
                </button>
                <button
                  onClick={fitToScreen}
                  className="rounded px-2 py-1.5 text-[10px] font-bold hover:bg-slate-100"
                >
                  Fit
                </button>
              </div>
              {builderVersion && (
                <div
                  className="absolute left-0 top-0 h-[1200px] w-[4200px] origin-top-left"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  }}
                >
                  <svg className="absolute inset-0 h-full w-full overflow-visible">
                    <defs>
                      <marker
                        id="workflow-edge-arrow"
                        markerWidth="8"
                        markerHeight="8"
                        refX="7"
                        refY="4"
                        orient="auto"
                      >
                        <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
                      </marker>
                    </defs>
                    {builderVersion.edges.map((workflowEdge) => {
                      const from = builderVersion.nodes.find(
                        (item) => item.id === workflowEdge.sourceNodeId,
                      );
                      const to = builderVersion.nodes.find(
                        (item) => item.id === workflowEdge.destinationNodeId,
                      );
                      if (!from || !to) return null;
                      const x1 = from.position.x + 180,
                        y1 = from.position.y + 45,
                        x2 = to.position.x,
                        y2 = to.position.y + 45;
                      return (
                        <g key={workflowEdge.id}>
                          <path
                            d={`M ${x1} ${y1} C ${x1 + 55} ${y1}, ${x2 - 55} ${y2}, ${x2} ${y2}`}
                            fill="none"
                            stroke={selectedEdgeId === workflowEdge.id ? "#00B259" : "#94A3B8"}
                            strokeWidth={selectedEdgeId === workflowEdge.id ? "4" : "2"}
                            markerEnd="url(#workflow-edge-arrow)"
                            className="pointer-events-auto cursor-pointer"
                            style={{ color: selectedEdgeId === workflowEdge.id ? "#00B259" : "#64748B" }}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedEdgeId(workflowEdge.id);
                              setSelectedNodeId("");
                              setSelectedNodeIds([]);
                            }}
                          />
                          <circle cx={x2} cy={y2} r="4" fill="#64748B" />
                          {workflowEdge.branchLabel && (
                            <text
                              x={(x1 + x2) / 2}
                              y={(y1 + y2) / 2 - 8}
                              textAnchor="middle"
                              className="fill-slate-500 text-[11px] font-bold"
                            >
                              {workflowEdge.branchLabel}
                            </text>
                          )}
                        </g>
                      );
                    })}
                    {connectionDraft && (() => {
                      const source = builderVersion.nodes.find(
                        (item) => item.id === connectionDraft.sourceNodeId,
                      );
                      if (!source) return null;
                      const x1 = source.position.x + 180;
                      const y1 = source.position.y + 45;
                      const x2 = connectionDraft.x;
                      const y2 = connectionDraft.y;
                      return (
                        <path
                          d={`M ${x1} ${y1} C ${x1 + 55} ${y1}, ${x2 - 55} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke="#00B259"
                          strokeDasharray="7 5"
                          strokeWidth="3"
                          markerEnd="url(#workflow-edge-arrow)"
                          className="pointer-events-none"
                          style={{ color: "#00B259" }}
                        />
                      );
                    })()}
                  </svg>
                  {visibleNodes.map((workflowNode) => {
                    const palette = nodePalette.find(
                      (item) => item.type === workflowNode.type,
                    );
                    const Icon = palette?.icon || Workflow;
                    const route = workflowNode.assignment?.groupId
                      ? workflowNode.assignment.groupId
                          .replace("team-", "")
                          .replaceAll("-", " ")
                      : workflowNode.approval?.approvalMode;
                    const selected =
                      selectedNodeIds.includes(workflowNode.id) ||
                      selectedNodeId === workflowNode.id;
                    return (
                      <div
                        key={workflowNode.id}
                        data-workflow-node="true"
                        data-workflow-node-id={workflowNode.id}
                        draggable
                        onDragEnd={(event) => {
                          const rect =
                            canvasRef.current?.getBoundingClientRect();
                          if (!rect || !builderVersion) return;
                          const x = Math.max(
                            0,
                            Math.round(
                              ((event.clientX - rect.left - pan.x) / zoom -
                                90) /
                                20,
                            ) * 20,
                          );
                          const y = Math.max(
                            0,
                            Math.round(
                              ((event.clientY - rect.top - pan.y) / zoom - 45) /
                                20,
                            ) * 20,
                          );
                          if (
                            selectedNodeIds.length > 1 &&
                            selectedNodeIds.includes(workflowNode.id)
                          ) {
                            const dx = x - workflowNode.position.x;
                            const dy = y - workflowNode.position.y;
                            commitBuilder({
                              ...builderVersion,
                              nodes: builderVersion.nodes.map((node) =>
                                selectedNodeIds.includes(node.id)
                                  ? {
                                      ...node,
                                      position: {
                                        x: Math.max(0, node.position.x + dx),
                                        y: Math.max(0, node.position.y + dy),
                                      },
                                    }
                                  : node,
                              ),
                            });
                          } else {
                            setSelectedNodeId(workflowNode.id);
                            setSelectedNodeIds([workflowNode.id]);
                            commitBuilder({
                              ...builderVersion,
                              nodes: builderVersion.nodes.map((node) =>
                                node.id === workflowNode.id
                                  ? { ...node, position: { x, y } }
                                  : node,
                              ),
                            });
                          }
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectNode(
                            workflowNode.id,
                            event.shiftKey || event.ctrlKey || event.metaKey,
                          );
                        }}
                        className={`absolute w-[180px] rounded-xl border-2 bg-white p-3 shadow-sm transition ${selected ? "border-[#00B259] shadow-md ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-300"}`}
                        style={{
                          left: workflowNode.position.x,
                          top: workflowNode.position.y,
                        }}
                      >
                        {workflowNode.type !== "START" && (
                          <button
                            type="button"
                            aria-label={`Connect into ${workflowNode.title}`}
                            className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-slate-400 transition hover:scale-110 hover:bg-[#00B259]"
                            title={
                              connectFrom
                                ? `Connect ${connectFrom} to ${workflowNode.title}`
                                : "Input port"
                            }
                            onPointerDown={(event) => {
                              event.stopPropagation();
                            }}
                          />
                        )}
                        <div className="flex items-start gap-2">
                          <div
                            className="rounded-lg p-1.5"
                            style={{
                              backgroundColor: `${palette?.color || "#64748B"}18`,
                              color: palette?.color,
                            }}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-bold">
                              {workflowNode.title}
                            </div>
                            <div className="mt-0.5 truncate text-[10px] capitalize text-slate-500">
                              {route ||
                                workflowNode.type
                                  .replaceAll("_", " ")
                                  .toLowerCase()}
                            </div>
                            {workflowNode.timeoutMinutes && (
                              <div className="mt-1 text-[10px] font-semibold text-amber-600">
                                Due: {workflowNode.timeoutMinutes}m
                              </div>
                            )}
                          </div>
                        </div>
                        {(!workflowNode.type.endsWith("_END")) && (
                        <button
                          type="button"
                          data-workflow-output-port="true"
                          aria-label={`Connect from ${workflowNode.title}`}
                          onPointerDown={(event) => beginConnection(event, workflowNode.id)}
                          className={`absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white ${connectFrom === workflowNode.id ? "bg-[#00B259]" : "bg-slate-400"}`}
                          title="Drag to another node, or click then choose an input port"
                        />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="absolute bottom-3 left-3 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-500 shadow-sm">
                {builderVersion?.nodes.length || 0} nodes ·{" "}
                {builderVersion?.edges.length || 0} edges ·{" "}
                {Math.round(zoom * 100)}%
              </div>
              {connectionDraft && (
                <div className="absolute bottom-12 left-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-800 shadow-sm">
                  Connecting from {builderVersion?.nodes.find((node) => node.id === connectionDraft.sourceNodeId)?.title || "node"}
                  <button
                    type="button"
                    onClick={cancelConnection}
                    className="rounded p-0.5 hover:bg-emerald-100"
                    aria-label="Cancel connection"
                    title="Cancel connection"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="absolute bottom-3 right-3 h-24 w-40 overflow-hidden rounded-lg border border-slate-300 bg-white/95 p-2 shadow-lg">
                <div className="relative h-full w-full bg-slate-50">
                  {builderVersion?.nodes.map((item) => (
                    <span
                      key={item.id}
                      className="absolute h-1.5 w-2.5 rounded-sm bg-slate-500"
                      style={{
                        left: `${Math.min(94, item.position.x / 35)}%`,
                        top: `${Math.min(90, item.position.y / 10)}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4">
              {selectedNode ? (
                <NodeInspector
                  node={selectedNode}
                  onChange={updateNode}
                  onDuplicate={duplicateNode}
                  onRemove={removeNode}
                />
              ) : selectedEdge ? (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800">Connection</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {builderVersion?.nodes.find((node) => node.id === selectedEdge.sourceNodeId)?.title || selectedEdge.sourceNodeId}
                        {" → "}
                        {builderVersion?.nodes.find((node) => node.id === selectedEdge.destinationNodeId)?.title || selectedEdge.destinationNodeId}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeSelectedEdge}
                      className="rounded-md p-2 text-red-600 hover:bg-red-50"
                      title="Remove connection"
                      aria-label="Remove connection"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <label className="mb-3 block text-[11px] font-semibold text-slate-600">
                    Branch label
                    <input
                      value={selectedEdge.branchLabel || ""}
                      onChange={(event) =>
                        updateSelectedEdge({ branchLabel: event.target.value || undefined })
                      }
                      placeholder="Optional label"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-emerald-500"
                    />
                  </label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
                    Connections run finish-to-start. Branch outcomes are determined by the source node and validated before publishing.
                  </div>
                </div>
              ) : (
                <div className="flex h-40 flex-col items-center justify-center text-center text-xs text-slate-400">
                  <PanelLeft className="mb-2 h-7 w-7" />
                  Select a node to configure it.
                </div>
              )}
              <div className="mt-6 border-t border-slate-200 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Pre-flight
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${preflight?.summary?.errors ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}
                  >
                    {preflight
                      ? `${preflight.summary.errors} Errors`
                      : "Save to validate"}
                  </span>
                </div>
                {preflight?.issues?.slice(0, 8).map((issue: any) => (
                  <button
                    key={`${issue.code}-${issue.nodeId}`}
                    onClick={() => {
                      if (!issue.nodeId) return;
                      setSelectedNodeId(issue.nodeId);
                      setSelectedNodeIds([issue.nodeId]);
                    }}
                    className="mb-1.5 flex w-full gap-2 rounded-lg border border-slate-200 p-2 text-left text-[11px]"
                  >
                    <span
                      className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${issue.severity === "ERROR" ? "bg-red-500" : issue.severity === "WARNING" ? "bg-amber-500" : "bg-blue-500"}`}
                    />
                    <span>{issue.message}</span>
                  </button>
                ))}
              </div>
              {simulation && (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-blue-800">
                    <Play className="h-4 w-4" />
                    Dry-run execution preview
                  </div>
                  <div className="space-y-1 text-[11px] text-blue-900">
                    <div>
                      {simulation.selectedNodeIds.length} nodes selected
                    </div>
                    <div>
                      {simulation.assignments.length} assignments resolved
                    </div>
                    <div>{simulation.approvals.length} approval chains</div>
                    <div>
                      {simulation.actions.length} external actions suppressed
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      ) : tab === "EXECUTIONS" ? (
        <RuntimeView
          instances={instances}
          execution={selectedExecution}
          onOpen={(id: string) => void openExecution(id)}
          onComplete={(id: string) => void completeWorkItem(id)}
          onRetry={(id: string) => void requeueDeadLetter(id)}
        />
      ) : (
        <AnalyticsView analytics={analytics} />
      )}

      {selectedTemplate && tab === "CATALOG" && !launchRequestType && (
        <TemplatePreview
          detail={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onLaunch={() => void openLaunch(selectedTemplate.template)}
          onEdit={() => void openTemplate(selectedTemplate.template, "BUILDER")}
          onClone={() => void cloneTemplate(selectedTemplate.template)}
        />
      )}
      {launchRequestType && launchForm && (
        <DynamicIntakeModal
          requestType={launchRequestType}
          form={launchForm}
          values={launchValues}
          setValues={setLaunchValues}
          onClose={() => {
            setLaunchRequestType(null);
            setLaunchForm(null);
          }}
          onSubmit={() => void submitLaunch()}
          busy={launching}
        />
      )}
    </div>
  );
};

const CatalogView = ({
  catalog,
  query,
  setQuery,
  onPreview,
  onLaunch,
  onEdit,
  onClone,
}: any) => (
  <div className="flex-1 overflow-y-auto p-6">
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold">Workflow Catalog</h2>
          <p className="mt-1 text-sm text-slate-500">
            Start governed work from a published, immutable workflow version.
          </p>
        </div>
        <label className="flex w-80 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workflows, domains, owners, nodes…"
            className="w-full border-0 bg-transparent text-sm outline-none"
          />
        </label>
      </div>
      {catalog.sections.map((section: any) => (
        <section key={section.name} className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-bold">{section.name}</h3>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {section.templates.length}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {section.templates.map((template: WorkflowCatalogTemplate) => (
              <article
                key={template.id}
                className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E6F7EF] text-[#007860]">
                    <Workflow className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold">
                      {template.title}
                    </h4>
                    <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-slate-500">
                      {template.purpose}
                    </p>
                  </div>
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    v{template.publishedWorkflowVersion}
                  </span>
                </div>
                <div className="my-4 grid grid-cols-5 gap-1 rounded-xl bg-slate-50 p-2 text-center">
                  <Metric
                    value={formatDuration(template.estimatedDurationMinutes)}
                    label="Duration"
                  />
                  <Metric value={template.stageCount} label="Stages" />
                  <Metric value={template.departmentCount} label="Teams" />
                  <Metric value={template.approvalCount} label="Approvals" />
                  <Metric value={template.automationCount} label="Auto" />
                </div>
                <div className="mb-3 flex items-center justify-between text-[10px] font-semibold text-slate-500">
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                    {template.domain.replaceAll("_", " ")}
                  </span>
                  <span>
                    {template.runCount.toLocaleString()} runs ·{" "}
                    {template.successRate}% success
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onPreview(template)}
                    className="wrike-btn-secondary flex-1 px-2 py-1.5 text-xs"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => onLaunch(template)}
                    className="wrike-btn-primary flex-1 px-2 py-1.5 text-xs"
                  >
                    Launch
                  </button>
                  <button
                    onClick={() => onClone(template)}
                    className="rounded-lg border border-slate-200 px-2.5 text-slate-500 hover:bg-slate-50"
                    title="Clone as an editable draft"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onEdit(template)}
                    className="rounded-lg border border-slate-200 px-2.5 text-slate-500 hover:bg-slate-50"
                    title="Open published definition"
                  >
                    <Code2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  </div>
);

const Metric = ({ value, label }: any) => (
  <div>
    <div className="text-xs font-bold text-slate-800">{value}</div>
    <div className="text-[9px] uppercase tracking-wide text-slate-400">
      {label}
    </div>
  </div>
);

const TemplatePreview = ({
  detail,
  onClose,
  onLaunch,
  onEdit,
  onClone,
}: any) => (
  <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30 backdrop-blur-[1px]">
    <div className="flex h-full w-[620px] flex-col bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-200 p-6">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[#007860]">
            {detail.template.category} · v{detail.version.version}
          </div>
          <h2 className="text-xl font-bold">{detail.template.title}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {detail.template.purpose}
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 grid grid-cols-5 gap-2 rounded-xl bg-slate-50 p-3">
          <Metric
            value={formatDuration(detail.template.estimatedDurationMinutes)}
            label="Duration"
          />
          <Metric value={detail.version.stages.length} label="Stages" />
          <Metric value={detail.template.departmentCount} label="Teams" />
          <Metric value={detail.template.approvalCount} label="Approvals" />
          <Metric value={detail.template.automationCount} label="Automations" />
        </div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
          Lifecycle stages
        </h3>
        <div className="space-y-2">
          {detail.version.stages.map((stage: any, index: number) => (
            <div
              key={stage.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold">
                {index + 1}
              </span>
              <div>
                <div className="text-sm font-bold">{stage.title}</div>
                <div className="text-xs text-slate-500">
                  {stage.nodeIds.length} activities ·{" "}
                  {stage.trigger.replaceAll("_", " ").toLowerCase()}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div
          className={`mt-6 rounded-xl border p-3 text-sm ${detail.preflight.valid ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
        >
          <div className="flex items-center gap-2 font-bold">
            {detail.preflight.valid ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            Pre-flight: {detail.preflight.summary.errors} errors ·{" "}
            {detail.preflight.summary.warnings} warnings ·{" "}
            {detail.preflight.summary.recommendations} recommendations
          </div>
        </div>
      </div>
      <footer className="flex gap-2 border-t border-slate-200 p-4">
        <button onClick={onEdit} className="wrike-btn-secondary flex-1 py-2">
          Open in Builder
        </button>
        <button onClick={onClone} className="wrike-btn-secondary flex-1 py-2">
          Clone Draft
        </button>
        <button onClick={onLaunch} className="wrike-btn-primary flex-1 py-2">
          Launch Workflow
        </button>
      </footer>
    </div>
  </div>
);

const DynamicIntakeModal = ({
  requestType,
  form,
  values,
  setValues,
  onClose,
  onSubmit,
  busy,
}: any) => {
  const sections = form.version.sections.filter((section: any) =>
    localCondition(section.visibilityCondition, values),
  );
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-[760px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#007860]">
              Quick Work Item · {requestType.domain.replaceAll("_", " ")}
            </div>
            <h2 className="mt-1 text-lg font-bold">{requestType.name}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {requestType.description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          {sections.map((section: any) => (
            <section key={section.id} className="mb-6">
              <h3 className="mb-1 text-sm font-bold">{section.title}</h3>
              {section.description && (
                <p className="mb-3 text-xs text-slate-500">
                  {section.description}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                {section.fields
                  .filter(
                    (formField: any) =>
                      formField.type !== "HIDDEN" &&
                      localCondition(formField.visibilityCondition, values),
                  )
                  .map((formField: any) => (
                    <DynamicField
                      key={formField.id}
                      field={formField}
                      value={values[formField.key]}
                      values={values}
                      required={
                        formField.required ||
                        (formField.requiredCondition &&
                          localCondition(formField.requiredCondition, values))
                      }
                      onChange={(value: any) =>
                        setValues((current: any) => ({
                          ...current,
                          [formField.key]: value,
                        }))
                      }
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
        <footer className="flex items-center justify-between border-t border-slate-200 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#007860]">
            <ShieldCheck className="h-4 w-4" />
            Routing, priority, calendar and targets resolve automatically.
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="wrike-btn-secondary px-4 py-2">
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={busy}
              className="wrike-btn-primary flex items-center gap-2 px-4 py-2"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Create
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

const DynamicField = ({
  field,
  value,
  values,
  required,
  onChange,
}: {
  field: FormFieldDefinition;
  value: any;
  values: Record<string, any>;
  required: boolean;
  onChange: (value: any) => void;
}) => {
  const full = [
    "RICH_TEXT",
    "TEXTAREA",
    "TABLE",
    "ATTACHMENTS",
    "EVIDENCE",
  ].includes(field.type);
  const options = field.dependsOnFieldKey
    ? field.options?.filter(
        (option) =>
          !option.parentValue ||
          option.parentValue === values[field.dependsOnFieldKey!],
      )
    : field.options;
  const readOnly = field.writable === false;
  return (
    <label className={full ? "col-span-2" : ""}>
      <span className="mb-1 block text-xs font-bold text-slate-700">
        {field.label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {field.description && (
        <span className="mb-1 block text-[11px] text-slate-500">
          {field.description}
        </span>
      )}
      {field.type === "CHECKBOX" ? (
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onChange(!value)}
          className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm ${value ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}
        >
          <span
            className={`flex h-4 w-4 items-center justify-center rounded border ${value ? "border-[#00B259] bg-[#00B259] text-white" : "border-slate-300"}`}
          >
            {value && <Check className="h-3 w-3" />}
          </span>
          {value ? "Yes" : "No"}
        </button>
      ) : ["SELECT", "RADIO", "MULTI_SELECT"].includes(field.type) &&
        options?.length ? (
        <select
          disabled={readOnly}
          multiple={field.type === "MULTI_SELECT"}
          value={field.type === "MULTI_SELECT" ? value || [] : value || ""}
          onChange={(event) =>
            onChange(
              field.type === "MULTI_SELECT"
                ? [...event.target.selectedOptions].map(
                    (option) => option.value,
                  )
                : event.target.value,
            )
          }
          className="wrike-input w-full"
        >
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : ["RICH_TEXT", "TEXTAREA", "TABLE"].includes(field.type) ? (
        <textarea
          readOnly={readOnly}
          value={
            typeof value === "string"
              ? value
              : value
                ? JSON.stringify(value)
                : ""
          }
          onChange={(event) => onChange(event.target.value)}
          rows={field.type === "TABLE" ? 4 : 3}
          placeholder={field.placeholder}
          className="wrike-input w-full resize-y"
        />
      ) : (
        <input
          readOnly={readOnly}
          type={
            field.type === "NUMBER" || field.type === "MONEY"
              ? "number"
              : field.type === "DATE"
                ? "date"
                : field.type === "DATETIME"
                  ? "datetime-local"
                  : "text"
          }
          value={value || ""}
          onChange={(event) =>
            onChange(
              field.type === "NUMBER"
                ? Number(event.target.value)
                : event.target.value,
            )
          }
          placeholder={field.placeholder}
          className="wrike-input w-full"
        />
      )}
    </label>
  );
};

const NodeInspector = ({ node, onChange, onDuplicate, onRemove }: any) => (
  <div>
    <div className="mb-4 flex items-center justify-between">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#007860]">
          {node.type.replaceAll("_", " ")}
        </div>
        <h3 className="text-sm font-bold">Node configuration</h3>
      </div>
      <div className="flex">
        <button
          onClick={onDuplicate}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          onClick={onRemove}
          className="rounded p-1.5 text-red-500 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
    <label className="mb-3 block">
      <span className="mini-label">Title</span>
      <input
        value={node.title}
        onChange={(event) => onChange({ title: event.target.value })}
        className="wrike-input mt-1 w-full"
      />
    </label>
    <label className="mb-3 block">
      <span className="mini-label">Description / instructions</span>
      <textarea
        value={node.description || ""}
        onChange={(event) => onChange({ description: event.target.value })}
        rows={3}
        className="wrike-input mt-1 w-full resize-y"
      />
    </label>
    {["TASK", "INFORMATION_REQUEST"].includes(node.type) && (
      <>
        <label className="mb-3 block">
          <span className="mini-label">Assignment strategy</span>
          <select
            value={node.assignment?.strategy || "UNASSIGNED_TEAM_QUEUE"}
            onChange={(event) =>
              onChange({
                assignment: {
                  ...(node.assignment || {}),
                  strategy: event.target.value,
                },
              })
            }
            className="wrike-input mt-1 w-full"
          >
            <option value="UNASSIGNED_TEAM_QUEUE">Unassigned team queue</option>
            <option value="ROLE_BASED">Role based</option>
            <option value="REQUESTER_MANAGER">Requester manager</option>
            <option value="EMPLOYEE_MANAGER">Employee manager</option>
            <option value="DEPARTMENT_OWNER">Department owner</option>
            <option value="SERVICE_OWNER">Service owner</option>
            <option value="APPLICATION_OWNER">Application owner</option>
            <option value="CI_OWNER">Configuration item owner</option>
            <option value="FIXED_GROUP">Fixed group</option>
            <option value="FIXED_PERSON">Fixed person</option>
            <option value="SKILL_BASED">Skill based</option>
            <option value="ROUND_ROBIN">Round robin</option>
            <option value="LOWEST_WORKLOAD">Lowest workload</option>
            <option value="ON_CALL">On-call roster</option>
            <option value="RULE_ENGINE">Rule engine</option>
          </select>
        </label>
        <label className="mb-3 block">
          <span className="mini-label">Assignment group ID</span>
          <input
            value={node.assignment?.groupId || ""}
            onChange={(event) =>
              onChange({
                assignment: {
                  ...(node.assignment || {}),
                  groupId: event.target.value,
                },
              })
            }
            className="wrike-input mt-1 w-full"
            placeholder="team-it-infra"
          />
        </label>
      </>
    )}
    {node.type === "APPROVAL" && (
      <>
        <label className="mb-3 block">
          <span className="mini-label">Approver source</span>
          <select
            value={node.approval?.approverSource || "ROLE"}
            onChange={(event) =>
              onChange({
                approval: {
                  ...node.approval,
                  approverSource: event.target.value,
                },
              })
            }
            className="wrike-input mt-1 w-full"
          >
            {[
              "SPECIFIC_USER",
              "ROLE",
              "REQUESTER_MANAGER",
              "MANAGERS_MANAGER",
              "DEPARTMENT_HEAD",
              "SERVICE_OWNER",
              "APPLICATION_OWNER",
              "ASSET_OWNER",
              "CI_OWNER",
              "CAB_BOARD",
              "DYNAMIC_EXPRESSION",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="mb-3 block">
          <span className="mini-label">Approval strategy</span>
          <select
            value={node.approval?.approvalMode || "ANY_ONE"}
            onChange={(event) =>
              onChange({
                approval: {
                  ...node.approval,
                  approvalMode: event.target.value,
                },
              })
            }
            className="wrike-input mt-1 w-full"
          >
            <option>ANY_ONE</option>
            <option>ALL</option>
            <option>MAJORITY</option>
            <option>N_OF_M</option>
            <option>SEQUENTIAL</option>
            <option>PARALLEL</option>
          </select>
        </label>
        <label className="mb-3 block">
          <span className="mini-label">Timeout (minutes)</span>
          <input
            type="number"
            value={node.approval?.timeoutMinutes || ""}
            onChange={(event) =>
              onChange({
                approval: {
                  ...node.approval,
                  timeoutMinutes: Number(event.target.value),
                },
              })
            }
            className="wrike-input mt-1 w-full"
          />
        </label>
        <label className="mb-3 block">
          <span className="mini-label">Reminder interval (minutes)</span>
          <input
            type="number"
            value={node.approval?.reminderMinutes || ""}
            onChange={(event) =>
              onChange({
                approval: {
                  ...node.approval,
                  reminderMinutes: Number(event.target.value),
                },
              })
            }
            className="wrike-input mt-1 w-full"
          />
        </label>
        <div className="mb-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600">
          {[
            ["commentsMandatoryOnReject", "Reject comment"],
            ["allowDelegation", "Delegation"],
            ["preventSelfApproval", "No self-approval"],
          ].map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 rounded-lg border border-slate-200 p-2"
            >
              <input
                type="checkbox"
                checked={Boolean(node.approval?.[key])}
                onChange={(event) =>
                  onChange({
                    approval: { ...node.approval, [key]: event.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </>
    )}
    {node.type === "WAIT_TIMER" && (
      <>
        <label className="mb-3 block">
          <span className="mini-label">Timer mode</span>
          <select
            value={node.timer?.mode || "DURATION"}
            onChange={(event) =>
              onChange({ timer: { ...node.timer, mode: event.target.value } })
            }
            className="wrike-input mt-1 w-full"
          >
            <option>DURATION</option>
            <option>ABSOLUTE</option>
            <option>CONTEXT_DATE_RELATIVE</option>
            <option>NEXT_BUSINESS_TIME</option>
          </select>
        </label>
        <label className="mb-3 block">
          <span className="mini-label">Duration / offset (minutes)</span>
          <input
            type="number"
            value={
              node.timer?.durationMinutes ?? node.timer?.offsetMinutes ?? ""
            }
            onChange={(event) =>
              onChange({
                timer: {
                  ...node.timer,
                  durationMinutes: Number(event.target.value),
                  offsetMinutes: Number(event.target.value),
                },
              })
            }
            className="wrike-input mt-1 w-full"
          />
        </label>
        {node.timer?.mode === "CONTEXT_DATE_RELATIVE" && (
          <label className="mb-3 block">
            <span className="mini-label">Context date path</span>
            <input
              value={node.timer?.datePath || ""}
              onChange={(event) =>
                onChange({
                  timer: { ...node.timer, datePath: event.target.value },
                })
              }
              className="wrike-input mt-1 w-full"
              placeholder="startDate"
            />
          </label>
        )}
      </>
    )}
    {node.type === "PARALLEL_JOIN" && (
      <>
        <label className="mb-3 block">
          <span className="mini-label">Join strategy</span>
          <select
            value={node.join?.strategy || "ALL"}
            onChange={(event) =>
              onChange({ join: { ...node.join, strategy: event.target.value } })
            }
            className="wrike-input mt-1 w-full"
          >
            <option>ALL</option>
            <option>ANY</option>
            <option>QUORUM</option>
            <option>N_OF_M</option>
          </select>
        </label>
        {["QUORUM", "N_OF_M"].includes(node.join?.strategy) && (
          <label className="mb-3 block">
            <span className="mini-label">Required branches</span>
            <input
              type="number"
              min="1"
              value={node.join?.requiredCount || ""}
              onChange={(event) =>
                onChange({
                  join: {
                    ...node.join,
                    requiredCount: Number(event.target.value),
                  },
                })
              }
              className="wrike-input mt-1 w-full"
            />
          </label>
        )}
      </>
    )}
    {[
      "SYSTEM_ACTION",
      "INTEGRATION_ACTION",
      "WEBHOOK_ACTION",
      "CREATE_RECORD",
    ].includes(node.type) && (
      <>
        <label className="mb-3 block">
          <span className="mini-label">Connector ID</span>
          <input
            value={node.action?.connectorId || ""}
            onChange={(event) =>
              onChange({
                action: {
                  ...(node.action || {}),
                  connectorId: event.target.value,
                },
              })
            }
            className="wrike-input mt-1 w-full"
            placeholder="connector-iam"
          />
        </label>
        <label className="mb-3 block">
          <span className="mini-label">Action key</span>
          <input
            value={node.action?.actionKey || ""}
            onChange={(event) =>
              onChange({
                action: {
                  ...(node.action || {}),
                  actionKey: event.target.value,
                },
              })
            }
            className="wrike-input mt-1 w-full"
            placeholder="PROVISION_ACCESS"
          />
        </label>
        <label className="mb-3 block">
          <span className="mini-label">Credential reference</span>
          <input
            value={node.action?.credentialReferenceId || ""}
            onChange={(event) =>
              onChange({
                action: {
                  ...(node.action || {}),
                  credentialReferenceId: event.target.value,
                },
              })
            }
            className="wrike-input mt-1 w-full"
            placeholder="cred-vault-iam-prod"
          />
        </label>
      </>
    )}
    {node.type === "CONDITION" && (
      <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mini-label mb-2">Safe condition builder</div>
        <div className="grid gap-2">
          <input
            value={node.condition?.clauses?.[0]?.left?.path || ""}
            onChange={(event) =>
              onChange({
                condition: {
                  combinator: "ALL",
                  clauses: [
                    {
                      left: { source: "CONTEXT", path: event.target.value },
                      operator:
                        node.condition?.clauses?.[0]?.operator || "EQUALS",
                      right: node.condition?.clauses?.[0]?.right || {
                        source: "LITERAL",
                        value: "",
                      },
                    },
                  ],
                },
              })
            }
            className="wrike-input"
            placeholder="Context path, e.g. risk"
          />
          <select
            value={node.condition?.clauses?.[0]?.operator || "EQUALS"}
            onChange={(event) =>
              onChange({
                condition: {
                  combinator: "ALL",
                  clauses: [
                    {
                      ...(node.condition?.clauses?.[0] || {
                        left: { source: "CONTEXT", path: "" },
                      }),
                      operator: event.target.value,
                      right: node.condition?.clauses?.[0]?.right || {
                        source: "LITERAL",
                        value: "",
                      },
                    },
                  ],
                },
              })
            }
            className="wrike-input"
          >
            <option>EQUALS</option>
            <option>NOT_EQUALS</option>
            <option>IN</option>
            <option>CONTAINS</option>
            <option>EXISTS</option>
            <option>GREATER_THAN</option>
            <option>LESS_THAN</option>
          </select>
          <input
            value={String(node.condition?.clauses?.[0]?.right?.value ?? "")}
            onChange={(event) =>
              onChange({
                condition: {
                  combinator: "ALL",
                  clauses: [
                    {
                      ...(node.condition?.clauses?.[0] || {
                        left: { source: "CONTEXT", path: "" },
                        operator: "EQUALS",
                      }),
                      right: { source: "LITERAL", value: event.target.value },
                    },
                  ],
                },
              })
            }
            className="wrike-input"
            placeholder="Comparison value"
          />
        </div>
      </div>
    )}
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">
      Node ID: <code>{node.id}</code>
      <br />
      Select the connection handle, then another node, to create a semantic
      edge.
    </div>
  </div>
);

const RuntimeView = ({ instances, execution, onOpen, onComplete, onRetry }: any) => (
  <div className="flex min-h-0 flex-1">
    <aside className="w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-bold">Workflow executions</h2>
      <div className="space-y-2">
        {instances.map((instance: any) => (
          <button
            key={instance.id}
            onClick={() => onOpen(instance.id)}
            className={`w-full rounded-xl border p-3 text-left ${execution?.instance?.id === instance.id ? "border-[#00B259] bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-700">
                {instance.key}
              </span>
              <StatusPill status={instance.status} />
            </div>
            <div className="mt-1 truncate text-sm font-semibold">
              {instance.title}
            </div>
            <div className="mt-1 text-[10px] uppercase text-slate-400">
              {instance.domain.replaceAll("_", " ")} · Workflow v
              {instance.workflowVersion}
            </div>
          </button>
        ))}
      </div>
    </aside>
    {execution ? (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <div className="text-xs font-bold text-blue-700">
                {execution.instance.key}
              </div>
              <h2 className="mt-1 text-xl font-bold">
                {execution.definition.name} — {execution.instance.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Pinned: Workflow v{execution.pinnedVersion.workflow} · Form v
                {execution.pinnedVersion.form || "—"} · Policy v
                {execution.pinnedVersion.policy}
              </p>
            </div>
            <StatusPill status={execution.instance.status} />
          </div>
          <div className="mb-6 grid grid-cols-5 gap-3">
            <RuntimeMetric
              label="Current stage"
              value={execution.currentStage?.title || "Complete"}
            />
            <RuntimeMetric
              label="Progress"
              value={`${execution.progress.completed} / ${execution.progress.total}`}
            />
            <RuntimeMetric
              label="Due"
              value={
                execution.slaClocks?.find((clock: any) =>
                  ["RUNNING", "AT_RISK"].includes(clock.status),
                )
                  ? new Date(
                      execution.slaClocks.find((clock: any) =>
                        ["RUNNING", "AT_RISK"].includes(clock.status),
                      ).targetAt,
                    ).toLocaleDateString()
                  : "No active clock"
              }
            />
            <RuntimeMetric
              label="Blockers"
              value={execution.blockers.length}
              alert={execution.blockers.length > 0}
            />
            <RuntimeMetric
              label="Approvals pending"
              value={execution.pendingApprovals}
              alert={execution.pendingApprovals > 0}
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 text-sm font-bold">Stage timeline</h3>
              <div className="space-y-1">
                {execution.stages.map((stage: any, index: number) => (
                  <div
                    key={stage.id}
                    className={`rounded-xl border p-3 ${stage.status === "CURRENT" ? "border-blue-200 bg-blue-50" : stage.status === "COMPLETED" ? "border-emerald-200 bg-emerald-50" : "border-slate-200"}`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full ${stage.status === "COMPLETED" ? "bg-emerald-600 text-white" : stage.status === "CURRENT" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}
                      >
                        {stage.status === "COMPLETED" ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <div className="flex-1">
                        <div className="text-sm font-bold">{stage.title}</div>
                        <div className="text-xs text-slate-500">
                          {stage.progressLabel}
                        </div>
                      </div>
                      {stage.status === "CURRENT" && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          Current
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <aside className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-bold">Active work</h3>
                <div className="space-y-2">
                  {execution.workItems
                    .filter(
                      (item: any) =>
                        !["COMPLETED", "CANCELLED"].includes(item.status),
                    )
                    .map((item: any) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200 p-3"
                      >
                        <div className="text-xs font-bold text-blue-700">
                          {item.key}
                        </div>
                        <div className="mt-1 text-sm font-semibold">
                          {item.title}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          {item.assignmentGroupId || "Workflow owner queue"} ·{" "}
                          {item.status}
                        </div>
                        <button
                          onClick={() => onComplete(item.id)}
                          className="wrike-btn-primary mt-3 w-full py-1.5 text-xs"
                        >
                          Mark complete
                        </button>
                      </div>
                    ))}
                  {!execution.workItems.some(
                    (item: any) =>
                      !["COMPLETED", "CANCELLED"].includes(item.status),
                  ) && (
                    <p className="text-xs text-slate-400">
                      No active human work.
                    </p>
                  )}
                </div>
              </section>
              {execution.deadLetters?.some((entry: any) => entry.status !== "RESOLVED") && <section className="rounded-2xl border border-red-200 bg-red-50 p-4"><h3 className="mb-3 text-sm font-bold text-red-800">Failed automation recovery</h3><div className="space-y-2">{execution.deadLetters.filter((entry: any) => entry.status !== "RESOLVED").map((entry: any) => <div key={entry.id} className="rounded-xl border border-red-200 bg-white p-3"><div className="text-xs font-bold">{entry.actionKey}</div><div className="mt-1 line-clamp-2 text-[10px] text-red-700">{entry.error}</div><button onClick={() => onRetry(entry.id)} className="wrike-btn-secondary mt-2 w-full py-1.5 text-xs">Requeue safely</button></div>)}</div></section>}
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold">Governed lifecycle</h3>
                  <span className="text-[10px] font-bold text-slate-400">
                    {execution.notifications?.length || 0} notices
                  </span>
                </div>
                <div className="space-y-2">
                  {execution.slaClocks?.map((clock: any) => (
                    <div
                      key={clock.id}
                      className="rounded-lg border border-slate-200 p-2"
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span>{clock.label}</span>
                        <StatusPill status={clock.status} />
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        Target {new Date(clock.targetAt).toLocaleString()} ·{" "}
                        {clock.elapsedMinutes}/{clock.targetMinutes}m
                      </div>
                    </div>
                  ))}
                  {!execution.slaClocks?.length && (
                    <p className="text-xs text-slate-400">
                      No SLA clocks attached.
                    </p>
                  )}
                </div>
                {execution.relations?.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="mini-label mb-2">Related work</div>
                    {execution.relations.slice(0, 5).map((relation: any) => (
                      <div
                        key={relation.id}
                        className="mb-1 text-[10px] text-slate-600"
                      >
                        <span className="font-bold">
                          {relation.relationType.replaceAll("_", " ")}
                        </span>{" "}
                        ·{" "}
                        {relation.targetId === execution.instance.id
                          ? relation.sourceId
                          : relation.targetId}
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-bold">
                  Immutable audit timeline
                </h3>
                <div className="max-h-72 space-y-3 overflow-y-auto">
                  {[...execution.events]
                    .reverse()
                    .slice(0, 20)
                    .map((event: any) => (
                      <div
                        key={event.id}
                        className="border-l-2 border-slate-200 pl-3"
                      >
                        <div className="text-[11px] font-bold">
                          {event.type.replaceAll("_", " ")}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(event.timestamp).toLocaleString()} ·{" "}
                          {event.actorName}
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    ) : (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        Select a workflow execution.
      </div>
    )}
  </div>
);

const AnalyticsView = ({ analytics }: any) => (
  <div className="flex-1 overflow-y-auto p-6">
    <div className="mx-auto max-w-6xl">
      <h2 className="text-xl font-bold">Workflow analytics</h2>
      <p className="mt-1 text-sm text-slate-500">
        Operational performance across workflow, stage, node, approval, and
        automation execution.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        <RuntimeMetric
          label="Executions"
          value={analytics?.workflowExecutions || 0}
        />
        <RuntimeMetric
          label="Completion rate"
          value={`${analytics?.completionRate || 0}%`}
        />
        <RuntimeMetric
          label="Average lead time"
          value={`${analytics?.averageLeadTimeMinutes || 0}m`}
        />
        <RuntimeMetric
          label="Automation success"
          value={`${analytics?.automationSuccessRate || 100}%`}
        />
        <RuntimeMetric
          label="Pending approvals"
          value={analytics?.pendingApprovals || 0}
        />
        <RuntimeMetric
          label="SLA attainment"
          value={`${analytics?.slaAttainmentRate ?? 100}%`}
        />
        <RuntimeMetric
          label="Approval latency"
          value={`${analytics?.averageApprovalLatencyMinutes || 0}m`}
        />
        <RuntimeMetric
          label="Rejection rate"
          value={`${analytics?.rejectionRate || 0}%`}
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-bold">Template adoption</h3>
          {analytics?.templateAdoption?.slice(0, 10).map((item: any) => (
            <div key={item.templateId} className="mb-3">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold">{item.title}</span>
                <span className="text-slate-500">{item.runCount} runs</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#00B259]"
                  style={{ width: `${Math.min(100, item.runCount / 5)}%` }}
                />
              </div>
            </div>
          ))}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-bold">Bottleneck nodes</h3>
          {analytics?.bottleneckNodes?.length ? (
            analytics.bottleneckNodes.map((item: any) => (
              <div
                key={item.nodeKey}
                className="flex items-center justify-between border-b border-slate-100 py-2 text-xs"
              >
                <span className="font-semibold">{item.nodeKey}</span>
                <span className="text-slate-500">
                  {item.averageDurationMinutes}m · {item.executions} runs
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-400">
              Complete workflows to establish duration baselines.
            </p>
          )}
        </section>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-bold">Onboarding readiness</h3>
          <div className="grid grid-cols-3 gap-3">
            <Metric
              value={analytics?.onboarding?.executions || 0}
              label="Runs"
            />
            <Metric
              value={`${analytics?.onboarding?.readyBeforeStartPercent || 0}%`}
              label="Ready on time"
            />
            <Metric
              value={`${analytics?.onboarding?.averageCompletionMinutes || 0}m`}
              label="Avg completion"
            />
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-bold">DevOps delivery</h3>
          <div className="grid grid-cols-4 gap-3">
            <Metric
              value={`${analytics?.devops?.deploymentSuccessRate ?? 100}%`}
              label="Deploy success"
            />
            <Metric
              value={`${analytics?.devops?.failedChangeRate || 0}%`}
              label="Failed change"
            />
            <Metric
              value={`${analytics?.devops?.rollbackRate || 0}%`}
              label="Rollback"
            />
            <Metric
              value={`${analytics?.devops?.averageChangeLeadTimeMinutes || 0}m`}
              label="Lead time"
            />
          </div>
        </section>
      </div>
    </div>
  </div>
);

const RuntimeMetric = ({ label, value, alert }: any) => (
  <div
    className={`rounded-2xl border bg-white p-4 ${alert ? "border-amber-200" : "border-slate-200"}`}
  >
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
      {label}
    </div>
    <div
      className={`mt-1 text-lg font-bold ${alert ? "text-amber-700" : "text-slate-900"}`}
    >
      {value}
    </div>
  </div>
);
const StatusPill = ({ status }: any) => (
  <span
    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : status === "FAILED" || status === "REJECTED" ? "bg-red-100 text-red-700" : status === "WAITING" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}
  >
    {status}
  </span>
);
const formatDuration = (minutes: number) =>
  minutes >= 1440
    ? `${Math.round(minutes / 1440)}d`
    : minutes >= 60
      ? `${Math.round(minutes / 60)}h`
      : `${minutes}m`;
const cryptoRandom = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const blankWorkflow = (ownerId: string): WorkflowVersion => ({
  id: "draft-local",
  workflowDefinitionId: "",
  version: 0,
  status: "DRAFT",
  variables: [
    { key: "summary", type: "STRING", required: true },
    { key: "requesterId", type: "USER_REF", required: true },
  ],
  triggers: [{ id: "trigger-manual", type: "MANUAL", enabled: true }],
  stages: [
    {
      id: "stage-main",
      key: "stage-main",
      title: "Work",
      order: 1,
      trigger: "IMMEDIATE",
      nodeIds: ["node-start", "node-end"],
    },
  ],
  nodes: [
    {
      id: "node-start",
      key: "node-start",
      type: "START",
      title: "Start",
      stageId: "stage-main",
      position: { x: 120, y: 180 },
    },
    {
      id: "node-end",
      key: "node-end",
      type: "SUCCESS_END",
      title: "Complete",
      stageId: "stage-main",
      position: { x: 620, y: 180 },
    },
  ],
  edges: [],
  policySetId: "policy-general-v1",
  policySetVersion: 1,
  formDefinitionId: "form-universal-task",
  formVersion: 1,
  changeLog: "Initial draft.",
  checksum: "",
  createdByUserId: ownerId,
  createdAt: new Date().toISOString(),
});
const blankDefinition = (ownerId: string) => ({
  key: `workflow-${Date.now()}`,
  name: "New Workflow",
  description: "Reusable enterprise workflow.",
  domain: "GENERAL",
  defaultWorkType: "TASK",
  scope: "PERSONAL",
  ownerId,
  tags: [],
  iconName: "Workflow",
});
