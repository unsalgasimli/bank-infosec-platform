import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  Braces,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleStop,
  ClipboardEdit,
  Clock3,
  Code2,
  Copy,
  Diamond,
  Eye,
  EyeOff,
  FileText,
  GitBranch,
  Grid3X3,
  Layers3,
  Loader2,
  LockKeyhole,
  Maximize2,
  Network,
  PanelLeft,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Split,
  Square,
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
  FormFieldType,
  RequestTypeDefinition,
  SimulationResult,
  WorkflowCatalogTemplate,
  WorkflowEdgeDefinition,
  WorkflowNodeDefinition,
  WorkflowNodeType,
  TemplateScope,
  WorkflowVersion,
} from "../../../shared/types/orchestration.js";
import { validateWorkflowPreflight } from "../../../shared/utils/workflow-preflight.js";
import { useAuth } from "../../context/AuthContext.js";
import { AccessibleDatePicker } from "../common/AccessibleDatePicker.js";
import { CustomSelect, type SelectOption } from "../common/CustomSelect.js";

type WorkspaceTab = "CATALOG" | "BUILDER" | "EXECUTIONS" | "ANALYTICS";
type BuilderSidebarTab = "NODES" | "VARIABLES";
type BuilderOperation = "PUBLISH";
type CatalogPayload = {
  sections: Array<{ name: string; templates: WorkflowCatalogTemplate[] }>;
  templates: WorkflowCatalogTemplate[];
  requestTypes: RequestTypeDefinition[];
  permissions: {
    canCreatePersonal: boolean;
    canCreateDepartment: boolean;
    canCreateCompany: boolean;
    canLaunchWorkflows: boolean;
  };
};
type TemplateDetail = {
  template: WorkflowCatalogTemplate;
  definition: any;
  version: WorkflowVersion;
  preflight: any;
};
type RuntimeExecution = any;
type WorkflowBranchOutcome = "TRUE" | "FALSE" | "APPROVED" | "REJECTED";

const nodePalette: Array<{
  group: string;
  type: WorkflowNodeType;
  label: string;
  icon: React.ElementType;
  color: string;
}> = [
  {
    group: "Human work",
    type: "INPUT",
    label: "Ticket input",
    icon: ClipboardEdit,
    color: "#059669",
  },
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

// Every author receives these two anchors with a new workflow. They explain
// the graph boundary and are intentionally not author-configurable nodes.
const isFixedEndpoint = (node: Pick<WorkflowNodeDefinition, "type">) =>
  node.type === "START" || node.type === "SUCCESS_END";
const CANVAS_GRID_SIZE = 20;
const WORKFLOW_NODE_WIDTH = 180;
const WORKFLOW_NODE_FALLBACK_HEIGHT = 90;
const WORKSPACE_REQUEST_TIMEOUT_MS = 15_000;

type WorkspaceLoadScope = "catalog" | "instances" | "analytics" | "directory" | "current";

const directoryIdFromOption = (value: string | undefined, kind: "department" | "section") => {
  if (!value) return undefined;
  const prefix = `${kind}:`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
};

const apiError = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const err: any = new Error(payload.error || fallback);
    err.payload = payload;
    err.preflight = payload.preflight || payload.details;
    throw err;
  }
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
    if (entry.operator === "NOT_EXISTS")
      return left === undefined || left === null || left === "";
    if (entry.operator === "IS_TRUE") return left === true;
    if (entry.operator === "IS_FALSE") return left === false;
    if (entry.operator === "IN")
      return Array.isArray(right) && right.includes(left);
    if (entry.operator === "NOT_IN")
      return Array.isArray(right) && !right.includes(left);
    if (entry.operator === "CONTAINS")
      return Array.isArray(left) ? left.includes(right) : String(left ?? "").includes(String(right ?? ""));
    if (entry.operator === "NOT_CONTAINS")
      return Array.isArray(left) ? !left.includes(right) : !String(left ?? "").includes(String(right ?? ""));
    if (entry.operator === "GREATER_THAN") return Number(left) > Number(right);
    if (entry.operator === "GREATER_THAN_OR_EQUAL") return Number(left) >= Number(right);
    if (entry.operator === "LESS_THAN") return Number(left) < Number(right);
    if (entry.operator === "LESS_THAN_OR_EQUAL") return Number(left) <= Number(right);
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
    permissions: {
      canCreatePersonal: false,
      canCreateDepartment: false,
      canCreateCompany: false,
      canLaunchWorkflows: false,
    },
  });
  const canCreateWorkflow = catalog.permissions.canCreatePersonal;
  const canCreateCompanyTemplate = catalog.permissions.canCreateCompany;
  const canCreateDepartmentTemplate = catalog.permissions.canCreateDepartment;
  const [directory, setDirectory] = useState<any>({ users: [], departments: [], sections: [], groups: [], roles: [] });
  const [instances, setInstances] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadedScopes = useRef(new Set<Exclude<WorkspaceLoadScope, "current">>());
  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateDetail | null>(null);
  const [templatePendingDeletion, setTemplatePendingDeletion] =
    useState<WorkflowCatalogTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
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
    outcome?: WorkflowBranchOutcome;
  } | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
  const [zoom, setZoom] = useState(0.8);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isGridVisible, setIsGridVisible] = useState(true);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [clipboardNodes, setClipboardNodes] = useState<
    WorkflowNodeDefinition[]
  >([]);
  const [nodeSearch, setNodeSearch] = useState("");
  const [builderSidebarTab, setBuilderSidebarTab] =
    useState<BuilderSidebarTab>("NODES");
  const [history, setHistory] = useState<WorkflowVersion[]>([]);
  const [future, setFuture] = useState<WorkflowVersion[]>([]);
  const [preflight, setPreflight] = useState<any>(null);

  const livePreflight = useMemo(() => {
    if (!builderVersion) return null;
    return validateWorkflowPreflight(builderVersion, {
      actor: currentUser || undefined,
      departments: directory?.departments,
      sections: directory?.sections,
      users: directory?.users,
      teams: directory?.teams || directory?.groups,
    });
  }, [builderVersion, currentUser, directory]);

  const activePreflight = tab === "BUILDER" ? (livePreflight || preflight) : preflight;

  useEffect(() => {
    if (activePreflight?.valid && error === "Workflow cannot be published until preflight errors are resolved.") {
      setError("");
    }
  }, [activePreflight?.valid, error]);

  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [builderBusy, setBuilderBusy] = useState(false);
  const [builderOperation, setBuilderOperation] = useState<BuilderOperation | null>(null);
  const [workflowMetadata, setWorkflowMetadata] = useState<{ name: string; scope: TemplateScope }>({ name: "", scope: "PERSONAL" });
  const [metadataError, setMetadataError] = useState("");
  const builderWorkspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeElementsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const [nodeSizes, setNodeSizes] = useState<Record<string, { width: number; height: number }>>({});
  const panOrigin = useRef<{
    pointerX: number;
    pointerY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const snapCanvasPosition = (x: number, y: number) => ({
    x: Math.max(0, isGridVisible ? Math.round(x / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE : Math.round(x)),
    y: Math.max(0, isGridVisible ? Math.round(y / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE : Math.round(y)),
  });
  const getNodeSize = (nodeId: string) =>
    nodeSizes[nodeId] || { width: WORKFLOW_NODE_WIDTH, height: WORKFLOW_NODE_FALLBACK_HEIGHT };
  const getNodePort = (node: WorkflowNodeDefinition, outcome?: WorkflowBranchOutcome) => {
    const size = getNodeSize(node.id);
    const isBranch = (node.type === "CONDITION" && ["TRUE", "FALSE"].includes(outcome || ""))
      || (node.type === "APPROVAL" && ["APPROVED", "REJECTED"].includes(outcome || ""));
    const isPositiveBranch = outcome === "TRUE" || outcome === "APPROVED";
    return {
      x: node.position.x + size.width,
      y: node.position.y + (isBranch ? size.height * (isPositiveBranch ? 0.3 : 0.7) : size.height / 2),
    };
  };

  const fetchWorkspace = async (url: string): Promise<Response> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), WORKSPACE_REQUEST_TIMEOUT_MS);
    try {
      return await fetchWithAuth(url, { signal: controller.signal });
    } catch (reason: any) {
      if (reason?.name === "AbortError") {
        throw new Error("Workflow məlumatlarının yüklənməsi vaxt aşımına uğradı. Yenidən cəhd edin.");
      }
      throw reason;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const load = async (requestedScope: WorkspaceLoadScope = "current") => {
    const scope = requestedScope === "current"
      ? tab === "EXECUTIONS" ? "instances" : tab === "ANALYTICS" ? "analytics" : tab === "BUILDER" ? "directory" : "catalog"
      : requestedScope;
    const shouldShowLoading = !loadedScopes.current.has(scope) || requestedScope !== "current";
    if (shouldShowLoading) setLoading(true);
    setError("");
    try {
      const response = await fetchWorkspace(
        scope === "catalog"
          ? `/api/orchestration/catalog${query ? `?q=${encodeURIComponent(query)}` : ""}`
          : scope === "instances"
            ? "/api/orchestration/instances"
            : scope === "analytics"
              ? "/api/orchestration/analytics"
              : "/api/orchestration/directory",
      );
      const data = await apiError(
        response,
        scope === "catalog" ? "Catalog failed" : scope === "instances" ? "Runtime list failed" : scope === "analytics" ? "Analytics failed" : "LDAP routing directory failed",
      );
      if (scope === "catalog") setCatalog(data);
      if (scope === "instances") setInstances(data.instances || []);
      if (scope === "analytics") setAnalytics(data.analytics || null);
      if (scope === "directory") setDirectory(data);
      loadedScopes.current.add(scope);
    } catch (reason: any) {
      setError(reason instanceof Error ? reason.message : "Workflow məlumatları yüklənmədi.");
    } finally {
      if (shouldShowLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void load("catalog");
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
    const timeout = window.setTimeout(() => void load("catalog"), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    if (tab === "EXECUTIONS" && !loadedScopes.current.has("instances")) void load("instances");
    if (tab === "ANALYTICS" && !loadedScopes.current.has("analytics")) void load("analytics");
    if (tab === "BUILDER" && !loadedScopes.current.has("directory")) void load("directory");
  }, [tab]);

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
    let requestType =
      (template.requestTypeId
        ? catalog.requestTypes.find((item) => item.id === template.requestTypeId)
        : undefined) ||
      catalog.requestTypes.find(
        (item) => item.workflowDefinitionId === template.workflowDefinitionId,
      ) ||
      catalog.requestTypes.find((item) => item.id === "request-standard-task");
    try {
      const detailResponse = await fetchWithAuth(
        `/api/orchestration/catalog/${template.id}`,
      );
      const detail = (await apiError(
        detailResponse,
        "Template launch failed",
      )) as TemplateDetail;

      let form: any = null;
      if (requestType) {
        const formResponse = await fetchWithAuth(
          `/api/orchestration/request-types/${requestType.id}/form`,
        );
        if (formResponse.ok) {
          form = await formResponse.json();
        }
      }

      const inputNode = detail.version?.nodes?.find((n: any) =>
        ["INPUT", "TICKET_INPUT"].includes(n.type),
      );
      if (inputNode?.inputConfig?.fields?.length) {
        const customFields = inputNode.inputConfig.fields as FormFieldDefinition[];
        const isUsbAccessRequest = requestType?.id === "request-usb-access" || template.id === "template-usb-access";
        const baseFields: FormFieldDefinition[] = [
          {
            id: "summary",
            key: "summary",
            label: "Request title",
            type: "TEXT",
            required: true,
            placeholder: "Brief title of the request",
          },
          ...(isUsbAccessRequest
            ? []
            : [{
                id: "description",
                key: "description",
                label: "Description / Details",
                type: "TEXTAREA" as const,
                placeholder: "Provide additional context or instructions...",
              }]),
          {
            id: "requesterId",
            key: "requesterId",
            label: "Requester",
            type: "USER",
            required: true,
          },
          {
            id: "departmentId",
            key: "departmentId",
            label: "Requester department / branch",
            type: "DEPARTMENT",
            required: true,
          },
        ];
        // The published request form is authoritative. INPUT-node fields are
        // additive custom fields; replacing the form with them used to hide
        // required fields such as USB business justification and data
        // classification, causing an apparently valid launch to fail server
        // validation.
        const existingSections = form?.version?.sections || [];
        const existingFields = existingSections.flatMap((section: any) => section.fields || []);
        const existingKeys = new Set(existingFields.map((field: any) => field.key));
        const additionalFields = [...baseFields, ...customFields]
          .filter((field, index, fields) => !existingKeys.has(field.key) && fields.findIndex((candidate) => candidate.key === field.key) === index);
        const sections = existingSections.length
          ? existingSections.map((section: any, index: number) => index === 0 ? { ...section, fields: [...(section.fields || []), ...additionalFields] } : section)
          : [{
              id: "input-section-main",
              title: inputNode.title || "Request details",
              description: inputNode.description || "Fill in the required information to launch this workflow.",
              fields: [...baseFields, ...customFields].filter((field, index, fields) => fields.findIndex((candidate) => candidate.key === field.key) === index),
            }];
        form = {
          ...(form || {}),
          version: {
            ...(form?.version || {}),
            sections,
          },
        };
        if (!requestType) {
          requestType = {
            id: `request-${template.workflowDefinitionId}`,
            key: `req-${template.workflowDefinitionId}`,
            name: template.title,
            description: template.purpose,
            domain: template.domain,
            workType: "SERVICE_REQUEST",
            category: template.category,
            iconName: template.iconName,
            formDefinitionId: `form-${template.workflowDefinitionId}`,
            formVersion: 1,
            workflowDefinitionId: template.workflowDefinitionId,
            workflowVersion: template.publishedWorkflowVersion,
            policySetId: "policy-general-v1",
            supportedChannels: [
              "EMPLOYEE_PORTAL",
              "AGENT",
              "MANAGER",
              "ADMIN",
              "API",
            ],
            visibility: "INTERNAL",
            isActive: true,
            tags: template.tags,
          };
        }
      } else if (!form && requestType) {
        const formResponse = await fetchWithAuth(
          `/api/orchestration/request-types/${requestType.id}/form`,
        );
        form = await apiError(formResponse, "Intake form failed");
      }

      if (!form) {
        throw new Error("This published template has no active request form.");
      }

      const initialValues: Record<string, any> = {
        summary: "",
        description: "",
        requesterId: currentUser?.id || "",
        departmentId: currentUser?.departmentId || "",
      };
      for (const field of (form.version?.sections || []).flatMap((section: any) => section.fields || [])) {
        if (field.defaultValue !== undefined) {
          initialValues[field.key] = field.defaultValue;
        } else if (field.type === "CHECKBOX") {
          initialValues[field.key] = false;
        }
      }

      setLaunchRequestType(requestType || null);
      setLaunchValues(initialValues);
      setLaunchForm(form);
      setSelectedTemplate(detail);
    } catch (reason: any) {
      const details = Array.isArray(reason.payload?.details)
        ? reason.payload.details.map((detail: any) => detail.message || detail).join(" ")
        : "";
      setError(details ? `${reason.message} ${details}` : reason.message);
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
      const details = Array.isArray(reason.payload?.details)
        ? reason.payload.details.map((detail: any) => detail.message || detail).join(" ")
        : "";
      setError(details ? `${reason.message} ${details}` : reason.message);
    }
  };

  const deleteTemplate = async () => {
    if (!templatePendingDeletion) return;
    setDeletingTemplate(true);
    setError("");
    try {
      const response = await fetchWithAuth(
        `/api/orchestration/catalog/${templatePendingDeletion.id}`,
        { method: "DELETE" },
      );
      await apiError(response, "Workflow template deletion failed");
      setSelectedTemplate(null);
      setTemplatePendingDeletion(null);
      await load();
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setDeletingTemplate(false);
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
      setSelectedTemplate(null);
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
      const details = Array.isArray(reason.payload?.details)
        ? reason.payload.details.map((detail: any) => detail.message || detail).join(" ")
        : "";
      setError(details ? `${reason.message} ${details}` : reason.message);
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

  const completeWorkItem = async (workItemId: string, output: Record<string, unknown> = { completedFrom: "runtime-workspace" }) => {
    if (!selectedExecution) return;
    try {
      const response = await fetchWithAuth(
        `/api/orchestration/instances/${selectedExecution.instance.id}/work-items/${workItemId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ output }),
        },
      );
      const data = await apiError(response, "Work item completion failed");
      setSelectedExecution(data.execution);
      await load();
    } catch (reason: any) {
      setError(reason.message);
    }
  };

  const claimWorkItem = async (workItemId: string) => {
    if (!selectedExecution) return;
    try {
      const response = await fetchWithAuth(`/api/orchestration/instances/${selectedExecution.instance.id}/work-items/${workItemId}/claim`, { method: "POST" });
      const data = await apiError(response, "Work item claim failed");
      setSelectedExecution(data.execution);
      await load();
    } catch (reason: any) { setError(reason.message); }
  };

  const decideApproval = async (chainId: string, stepId: string, decision: "APPROVED" | "REJECTED") => {
    if (!selectedExecution) return;
    const comments = decision === "REJECTED" ? window.prompt("Rejection reason (required):") || "" : window.prompt("Optional decision comment:") || "";
    if (decision === "REJECTED" && !comments.trim()) { setError("A rejection reason is required."); return; }
    try {
      const response = await fetchWithAuth(`/api/orchestration/instances/${selectedExecution.instance.id}/approvals/${chainId}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stepId, decision, comments }),
      });
      const data = await apiError(response, "Approval decision failed");
      setSelectedExecution(data.execution);
      await load();
    } catch (reason: any) { setError(reason.message); }
  };

  const addExecutionComment = async (body: string) => {
    if (!selectedExecution) return;
    try {
      const response = await fetchWithAuth(`/api/orchestration/instances/${selectedExecution.instance.id}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
      });
      const data = await apiError(response, "Comment failed");
      setSelectedExecution(data.execution);
      await load();
    } catch (reason: any) { setError(reason.message); }
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
      position: snapCanvasPosition(x, y),
      ...(["INPUT", "TICKET_INPUT"].includes(type)
        ? {
            title: "Ticket Input Form",
            description: "Initial intake information collected when launching this ticket/workflow.",
            inputConfig: {
              fields: [
                {
                  id: `cf-${Date.now()}-1`,
                  key: "accessScope",
                  label: "Access Scope",
                  type: "SELECT" as const,
                  required: true,
                  options: [
                    { value: "READ_ONLY", label: "Read Only" },
                    { value: "READ_WRITE", label: "Read and Write" },
                  ],
                },
                {
                  id: `cf-${Date.now()}-2`,
                  key: "isUrgent",
                  label: "Is Urgent / High Priority?",
                  type: "CHECKBOX" as const,
                  required: false,
                },
              ],
            },
          }
        : {}),
      ...(["TASK", "INFORMATION_REQUEST"].includes(type)
        ? { assignment: { strategy: "UNASSIGNED_TEAM_QUEUE" as const, departmentId: currentUser?.departmentId } }
        : {}),
      ...(type === "APPROVAL"
        ? {
            approval: {
              approverSource: "DEPARTMENT_MEMBERS" as const,
              approvalMode: "ANY_ONE" as const,
              departmentSource: "REQUESTER_DEPARTMENT" as const,
              commentsMandatoryOnReject: true,
              allowDelegation: true,
              preventSelfApproval: true,
              escalationSource: "DEPARTMENT_HEAD" as const,
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
  const addVariable = () => {
    if (!builderVersion) return;
    const key = `variable_${builderVersion.variables.length + 1}`;
    commitBuilder({
      ...builderVersion,
      variables: [
        ...builderVersion.variables,
        { key, type: "STRING", required: false, description: "" },
      ],
    });
    setBuilderSidebarTab("VARIABLES");
  };
  const updateVariable = (index: number, patch: Record<string, unknown>) => {
    if (!builderVersion) return;
    commitBuilder({
      ...builderVersion,
      variables: builderVersion.variables.map((variable, variableIndex) =>
        variableIndex === index ? { ...variable, ...patch } : variable,
      ),
    });
  };
  const removeVariable = (index: number) => {
    if (!builderVersion) return;
    commitBuilder({
      ...builderVersion,
      variables: builderVersion.variables.filter(
        (_, variableIndex) => variableIndex !== index,
      ),
    });
  };
  const removeNode = () => {
    if (!builderVersion || (!selectedNodeId && !selectedNodeIds.length)) return;
    const ids = new Set(
      (selectedNodeIds.length ? selectedNodeIds : [selectedNodeId]).filter(
        (id) => !isFixedEndpoint(builderVersion.nodes.find((node) => node.id === id) || { type: "TASK" }),
      ),
    );
    if (!ids.size) return;
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
      !isFixedEndpoint(item) && (selectedNodeIds.length ? selectedNodeIds : [selectedNodeId]).includes(item.id),
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
        position: snapCanvasPosition(source.position.x + 40, source.position.y + 40),
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
  const connectNodes = (sourceNodeId: string, destinationNodeId: string, outcomeHint?: WorkflowBranchOutcome) => {
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
      !["CONDITION", "APPROVAL"].includes(source.type) &&
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
    if (source.type === "CONDITION" || source.type === "APPROVAL") {
      const positiveOutcome = source.type === "APPROVAL" ? "APPROVED" : "TRUE";
      const negativeOutcome = source.type === "APPROVAL" ? "REJECTED" : "FALSE";
      const positiveLabel = source.type === "APPROVAL" ? "Approved" : "Yes";
      const negativeLabel = source.type === "APPROVAL" ? "Rejected" : "No";
      if (outcomeHint === positiveOutcome && outgoing.some((edge) => edge.outcome === positiveOutcome)) {
        setError(`The ${positiveLabel} branch is already connected. Remove the existing connection first.`);
        return false;
      }
      if (outcomeHint === negativeOutcome && outgoing.some((edge) => edge.outcome === negativeOutcome)) {
        setError(`The ${negativeLabel} branch is already connected. Remove the existing connection first.`);
        return false;
      }
      if (outcomeHint === positiveOutcome || (!outcomeHint && !outgoing.some((edge) => edge.outcome === positiveOutcome))) {
        outcome = positiveOutcome;
        branchLabel = positiveLabel;
      } else if (outcomeHint === negativeOutcome || !outgoing.some((edge) => edge.outcome === negativeOutcome)) {
        outcome = negativeOutcome;
        branchLabel = negativeLabel;
      } else {
        setError(source.type === "APPROVAL"
          ? "An approval can have one Approved and one Rejected connection. Remove or edit an existing branch first."
          : "A condition can have one True and one False connection. Remove or edit an existing branch first.");
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
    outcome?: WorkflowBranchOutcome,
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
    setConnectionDraft({ sourceNodeId: nodeId, x, y, outcome });
    setSelectedNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
  };
  const finishConnection = (destinationNodeId: string) => {
    const sourceNodeId = connectionDraft?.sourceNodeId || connectFrom;
    if (!sourceNodeId) return;
    connectNodes(sourceNodeId, destinationNodeId, connectionDraft?.outcome);
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
      position: snapCanvasPosition(
        100 + (index % 5) * 240,
        100 + Math.floor(index / 5) * 160,
      ),
    }));
    commitBuilder({ ...builderVersion, nodes });
  };

  const selectNode = (nodeId: string, additive = false) => {
    cancelConnection();
    setSelectedEdgeId("");
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
        .filter((node) => ids.includes(node.id) && !isFixedEndpoint(node))
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
        position: snapCanvasPosition(source.position.x + 60, source.position.y + 60),
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
    if (selected.length < 2) return;
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
                ...snapCanvasPosition(
                  axis === "VERTICAL" ? anchor : node.position.x,
                  axis === "HORIZONTAL" ? anchor : node.position.y,
                ),
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
      ...builderVersion.nodes.map((node) => node.position.x + getNodeSize(node.id).width),
    );
    const maxY = Math.max(
      ...builderVersion.nodes.map((node) => node.position.y + getNodeSize(node.id).height),
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
  const focusNodeOnCanvas = (node: WorkflowNodeDefinition) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setPan({
        x: rect.width / 2 - (node.position.x + getNodeSize(node.id).width / 2) * zoom,
        y: rect.height / 2 - (node.position.y + getNodeSize(node.id).height / 2) * zoom,
      });
    }
    cancelConnection();
    setSelectedEdgeId("");
    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);
  };
  const focusSearchResult = () => {
    if (!nodeSearch.trim()) return;
    const match = builderVersion?.nodes.find((node) =>
      node.title.toLocaleLowerCase().includes(nodeSearch.trim().toLocaleLowerCase()),
    );
    if (match) focusNodeOnCanvas(match);
  };
  const exitFocusMode = () => {
    setIsFocusMode(false);
    if (document.fullscreenElement === builderWorkspaceRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    }
  };
  const toggleFocusMode = () => {
    if (isFocusMode) {
      exitFocusMode();
      return;
    }
    setIsFocusMode(true);
    if (builderWorkspaceRef.current?.requestFullscreen) {
      void builderWorkspaceRef.current.requestFullscreen().catch(() => undefined);
    }
  };
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement !== builderWorkspaceRef.current) {
        setIsFocusMode(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);
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
      if (event.key === "Escape" && isFocusMode) {
        event.preventDefault();
        exitFocusMode();
        return;
      }
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
        (selectedEdgeId || selectedNodeId || selectedNodeIds.length)
      ) {
        event.preventDefault();
        if (selectedEdgeId) removeSelectedEdge();
        else removeNode();
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
    selectedEdgeId,
    clipboardNodes,
    history,
    future,
    builderDefinition,
    isFocusMode,
  ]);

  const saveDraft = async (definitionOverride = builderDefinition) => {
    if (!builderVersion) return;
    setBuilderBusy(true);
    setError("");
    try {
      const payload = {
        workflowDefinitionId: builderDefinition?.id,
        definition: definitionOverride,
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
      return data;
    } catch (reason: any) {
      setError(reason.message);
      if (reason.preflight) setPreflight(reason.preflight);
    } finally {
      setBuilderBusy(false);
    }
  };
  const publish = async (definitionId = builderDefinition?.id, versionNumber = builderVersion?.version) => {
    if (!definitionId || !versionNumber) return;
    setBuilderBusy(true);
    try {
      const response = await fetchWithAuth(
        `/api/orchestration/definitions/${definitionId}/versions/${versionNumber}/publish`,
        { method: "POST" },
      );
      const data = await apiError(response, "Publish failed");
      setBuilderVersion(data.version);
      setPreflight(data.preflight);
      await load();
    } catch (reason: any) {
      setError(reason.message);
      if (reason.preflight) setPreflight(reason.preflight);
    } finally {
      setBuilderBusy(false);
    }
  };

  const openWorkflowMetadata = (operation: BuilderOperation) => {
    if (!builderVersion) return;
    setMetadataError("");
    setWorkflowMetadata({
      name: builderDefinition?.name || "New Workflow",
      scope: builderDefinition?.scope || "PERSONAL",
    });
    setBuilderOperation(operation);
  };

  const confirmWorkflowMetadata = async () => {
    if (!builderOperation || !builderVersion) return;
    const name = workflowMetadata.name.trim();
    if (!name) {
      setMetadataError("Workflow name is required.");
      return;
    }
    if (workflowMetadata.scope === "COMPANY" && !canCreateCompanyTemplate) {
      setMetadataError("You are not authorized to create a company workflow.");
      return;
    }
    if (workflowMetadata.scope === "DEPARTMENT" && !canCreateDepartmentTemplate) {
      setMetadataError("You are not authorized to create a department workflow.");
      return;
    }
    const definition = {
      ...(builderDefinition || blankDefinition(currentUser?.id || "")),
      name,
      scope: workflowMetadata.scope,
    };
    const operation = builderOperation;
    const saved = await saveDraft(definition);
    if (!saved) return;
    setBuilderOperation(null);
    await publish(saved.definition.id, saved.version.version);
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
  const matchingNodes =
    builderVersion?.nodes.filter((item) =>
      item.title.toLocaleLowerCase().includes(nodeSearch.trim().toLocaleLowerCase()),
    ) || [];
  const visibleNodes = builderVersion?.nodes || [];

  useLayoutEffect(() => {
    const measureNodes = () => {
      const next = Object.fromEntries(
        visibleNodes.flatMap((node) => {
          const element = nodeElementsRef.current[node.id];
          return element
            ? [[node.id, { width: element.offsetWidth, height: element.offsetHeight }]]
            : [];
        }),
      ) as Record<string, { width: number; height: number }>;
      setNodeSizes((current) => {
        const ids = Object.keys(next);
        if (ids.length === Object.keys(current).length && ids.every((id) => current[id]?.width === next[id].width && current[id]?.height === next[id].height)) {
          return current;
        }
        return next;
      });
    };
    measureNodes();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureNodes);
    visibleNodes.forEach((node) => {
      const element = nodeElementsRef.current[node.id];
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [visibleNodes.map((node) => node.id).join("|")]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-semantic-page text-semantic-primary">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-3 sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-semantic-success-border bg-semantic-success-surface text-semantic-success shadow-sm">
              <Workflow className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="mb-0.5 text-caption font-extrabold uppercase tracking-[0.12em] text-semantic-success">
                Work management
              </div>
              <h1 className="truncate text-base font-bold tracking-tight text-semantic-primary">
                Universal Work Orchestration
              </h1>
              <p className="mt-0.5 max-w-2xl truncate text-xs text-slate-500">
                Govern requests, approvals, automation and enterprise processes from one place.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:self-auto">
            {canCreateWorkflow && (
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
                className="wrike-btn-primary h-9 gap-2 whitespace-nowrap px-3.5 text-sm"
                title="Create a workflow draft"
              >
                <Sparkles className="h-4 w-4" />
                <span>New workflow</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-5 sm:px-6">
        <div className="flex h-full items-center gap-1">
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
              className={`flex h-full items-center gap-2 whitespace-nowrap border-b-2 px-3.5 text-sm font-semibold transition-colors ${tab === value ? "border-semantic-brand text-semantic-success" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load()}
          className="ml-auto shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </nav>

      {error && !launchRequestType && (
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
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-semantic-brand" />
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
          onDelete={(item: WorkflowCatalogTemplate) => setTemplatePendingDeletion(item)}
        />
      ) : tab === "BUILDER" ? (
        <div
          ref={builderWorkspaceRef}
          className={`flex min-h-0 flex-1 flex-col ${isFocusMode ? "fixed inset-0 z-dsDialog h-screen bg-white shadow-2xl" : ""}`}
        >
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
            <select
              value={builderDefinition?.scope || "PERSONAL"}
              onChange={(event) =>
                setBuilderDefinition((current: any) => ({
                  ...(current || {}),
                  scope: event.target.value as TemplateScope,
                }))
              }
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-label font-semibold text-slate-700 outline-none focus:border-emerald-500"
              aria-label="Template scope"
              title="Template visibility and creation scope"
            >
              <option value="PERSONAL">Personal template</option>
              <option value="DEPARTMENT" disabled={!canCreateDepartmentTemplate}>Department template</option>
              <option value="COMPANY" disabled={!canCreateCompanyTemplate}>Company template</option>
            </select>
            <div className="ml-auto flex items-center gap-2">
              {isFocusMode && (
                <span className="hidden rounded-md bg-emerald-50 px-2 py-1 text-caption font-bold text-emerald-700 sm:inline">
                  Focus mode · Esc to exit
                </span>
              )}
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
                onClick={() => openWorkflowMetadata("PUBLISH")}
                disabled={
                  !builderVersion ||
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
              <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-label font-bold">
                <button
                  onClick={() => setBuilderSidebarTab("NODES")}
                  className={`rounded px-2 py-1.5 ${builderSidebarTab === "NODES" ? "bg-white shadow-xs text-slate-900" : "text-slate-500"}`}
                >
                  Nodes
                </button>
                <button
                  onClick={() => setBuilderSidebarTab("VARIABLES")}
                  className={`rounded px-2 py-1.5 ${builderSidebarTab === "VARIABLES" ? "bg-white shadow-xs text-slate-900" : "text-slate-500"}`}
                >
                  Variables
                </button>
              </div>
              {builderSidebarTab === "NODES" && [...new Set(nodePalette.map((item) => item.group))].map(
                (group) => (
                  <div key={group} className="mb-4">
                    <div className="mb-1.5 text-caption font-bold uppercase tracking-wider text-slate-400">
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
              {builderSidebarTab === "VARIABLES" && builderVersion && (
                <VariableEditor
                  variables={builderVersion.variables}
                  onAdd={addVariable}
                  onChange={updateVariable}
                  onRemove={removeVariable}
                />
              )}
            </aside>
            <div
              className="relative min-w-0 flex-1 cursor-grab overflow-hidden bg-semantic-subtle active:cursor-grabbing"
              ref={canvasRef}
              onPointerDown={(event) => {
                if (
                  (event.target as HTMLElement).closest(
                    '[data-workflow-node="true"],button,input',
                  )
                )
                  return;
                cancelConnection();
                setSelectedEdgeId("");
                setSelectedNodeId("");
                setSelectedNodeIds([]);
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
              {isGridVisible && (
                <div
                  className="pointer-events-none absolute inset-0 opacity-60"
                  style={{
                    backgroundImage:
                      "radial-gradient(#CBD5E1 1px, transparent 1px)",
                    backgroundSize: `${CANVAS_GRID_SIZE * zoom}px ${CANVAS_GRID_SIZE * zoom}px`,
                  }}
                />
              )}
              <div className="absolute left-3 top-3 z-dsSticky flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={focusSearchResult}
                  disabled={!nodeSearch.trim() || !matchingNodes.length}
                  className="ml-0.5 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  title={matchingNodes.length ? `Focus ${matchingNodes.length} matching node${matchingNodes.length === 1 ? "" : "s"}` : "No matching nodes"}
                  aria-label="Focus matching workflow node"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
                <input
                  value={nodeSearch}
                  onChange={(event) => setNodeSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      focusSearchResult();
                    }
                  }}
                  placeholder="Find node"
                  className="w-28 border-0 px-1 py-1 text-xs outline-none"
                  aria-label="Find workflow node"
                />
                <button
                  type="button"
                  onClick={() => setIsGridVisible((visible) => !visible)}
                  aria-pressed={isGridVisible}
                  className={`rounded p-1.5 transition-colors ${isGridVisible ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-100"}`}
                  title={isGridVisible ? "Grid and snap are on" : "Show grid and enable snap"}
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((value) => Math.min(1.4, value + 0.1))}
                  className="rounded p-1.5 hover:bg-slate-100"
                  title="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setZoom((value) => Math.max(0.45, value - 0.1))
                  }
                  className="rounded p-1.5 hover:bg-slate-100"
                  title="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleFocusMode}
                  className="rounded p-1.5 hover:bg-slate-100"
                  aria-pressed={isFocusMode}
                  title={isFocusMode ? "Exit focus mode (Esc)" : "Open workflow builder in focus mode"}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
              <div className="absolute left-3 top-14 z-dsSticky flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={copySelection}
                  disabled={!selectedNodeIds.length && !selectedNodeId}
                  className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30"
                  title="Copy selection (Ctrl+C)"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={pasteSelection}
                  disabled={!clipboardNodes.length}
                  className="rounded px-2 py-1.5 text-caption font-bold hover:bg-slate-100 disabled:opacity-30"
                  title="Paste (Ctrl+V)"
                >
                  Paste
                </button>
                <button
                  type="button"
                  onClick={() => alignSelection("HORIZONTAL")}
                  disabled={selectedNodeIds.length < 2}
                  className="rounded px-2 py-1.5 text-caption font-bold hover:bg-slate-100 disabled:opacity-30"
                >
                  Align H
                </button>
                <button
                  type="button"
                  onClick={() => alignSelection("VERTICAL")}
                  disabled={selectedNodeIds.length < 2}
                  className="rounded px-2 py-1.5 text-caption font-bold hover:bg-slate-100 disabled:opacity-30"
                >
                  Align V
                </button>
                <button
                  type="button"
                  onClick={fitToScreen}
                  className="rounded px-2 py-1.5 text-caption font-bold hover:bg-slate-100"
                >
                  Fit
                </button>
                <button
                  type="button"
                  onClick={autoLayout}
                  className="rounded px-2 py-1.5 text-caption font-bold hover:bg-slate-100"
                  title="Arrange nodes on the current grid"
                >
                  Arrange
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
                    {builderVersion.edges.map((workflowEdge) => {
                      const from = builderVersion.nodes.find(
                        (item) => item.id === workflowEdge.sourceNodeId,
                      );
                      const to = builderVersion.nodes.find(
                        (item) => item.id === workflowEdge.destinationNodeId,
                      );
                      if (!from || !to) return null;
                      const isBranchEdge = (from.type === "CONDITION" && ["TRUE", "FALSE"].includes(workflowEdge.outcome || ""))
                        || (from.type === "APPROVAL" && ["APPROVED", "REJECTED"].includes(workflowEdge.outcome || ""));
                      const isPositiveBranch = workflowEdge.outcome === "TRUE" || workflowEdge.outcome === "APPROVED";
                      const isApprovalBranch = from.type === "APPROVAL";
                      const sourcePort = getNodePort(from, workflowEdge.outcome as WorkflowBranchOutcome | undefined);
                      const x1 = sourcePort.x,
                        y1 = sourcePort.y,
                        x2 = to.position.x,
                        y2 = to.position.y + getNodeSize(to.id).height / 2;
                      const edgeStroke = isBranchEdge
                        ? isPositiveBranch ? "#059669" : isApprovalBranch ? "#DC2626" : "#D97706"
                        : selectedEdgeId === workflowEdge.id ? "var(--color-brand-500)" : "var(--color-neutral-400)";
                      const edgeLabel = workflowEdge.branchLabel || (isBranchEdge ? isPositiveBranch ? (isApprovalBranch ? "Approved" : "Yes") : (isApprovalBranch ? "Rejected" : "No") : undefined);
                      const labelX = x1 + Math.max(44, Math.min(88, (x2 - x1) * 0.32));
                      const labelY = y1 + (isBranchEdge ? (isPositiveBranch ? -13 : 16) : -9);
                      const labelWidth = edgeLabel ? Math.max(34, edgeLabel.length * 6.4 + 18) : 0;
                      return (
                        <g key={workflowEdge.id}>
                          <path
                            d={`M ${x1} ${y1} C ${x1 + 55} ${y1}, ${x2 - 55} ${y2}, ${x2} ${y2}`}
                            fill="none"
                            stroke="transparent"
                            strokeWidth="18"
                            className="cursor-pointer"
                            style={{ pointerEvents: "stroke" }}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              cancelConnection();
                              setSelectedEdgeId(workflowEdge.id);
                              setSelectedNodeId("");
                              setSelectedNodeIds([]);
                            }}
                          />
                          <path
                            d={`M ${x1} ${y1} C ${x1 + 55} ${y1}, ${x2 - 55} ${y2}, ${x2} ${y2}`}
                            fill="none"
                            stroke={edgeStroke}
                            strokeWidth={selectedEdgeId === workflowEdge.id ? "4" : "2"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="pointer-events-none"
                          />
                          {edgeLabel && (
                            <g className="pointer-events-none">
                              <rect x={labelX - labelWidth / 2} y={labelY - 10} width={labelWidth} height="19" rx="9.5" fill="white" stroke={isBranchEdge ? edgeStroke : "#CBD5E1"} strokeWidth="1" />
                              <text x={labelX} y={labelY + 3.5} textAnchor="middle" className={isBranchEdge ? "text-label font-bold" : "fill-slate-500 text-label font-bold"} fill={isBranchEdge ? edgeStroke : undefined}>{edgeLabel}</text>
                            </g>
                          )}
                        </g>
                      );
                    })}
                    {connectionDraft && (() => {
                      const source = builderVersion.nodes.find(
                        (item) => item.id === connectionDraft.sourceNodeId,
                      );
                      if (!source) return null;
                      const sourcePort = getNodePort(source, connectionDraft.outcome);
                      const x1 = sourcePort.x;
                      const y1 = sourcePort.y;
                      const x2 = connectionDraft.x;
                      const y2 = connectionDraft.y;
                      return (
                        <path
                          d={`M ${x1} ${y1} C ${x1 + 55} ${y1}, ${x2 - 55} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke="var(--color-brand-500)"
                          strokeDasharray="7 5"
                          strokeWidth="3"
                          strokeLinecap="round"
                          className="pointer-events-none"
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
                    const fixedEndpoint = isFixedEndpoint(workflowNode);
                    return (
                      <div
                        key={workflowNode.id}
                        ref={(element) => {
                          nodeElementsRef.current[workflowNode.id] = element;
                        }}
                        data-workflow-node="true"
                        data-workflow-node-id={workflowNode.id}
                        draggable
                        onDragEnd={(event) => {
                          cancelConnection();
                          const rect =
                            canvasRef.current?.getBoundingClientRect();
                          if (!rect || !builderVersion) return;
                          const { x, y } = snapCanvasPosition(
                            (event.clientX - rect.left - pan.x) / zoom - getNodeSize(workflowNode.id).width / 2,
                            (event.clientY - rect.top - pan.y) / zoom - getNodeSize(workflowNode.id).height / 2,
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
                                      position: snapCanvasPosition(
                                        node.position.x + dx,
                                        node.position.y + dy,
                                      ),
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
                        className={`absolute w-[180px] rounded-xl border-2 bg-white p-3 shadow-sm transition ${fixedEndpoint ? "border-slate-200 bg-slate-50" : ""} ${selected ? "border-semantic-brand shadow-md ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-300"}`}
                        style={{
                          left: workflowNode.position.x,
                          top: workflowNode.position.y,
                        }}
                      >
                        {workflowNode.type !== "START" && (
                          <button
                            type="button"
                            aria-label={`Connect into ${workflowNode.title}`}
                            className="absolute -left-3 top-1/2 z-dsContent h-6 w-6 -translate-y-1/2 rounded-full border-2 border-white bg-slate-400 shadow-sm transition hover:scale-110 hover:bg-semantic-brand"
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
                            <div className="mt-0.5 truncate text-caption capitalize text-slate-500">
                              {route ||
                                workflowNode.type
                                  .replaceAll("_", " ")
                                  .toLowerCase()}
                            </div>
                            {workflowNode.timeoutMinutes && (
                              <div className="mt-1 text-caption font-semibold text-amber-600">
                                Due: {workflowNode.timeoutMinutes}m
                              </div>
                            )}
                            {fixedEndpoint && (
                              <div className="mt-1 text-caption font-semibold text-slate-400">Required workflow endpoint</div>
                            )}
                          </div>
                        </div>
                        {!workflowNode.type.endsWith("_END") && (["CONDITION", "APPROVAL"].includes(workflowNode.type) ? (
                          <>
                            <span className={`pointer-events-none absolute right-4 z-dsContent -translate-y-1/2 rounded px-1.5 py-0.5 text-caption font-bold ${workflowNode.type === "APPROVAL" ? "bg-emerald-50 text-emerald-700" : "bg-emerald-50 text-emerald-700"}`} style={{ top: "30%" }}>{workflowNode.type === "APPROVAL" ? "Approved" : "Yes"}</span>
                            <button
                              type="button"
                              data-workflow-output-port="true"
                              aria-label={`Connect ${workflowNode.type === "APPROVAL" ? "Approved" : "Yes"} branch from ${workflowNode.title}`}
                              onPointerDown={(event) => beginConnection(event, workflowNode.id, workflowNode.type === "APPROVAL" ? "APPROVED" : "TRUE")}
                              onClick={(event) => event.stopPropagation()}
                              className={`absolute -right-3 z-dsContent h-6 w-6 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 shadow-sm transition hover:scale-110 ${connectionDraft?.sourceNodeId === workflowNode.id && (connectionDraft.outcome === "TRUE" || connectionDraft.outcome === "APPROVED") ? "ring-2 ring-emerald-200" : ""}`}
                              style={{ top: "30%" }}
                              title={`${workflowNode.type === "APPROVAL" ? "Approved" : "Yes"} branch — connect to the next node`
                              }
                            />
                            <span className={`pointer-events-none absolute right-4 z-dsContent -translate-y-1/2 rounded px-1.5 py-0.5 text-caption font-bold ${workflowNode.type === "APPROVAL" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`} style={{ top: "70%" }}>{workflowNode.type === "APPROVAL" ? "Rejected" : "No"}</span>
                            <button
                              type="button"
                              data-workflow-output-port="true"
                              aria-label={`Connect ${workflowNode.type === "APPROVAL" ? "Rejected" : "No"} branch from ${workflowNode.title}`}
                              onPointerDown={(event) => beginConnection(event, workflowNode.id, workflowNode.type === "APPROVAL" ? "REJECTED" : "FALSE")}
                              onClick={(event) => event.stopPropagation()}
                              className={`absolute -right-3 z-dsContent h-6 w-6 -translate-y-1/2 rounded-full border-2 border-white ${workflowNode.type === "APPROVAL" ? "bg-red-500" : "bg-amber-500"} shadow-sm transition hover:scale-110 ${connectionDraft?.sourceNodeId === workflowNode.id && (connectionDraft.outcome === "FALSE" || connectionDraft.outcome === "REJECTED") ? "ring-2 ring-red-200" : ""}`}
                              style={{ top: "70%" }}
                              title={`${workflowNode.type === "APPROVAL" ? "Rejected" : "No"} branch — connect to the next node`
                              }
                            />
                          </>
                        ) : (
                          <button
                            type="button"
                            data-workflow-output-port="true"
                            aria-label={`Connect from ${workflowNode.title}`}
                            onPointerDown={(event) => beginConnection(event, workflowNode.id)}
                            onClick={(event) => event.stopPropagation()}
                            className={`absolute -right-3 top-1/2 z-dsContent h-6 w-6 -translate-y-1/2 rounded-full border-2 border-white shadow-sm ${connectFrom === workflowNode.id ? "bg-semantic-brand" : "bg-slate-400"}`}
                            title="Drag to another node, or click then choose an input port"
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="absolute bottom-3 left-3 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-caption font-semibold text-slate-500 shadow-sm">
                {builderVersion?.nodes.length || 0} nodes ·{" "}
                {builderVersion?.edges.length || 0} edges ·{" "}
                {Math.round(zoom * 100)}% · {isGridVisible ? "Grid + snap" : "Freeform"}
              </div>
                  {connectionDraft && (
                    <div className="absolute bottom-12 left-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-caption font-semibold text-emerald-800 shadow-sm">
                  Connecting from {builderVersion?.nodes.find((node) => node.id === connectionDraft.sourceNodeId)?.title || "node"}{connectionDraft.outcome === "TRUE" ? " · Yes branch" : connectionDraft.outcome === "FALSE" ? " · No branch" : connectionDraft.outcome === "APPROVED" ? " · Approved branch" : connectionDraft.outcome === "REJECTED" ? " · Rejected branch" : ""}
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
                  workflow={builderVersion}
                  directory={directory}
                  onChange={updateNode}
                  onDuplicate={duplicateNode}
                  onRemove={removeNode}
                  currentUser={currentUser}
                />
              ) : selectedEdge ? (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800">Connection</div>
                      <div className="mt-0.5 text-label text-slate-500">
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
                  <label className="mb-3 block text-label font-semibold text-slate-600">
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
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-label text-slate-600">
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
                    className={`rounded-full px-2 py-0.5 text-caption font-bold ${
                      activePreflight?.summary?.errors
                        ? "bg-red-100 text-red-700"
                        : activePreflight?.summary?.warnings
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {activePreflight
                      ? activePreflight.summary.errors === 0
                        ? "0 Errors"
                        : `${activePreflight.summary.errors} Error${activePreflight.summary.errors > 1 ? "s" : ""}`
                      : "Save to validate"}
                  </span>
                </div>
                {activePreflight && activePreflight.summary?.errors === 0 && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2 text-label text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>All graph connections and preflight rules passed.</span>
                  </div>
                )}
                {activePreflight?.issues?.slice(0, 8).map((issue: any, index: number) => (
                  <button
                    key={`${issue.code}-${issue.nodeId || index}-${index}`}
                    onClick={() => {
                      if (!issue.nodeId) return;
                      setSelectedNodeId(issue.nodeId);
                      setSelectedNodeIds([issue.nodeId]);
                    }}
                    className={`mb-1.5 flex w-full gap-2 rounded-lg border p-2 text-left text-label transition ${
                      issue.severity === "ERROR"
                        ? "border-red-200 bg-red-50/50 text-red-800 hover:bg-red-50"
                        : issue.severity === "WARNING"
                          ? "border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-50"
                          : "border-blue-200 bg-blue-50/50 text-blue-800 hover:bg-blue-50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                        issue.severity === "ERROR"
                          ? "bg-red-500"
                          : issue.severity === "WARNING"
                            ? "bg-amber-500"
                            : "bg-blue-500"
                      }`}
                    />
                    <span className="flex-1">{issue.message}</span>
                  </button>
                ))}
              </div>
              {simulation && (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-blue-800">
                    <Play className="h-4 w-4" />
                    Dry-run execution preview
                  </div>
                  <div className="space-y-1 text-label text-blue-900">
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
            {builderOperation && (
              <WorkflowMetadataModal
                operation={builderOperation}
                metadata={workflowMetadata}
                setMetadata={setWorkflowMetadata}
                error={metadataError}
                canCreateCompanyTemplate={canCreateCompanyTemplate}
                canCreateDepartmentTemplate={canCreateDepartmentTemplate}
                busy={builderBusy}
                onClose={() => {
                  if (!builderBusy) setBuilderOperation(null);
                }}
                onConfirm={() => void confirmWorkflowMetadata()}
              />
            )}
          </div>
        </div>
      ) : tab === "EXECUTIONS" ? (
        <RuntimeView
          instances={instances}
          execution={selectedExecution}
          onOpen={(id: string) => void openExecution(id)}
          onComplete={(id: string, output: Record<string, unknown>) => void completeWorkItem(id, output)}
          onClaim={(id: string) => void claimWorkItem(id)}
          onDecision={(chainId: string, stepId: string, decision: "APPROVED" | "REJECTED") => void decideApproval(chainId, stepId, decision)}
          onRetry={(id: string) => void requeueDeadLetter(id)}
          onComment={(body: string) => void addExecutionComment(body)}
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
      {templatePendingDeletion && (
        <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-workflow-template-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h2 id="delete-workflow-template-title" className="text-lg font-bold text-slate-900">Remove workflow template?</h2>
                <p className="mt-1 text-sm text-slate-500">
                  “{templatePendingDeletion.title}” will no longer appear in the catalog or accept new requests.
                </p>
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Existing workflow runs and their audit evidence are retained.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setTemplatePendingDeletion(null)} disabled={deletingTemplate} className="wrike-btn-secondary px-3 py-2 text-xs disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void deleteTemplate()} disabled={deletingTemplate} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                {deletingTemplate && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Remove template
              </button>
            </div>
          </div>
        </div>
      )}
      {launchRequestType && launchForm && (
        <DynamicIntakeModal
          requestType={launchRequestType}
          form={launchForm}
          directory={directory}
          currentUser={currentUser}
          values={launchValues}
          setValues={setLaunchValues}
          error={error}
          onClose={() => {
            setLaunchRequestType(null);
            setLaunchForm(null);
            setLaunchValues({});
            setSelectedTemplate(null);
            setError("");
          }}
          onSubmit={() => void submitLaunch()}
          busy={launching}
        />
      )}
    </div>
  );
};

const WorkflowMetadataModal = ({
  operation,
  metadata,
  setMetadata,
  error,
  canCreateCompanyTemplate,
  canCreateDepartmentTemplate,
  busy,
  onClose,
  onConfirm,
}: any) => {
  const operationLabel = "Save and publish";
  const scopes: Array<{ value: TemplateScope; label: string; description: string; enabled: boolean }> = [
    { value: "PERSONAL", label: "User level", description: "Only you can use and manage this workflow.", enabled: true },
    { value: "DEPARTMENT", label: "Department / branch", description: "Available within your department or branch.", enabled: canCreateDepartmentTemplate },
    { value: "COMPANY", label: "Company level", description: "Available across the company.", enabled: canCreateCompanyTemplate },
  ];
  return (
    <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="workflow-metadata-title">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-caption font-bold uppercase tracking-wider text-semantic-success">Workflow details</div>
            <h2 id="workflow-metadata-title" className="mt-1 text-lg font-bold text-slate-900">Name and visibility</h2>
            <p className="mt-1 text-sm text-slate-500">Choose who can use this workflow before continuing.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <label className="mt-5 block">
          <span className="mini-label">Workflow name</span>
          <input
            autoFocus
            value={metadata.name}
            onChange={(event) => setMetadata((current: any) => ({ ...current, name: event.target.value }))}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onConfirm(); } }}
            className="wrike-input mt-1 w-full"
            placeholder="e.g. Access review workflow"
          />
        </label>
        <fieldset className="mt-5">
          <legend className="mini-label">Workflow level</legend>
          <div className="mt-2 space-y-2">
            {scopes.map((scope) => (
              <button
                type="button"
                key={scope.value}
                disabled={!scope.enabled || busy}
                onClick={() => setMetadata((current: any) => ({ ...current, scope: scope.value }))}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${metadata.scope === scope.value ? "border-semantic-brand bg-emerald-50 ring-1 ring-semantic-brand/20" : "border-slate-200 bg-white hover:border-slate-300"} ${!scope.enabled ? "cursor-not-allowed opacity-45" : ""}`}
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${metadata.scope === scope.value ? "border-semantic-brand bg-semantic-brand text-white" : "border-slate-300"}`}>
                  {metadata.scope === scope.value && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-800">{scope.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{scope.enabled ? scope.description : "You do not have permission for this level."}</span>
                </span>
                {!scope.enabled && <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />}
              </button>
            ))}
          </div>
        </fieldset>
        {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="wrike-btn-secondary px-3 py-2 text-xs">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="wrike-btn-primary flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-60">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {operationLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

const workflowCatalogTemplatesForDisplay = (templates: WorkflowCatalogTemplate[]) => templates.filter((template) => !(template.kind === "BASIC_TICKET" && template.catalogGroup?.startsWith("IT ·")));

const CatalogView = ({
  catalog,
  query,
  setQuery,
  onPreview,
  onLaunch,
  onEdit,
  onClone,
  onDelete,
}: any) => (
  <div className="flex-1 overflow-y-auto p-6">
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-8 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          Start a governed request from an approved workflow template.
        </p>
        <label className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-xs transition focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-50 sm:w-[420px]">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workflows, domains, owners, nodes…"
            aria-label="Search workflow templates"
            className="w-full border-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
      </div>
      {catalog.sections.map((section: any) => (
        <section key={section.name} className="mb-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{section.name}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-caption font-bold text-slate-600">
                  {workflowCatalogTemplatesForDisplay(section.templates).length}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {section.name === "Company Templates"
                  ? "Centrally governed workflows available across the organization."
                  : section.name === "Department / Branch Templates"
                    ? "Templates managed for your department or branch."
                    : "Personal templates you can reuse and refine."}
              </p>
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {[...workflowCatalogTemplatesForDisplay(section.templates)]
              .sort((left: WorkflowCatalogTemplate, right: WorkflowCatalogTemplate) => `${left.kind === "WORKFLOW" ? "1" : "2"}-${left.catalogGroup || ""}-${left.title}`.localeCompare(`${right.kind === "WORKFLOW" ? "1" : "2"}-${right.catalogGroup || ""}-${right.title}`))
              .map((template: WorkflowCatalogTemplate) => (
              <article
                key={template.id}
                className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-semantic-success-surface text-semantic-success ring-1 ring-emerald-100">
                    <Workflow className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold text-slate-900">
                      {template.title}
                    </h4>
                    <p title={template.purpose} className="mt-0.5 line-clamp-1 text-xs leading-5 text-slate-500">
                      {template.purpose}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-caption font-bold text-slate-600">
                    v{template.publishedWorkflowVersion}
                  </span>
                </div>
                <div className="my-3.5 grid grid-cols-4 divide-x divide-slate-200 rounded-xl border border-slate-100 bg-slate-50/80 py-2.5 text-center">
                  <Metric
                    value={formatDuration(template.estimatedDurationMinutes)}
                    label="Duration"
                  />
                  <Metric value={template.departmentCount} label="Teams" />
                  <Metric value={template.approvalCount} label="Approvals" />
                  <Metric value={template.automationCount} label="Auto" />
                </div>
                <div className="mb-2.5 flex items-center justify-between gap-3 text-caption font-semibold text-slate-500">
                  <span className="min-w-0 truncate rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                    {template.scope === "COMPANY" ? "Company" : template.scope === "DEPARTMENT" ? "Department / Branch" : "User"} · {template.domain.replaceAll("_", " ")}
                  </span>
                  <span>
                    {template.runCount.toLocaleString()} runs ·{" "}
                    {template.successRate}% success
                  </span>
                </div>
                <div className="mb-2.5 flex flex-wrap gap-1.5 text-micro font-bold uppercase tracking-wide">
                  <span className={`rounded-full px-2 py-0.5 ${template.kind === "WORKFLOW" ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {template.kind === "WORKFLOW" ? "Approval workflow" : "Help Desk task"}
                  </span>
                  {template.catalogGroup && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{template.catalogGroup}</span>}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onPreview(template)}
                    className="wrike-btn-secondary h-9 flex-1 px-2 text-xs"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => onLaunch(template)}
                    className="wrike-btn-primary h-9 flex-1 px-2 text-xs"
                  >
                    Launch
                  </button>
                  <button
                    onClick={() => onClone(template)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                    title="Clone as an editable draft"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  {template.canEdit && (
                    <button
                      onClick={() => onEdit(template)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                      title="Open published definition"
                    >
                      <Code2 className="h-4 w-4" />
                    </button>
                  )}
                  {template.canDelete && (
                    <button
                      onClick={() => onDelete(template)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50"
                      title="Remove template from catalog"
                      aria-label={`Remove ${template.title} from catalog`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </article>
                ))}
            {!workflowCatalogTemplatesForDisplay(section.templates).length && (
              <div className="flex min-h-28 items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-5 text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <Layers3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    No published templates yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Create a governed draft for {section.name.toLowerCase()} and publish an immutable version when it is ready.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  </div>
);

const Metric = ({ value, label }: any) => (
  <div>
    <div className="text-xs font-bold text-slate-800">{value}</div>
    <div className="text-micro uppercase tracking-wide text-slate-400">
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
  <div className="fixed inset-0 z-dsDialog flex justify-end bg-slate-950/30 backdrop-blur-[1px]">
    <div className="flex h-full w-[620px] flex-col bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-200 p-6">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-semantic-success">
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
        <div className="mb-6 grid grid-cols-4 gap-2 rounded-xl bg-slate-50 p-3">
          <Metric
            value={formatDuration(detail.template.estimatedDurationMinutes)}
            label="Duration"
          />
          <Metric value={detail.template.departmentCount} label="Teams" />
          <Metric value={detail.template.approvalCount} label="Approvals" />
          <Metric value={detail.template.automationCount} label="Automations" />
        </div>
        <div
          className={`rounded-xl border p-3 text-sm ${detail.preflight.valid ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
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
        {detail.template.canEdit && (
          <button onClick={onEdit} className="wrike-btn-secondary flex-1 py-2">
            Open in Builder
          </button>
        )}
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
  directory,
  currentUser,
  values,
  setValues,
  error,
  onClose,
  onSubmit,
  busy,
}: any) => {
  const bindSessionIdentity = requestType.id === "request-usb-access";
  useEffect(() => {
    if (!bindSessionIdentity || !currentUser?.id) return;
    setValues((current: Record<string, any>) => {
      if (
        current.requesterId === currentUser.id &&
        current.departmentId === currentUser.departmentId
      ) {
        return current;
      }
      return {
        ...current,
        requesterId: currentUser.id,
        departmentId: currentUser.departmentId,
      };
    });
  }, [bindSessionIdentity, currentUser?.departmentId, currentUser?.id, setValues]);

  const sections = form.version.sections.filter((section: any) =>
    localCondition(section.visibilityCondition, values),
  );
  return (
    <div className="fixed inset-0 z-dsToast flex items-center justify-center bg-slate-950/50 p-6 backdrop-blur-sm">
      <div className="flex max-h-dsModal w-[760px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <div className="text-caption font-bold uppercase tracking-wider text-semantic-success">
              Quick Work Item · {requestType.domain.replaceAll("_", " ")}
            </div>
            <h2 className="mt-1 text-lg font-bold">{requestType.name}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {requestType.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close request form"
            className="rounded-lg p-2 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        {error && (
          <div
            className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
            aria-live="polite"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
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
                      directory={directory}
                      currentUser={currentUser}
                      bindSessionIdentity={bindSessionIdentity}
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
          <div className="flex items-center gap-2 text-xs font-semibold text-semantic-success">
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
  directory,
  currentUser,
  bindSessionIdentity,
  required,
  onChange,
}: {
  field: FormFieldDefinition;
  value: any;
  values: Record<string, any>;
  directory: any;
  currentUser: any;
  bindSessionIdentity: boolean;
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
  const readOnly = (field as any).writable === false;
  const fieldId = `workflow-field-${field.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const labelId = `${fieldId}-label`;
  const requester =
    directory.users.find((user: any) => user.id === currentUser?.id) || currentUser;
  const department = directory.departments.find(
    (entry: any) => entry.id === currentUser?.departmentId,
  );
  const isSessionIdentity =
    bindSessionIdentity && ["requesterId", "departmentId"].includes(field.key);
  const userOptions: SelectOption[] = directory.users.map((user: any) => ({
    value: user.id,
    label: user.fullName,
    sublabel: [
      user.sectionName || directory.departments.find((entry: any) => entry.id === user.departmentId)?.name,
      user.title,
    ]
      .filter(Boolean)
      .join(" · "),
    badge: user.sAMAccountName || user.username,
    icon: (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-caption font-black text-semantic-success">
        {String(user.fullName || user.username || "U")
          .split(" ")
          .slice(0, 2)
          .map((part: string) => part[0])
          .join("")
          .toUpperCase()}
      </span>
    ),
  }));
  const departmentOptions: SelectOption[] = directory.departments.map(
    (entry: any) => ({
      value: entry.id,
      label: entry.name,
      sublabel: entry.parentName || entry.type?.replaceAll("_", " "),
      badge: entry.code,
      icon: <Building2 className="h-4 w-4 text-semantic-success" />,
    }),
  );
  const choiceOptions: SelectOption[] = (options || []).map((option) => ({
    value: option.value,
    label: option.label,
  }));

  return (
    <div className={full ? "col-span-2" : ""}>
      <span id={labelId} className="mb-1 block text-xs font-bold text-slate-700">
        {field.label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {field.description && (
        <span className="mb-1 block text-label text-slate-500">
          {field.description}
        </span>
      )}
      {isSessionIdentity ? (
        <div
          role="group"
          aria-labelledby={labelId}
          className="flex min-h-[46px] items-center gap-3 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50/90 to-white px-3 py-2 shadow-sm"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-semantic-success shadow-sm ring-1 ring-emerald-100">
            {field.key === "requesterId" ? (
              <Users className="h-4 w-4" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-slate-800">
              {field.key === "requesterId"
                ? requester?.fullName || currentUser?.fullName || value
                : department?.name || currentUser?.departmentId || value}
            </span>
            <span className="block truncate text-label font-medium text-slate-500">
              {field.key === "requesterId"
                ? requester?.title || currentUser?.title || "Authenticated LDAP user"
                : "Authenticated user's department / branch"}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-caption font-bold uppercase tracking-wide text-semantic-success ring-1 ring-emerald-200">
            <LockKeyhole className="h-3 w-3" />
            LDAP session
          </span>
        </div>
      ) : field.type === "USER" ? (
        <CustomSelect
          id={fieldId}
          value={value || ""}
          onChange={onChange}
          options={userOptions}
          disabled={readOnly}
          required={required}
          ariaLabelledBy={labelId}
          placeholder="Select LDAP user…"
          searchPlaceholder="Search by name, title, department or username…"
          size="lg"
        />
      ) : field.type === "DEPARTMENT" ? (
        <CustomSelect
          id={fieldId}
          value={value || ""}
          onChange={onChange}
          options={departmentOptions}
          disabled={readOnly}
          required={required}
          ariaLabelledBy={labelId}
          placeholder="Select department / branch…"
          searchPlaceholder="Search department, branch or code…"
          size="lg"
        />
      ) : field.type === "CHECKBOX" ? (
        <button
          type="button"
          disabled={readOnly}
          aria-labelledby={labelId}
          aria-pressed={Boolean(value)}
          onClick={() => onChange(!value)}
          className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm ${value ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}
        >
          <span
            className={`flex h-4 w-4 items-center justify-center rounded border ${value ? "border-semantic-brand bg-semantic-brand text-white" : "border-slate-300"}`}
          >
            {value && <Check className="h-3 w-3" />}
          </span>
          {value ? "Yes" : "No"}
        </button>
      ) : ["SELECT", "RADIO"].includes(field.type) && options?.length ? (
        <select
          id={fieldId}
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          disabled={readOnly}
          required={required}
          aria-labelledby={labelId}
          className="wrike-input min-h-[46px] w-full cursor-pointer text-sm font-semibold"
        >
          <option value="" disabled={required}>
            Select…
          </option>
          {choiceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === "MULTI_SELECT" &&
        options?.length ? (
        <select
          id={fieldId}
          aria-labelledby={labelId}
          disabled={readOnly}
          required={required}
          multiple
          value={value || []}
          onChange={(event) =>
            onChange(
              [...event.target.selectedOptions].map((option) => option.value),
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
          id={fieldId}
          aria-labelledby={labelId}
          readOnly={readOnly}
          required={required}
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
      ) : field.type === "DATE" ? (
        <AccessibleDatePicker
          id={fieldId}
          value={value || ""}
          onChange={onChange}
          disabled={readOnly}
          required={required}
          min={
            typeof field.validation?.min === "string"
              ? field.validation.min
              : undefined
          }
          max={
            typeof field.validation?.max === "string"
              ? field.validation.max
              : undefined
          }
          placeholder={field.placeholder || "YYYY-MM-DD"}
          ariaLabelledBy={labelId}
        />
      ) : (
        <input
          id={fieldId}
          aria-labelledby={labelId}
          readOnly={readOnly}
          required={required}
          type={
            field.type === "NUMBER" || field.type === "MONEY"
              ? "number"
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
    </div>
  );
};

const VariableEditor = ({ variables, onAdd, onChange, onRemove }: any) => (
  <div>
    <div className="mb-3 flex items-center justify-between">
      <div>
        <div className="text-xs font-bold text-slate-800">Workflow variables</div>
        <p className="mt-0.5 text-caption text-slate-500">Validated context available to conditions and actions.</p>
      </div>
      <button type="button" onClick={onAdd} className="rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700" title="Add variable">
        <Plus className="h-4 w-4" />
      </button>
    </div>
    <div className="space-y-2">
      {variables.map((variable: any, index: number) => (
        <div key={`${variable.key}-${index}`} className="rounded-lg border border-slate-200 p-2.5">
          <div className="mb-2 flex gap-2">
            <input value={variable.key} onChange={(event) => onChange(index, { key: event.target.value.replace(/[^A-Za-z0-9_]/g, "_") })} className="wrike-input min-w-0 flex-1 text-xs" placeholder="variable_key" />
            <button type="button" onClick={() => onRemove(index)} className="rounded p-1 text-red-500 hover:bg-red-50" title="Remove variable">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <select value={variable.type} onChange={(event) => onChange(index, { type: event.target.value })} className="wrike-input mb-2 w-full text-xs">
            {["STRING", "NUMBER", "BOOLEAN", "DATE", "DATETIME", "MONEY", "USER_REF", "GROUP_REF", "RECORD_REF", "LIST", "OBJECT"].map((type) => <option key={type}>{type}</option>)}
          </select>
          <input value={variable.description || ""} onChange={(event) => onChange(index, { description: event.target.value || undefined })} className="wrike-input mb-2 w-full text-xs" placeholder="Description" />
          <label className="flex items-center gap-2 text-label font-semibold text-slate-600"><input type="checkbox" checked={Boolean(variable.required)} onChange={(event) => onChange(index, { required: event.target.checked })} /> Required</label>
        </div>
      ))}
    </div>
  </div>
);

const DurationField = ({ label, value, onChange }: { label: string; value?: number; onChange: (value: number | undefined) => void }) => {
  const initialUnit = value && value % 1440 === 0 ? "DAYS" : value && value % 60 === 0 ? "HOURS" : "MINUTES";
  const [unit, setUnit] = useState<"DAYS" | "HOURS" | "MINUTES">(initialUnit);
  const multipliers = { DAYS: 1440, HOURS: 60, MINUTES: 1 };
  return (
    <label className="mb-3 block">
      <span className="mini-label">{label} <span className="font-normal text-slate-400">(optional)</span></span>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <input type="number" min="1" value={value === undefined ? "" : value / multipliers[unit]} onChange={(event) => onChange(event.target.value === "" ? undefined : Math.max(1, Number(event.target.value)) * multipliers[unit])} className="wrike-input min-w-0" placeholder="Duration" aria-label={`${label} duration`} />
        <select value={unit} onChange={(event) => setUnit(event.target.value as "DAYS" | "HOURS" | "MINUTES")} className="wrike-input min-w-0" aria-label={`${label} unit`}>
          <option value="DAYS">Days</option><option value="HOURS">Hours</option><option value="MINUTES">Minutes</option>
        </select>
      </div>
    </label>
  );
};

const InputNodeFormEditor = ({
  node,
  onChange,
  directory,
  currentUser,
}: {
  node: WorkflowNodeDefinition;
  onChange: (patch: Partial<WorkflowNodeDefinition>) => void;
  directory: any;
  currentUser: any;
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, any>>({
    summary: "Sample Ticket Request",
    description: "Business purpose and justification",
    requesterId: currentUser?.id || "",
    departmentId: currentUser?.departmentId || "",
  });
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);

  const customFields = node.inputConfig?.fields || [];

  const updateFields = (fields: FormFieldDefinition[]) => {
    onChange({
      inputConfig: {
        ...(node.inputConfig || {}),
        fields,
      },
    });
  };

  const addCustomField = (type: FormFieldType = "SELECT") => {
    const nextIndex = customFields.length + 1;
    const defaultLabels: Record<string, string> = {
      CHECKBOX: `Confirmation Checkbox ${nextIndex}`,
      SELECT: `Option Selection ${nextIndex}`,
      MULTI_SELECT: `Multi Choice ${nextIndex}`,
      TEXT: `Text Field ${nextIndex}`,
      TEXTAREA: `Details ${nextIndex}`,
      NUMBER: `Quantity / Count ${nextIndex}`,
      DATE: `Due / Expiry Date ${nextIndex}`,
      USER: `Assigned User ${nextIndex}`,
      DEPARTMENT: `Target Department ${nextIndex}`,
    };
    const label = defaultLabels[type] || `Custom Field ${nextIndex}`;
    const key = `field_${type.toLowerCase()}_${Date.now().toString(36)}`;
    const newField: FormFieldDefinition = {
      id: `cf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      key,
      label,
      type,
      required: false,
      placeholder: type === "TEXT" ? "Enter value..." : undefined,
      ...(type === "SELECT" || type === "MULTI_SELECT"
        ? {
            options: [
              { value: "OPTION_1", label: "Option 1" },
              { value: "OPTION_2", label: "Option 2" },
            ],
          }
        : {}),
    };
    updateFields([...customFields, newField]);
    setExpandedFieldId(newField.id);
  };

  const modifyField = (index: number, patch: Partial<FormFieldDefinition>) => {
    const updated = customFields.map((f, i) => (i === index ? { ...f, ...patch } : f));
    updateFields(updated);
  };

  const removeField = (index: number) => {
    const updated = customFields.filter((_, i) => i !== index);
    updateFields(updated);
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= customFields.length) return;
    const copy = [...customFields];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    updateFields(copy);
  };

  const addOption = (fieldIndex: number) => {
    const field = customFields[fieldIndex];
    const options = field.options || [];
    const optIndex = options.length + 1;
    const newOption = { value: `VALUE_${optIndex}`, label: `Option ${optIndex}` };
    modifyField(fieldIndex, { options: [...options, newOption] });
  };

  const updateOption = (fieldIndex: number, optIndex: number, patch: { value?: string; label?: string }) => {
    const field = customFields[fieldIndex];
    const options = (field.options || []).map((opt, i) => (i === optIndex ? { ...opt, ...patch } : opt));
    modifyField(fieldIndex, { options });
  };

  const removeOption = (fieldIndex: number, optIndex: number) => {
    const field = customFields[fieldIndex];
    const options = (field.options || []).filter((_, i) => i !== optIndex);
    modifyField(fieldIndex, { options });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-teal-50/50 p-3 text-xs shadow-sm">
        <div className="flex items-center gap-2 font-bold text-emerald-900">
          <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
          <span>Standard Base Ticket Fields</span>
        </div>
        <p className="mt-1 text-label leading-relaxed text-emerald-800">
          Every ticket workflow always includes standard base fields:
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-caption">
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-white/90 px-2 py-1 font-semibold text-slate-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Title / Summary (<span className="text-red-500 font-bold">*</span>)</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-white/90 px-2 py-1 font-semibold text-slate-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Description / Details</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-white/90 px-2 py-1 font-semibold text-slate-700">
            <LockKeyhole className="h-2.5 w-2.5 text-emerald-600" />
            <span>Requester (LDAP)</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-white/90 px-2 py-1 font-semibold text-slate-700">
            <LockKeyhole className="h-2.5 w-2.5 text-emerald-600" />
            <span>Department / Branch</span>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <span>Custom Intake Fields</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-caption font-bold text-emerald-800">
                {customFields.length}
              </span>
            </h4>
            <p className="text-caption text-slate-500">
              Add dropdowns, checkboxes, text fields, dates, or options.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-label font-bold transition ${
              showPreview
                ? "border border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{showPreview ? "Hide Preview" : "Live Preview"}</span>
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => addCustomField("SELECT")}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-caption font-bold text-slate-700 shadow-sm hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 transition"
          >
            <Plus className="h-3 w-3 text-emerald-600" />
            <span>+ Dropdown</span>
          </button>
          <button
            type="button"
            onClick={() => addCustomField("CHECKBOX")}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-caption font-bold text-slate-700 shadow-sm hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 transition"
          >
            <Plus className="h-3 w-3 text-emerald-600" />
            <span>+ Checkbox</span>
          </button>
          <button
            type="button"
            onClick={() => addCustomField("TEXT")}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-caption font-bold text-slate-700 shadow-sm hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 transition"
          >
            <Plus className="h-3 w-3 text-emerald-600" />
            <span>+ Text</span>
          </button>
          <button
            type="button"
            onClick={() => addCustomField("DATE")}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-caption font-bold text-slate-700 shadow-sm hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 transition"
          >
            <Plus className="h-3 w-3 text-emerald-600" />
            <span>+ Date</span>
          </button>
          <button
            type="button"
            onClick={() => addCustomField("MULTI_SELECT")}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-caption font-bold text-slate-700 shadow-sm hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 transition"
          >
            <Plus className="h-3 w-3 text-emerald-600" />
            <span>+ Multi-Select</span>
          </button>
        </div>

        {customFields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center">
            <p className="text-xs text-slate-500 font-medium">No custom fields added yet.</p>
            <p className="mt-1 text-caption text-slate-400">
              Only standard Title and Description will be asked upon launch. Click the buttons above to add checkboxes, dropdowns, or custom fields.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {customFields.map((field, index) => {
              const isExpanded = expandedFieldId === field.id || expandedFieldId === null;
              return (
                <div
                  key={field.id || index}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 shadow-sm transition hover:border-slate-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-caption font-bold text-slate-700">
                        {index + 1}
                      </span>
                      <span className="truncate text-xs font-bold text-slate-800">
                        {field.label || "Untitled Field"}
                      </span>
                      <span className="rounded bg-emerald-100/80 px-1.5 py-0.5 text-micro font-bold text-emerald-800">
                        {field.type}
                      </span>
                      {field.required && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-micro font-bold text-red-700">
                          Required
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveField(index, -1)}
                        disabled={index === 0}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30"
                        title="Move Up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(index, 1)}
                        disabled={index === customFields.length - 1}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30"
                        title="Move Down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedFieldId(expandedFieldId === field.id ? "" : field.id)}
                        className="rounded p-1 text-slate-500 hover:bg-slate-200"
                        title={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeField(index)}
                        className="rounded p-1 text-red-500 hover:bg-red-50"
                        title="Remove Field"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="mini-label">Field Label</span>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => {
                              const newLabel = e.target.value;
                              modifyField(index, {
                                label: newLabel,
                                key: field.key.startsWith("field_")
                                  ? newLabel.toLowerCase().replace(/[^a-z0-9_]/g, "_") || field.key
                                  : field.key,
                              });
                            }}
                            placeholder="e.g. Access Scope"
                            className="wrike-input mt-1 w-full text-xs"
                          />
                        </div>
                        <div>
                          <span className="mini-label">Field Type</span>
                          <select
                            value={field.type}
                            onChange={(e) => {
                              const nextType = e.target.value as FormFieldType;
                              modifyField(index, {
                                type: nextType,
                                ...(nextType === "SELECT" || nextType === "MULTI_SELECT"
                                  ? {
                                      options: field.options?.length
                                        ? field.options
                                        : [
                                            { value: "OPT_1", label: "Option 1" },
                                            { value: "OPT_2", label: "Option 2" },
                                          ],
                                    }
                                  : {}),
                              });
                            }}
                            className="wrike-input mt-1 w-full text-xs font-medium"
                          >
                            <option value="CHECKBOX">Checkbox (Yes / No toggle)</option>
                            <option value="SELECT">Dropdown (Single choice select)</option>
                            <option value="MULTI_SELECT">Multi-Select Dropdown</option>
                            <option value="TEXT">Short Text</option>
                            <option value="TEXTAREA">Long Text / Textarea</option>
                            <option value="NUMBER">Number</option>
                            <option value="DATE">Date Picker</option>
                            <option value="USER">LDAP User Selector</option>
                            <option value="DEPARTMENT">Department Selector</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="mini-label">Context Key (Variable Name)</span>
                          <input
                            type="text"
                            value={field.key}
                            onChange={(e) =>
                              modifyField(index, {
                                key: e.target.value.replace(/[^A-Za-z0-9_]/g, "_"),
                              })
                            }
                            placeholder="e.g. accessScope"
                            className="wrike-input mt-1 w-full text-xs font-mono"
                          />
                        </div>
                        <div>
                          <span className="mini-label">Placeholder / Help Text</span>
                          <input
                            type="text"
                            value={field.placeholder || ""}
                            onChange={(e) =>
                              modifyField(index, {
                                placeholder: e.target.value || undefined,
                              })
                            }
                            placeholder="Optional placeholder..."
                            className="wrike-input mt-1 w-full text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={(e) => modifyField(index, { required: e.target.checked })}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Required Field</span>
                        </label>
                      </div>

                      {(field.type === "SELECT" || field.type === "MULTI_SELECT" || field.type === "RADIO") && (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-label font-bold text-slate-800">
                              Dropdown Choices ({field.options?.length || 0})
                            </span>
                            <button
                              type="button"
                              onClick={() => addOption(index)}
                              className="flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-caption font-bold text-emerald-700 hover:bg-emerald-100"
                            >
                              <Plus className="h-3 w-3" />
                              <span>Add Option</span>
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {(field.options || []).map((option, optIdx) => (
                              <div key={optIdx} className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={option.label}
                                  onChange={(e) => {
                                    const nextLabel = e.target.value;
                                    updateOption(index, optIdx, {
                                      label: nextLabel,
                                      value: option.value.startsWith("OPT_") || option.value.startsWith("VALUE_")
                                        ? nextLabel.toUpperCase().replace(/[^A-Z0-9_]/g, "_") || option.value
                                        : option.value,
                                    });
                                  }}
                                  placeholder="Option Display Label"
                                  className="wrike-input flex-1 text-xs py-1"
                                />
                                <input
                                  type="text"
                                  value={option.value}
                                  onChange={(e) =>
                                    updateOption(index, optIdx, {
                                      value: e.target.value.replace(/[^A-Za-z0-9_]/g, "_"),
                                    })
                                  }
                                  placeholder="Value"
                                  className="wrike-input w-28 text-xs font-mono py-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeOption(index, optIdx)}
                                  className="rounded p-1 text-red-500 hover:bg-red-50"
                                  title="Remove Option"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            {(!field.options || field.options.length === 0) && (
                              <p className="text-caption text-amber-700 bg-amber-50 rounded p-1.5 font-medium">
                                ⚠ Please add at least one choice option for this dropdown.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showPreview && (
        <div className="rounded-2xl border-2 border-emerald-500/40 bg-slate-50 p-4 shadow-md">
          <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <span className="text-caption font-bold uppercase tracking-wider text-emerald-700">
                Launch Intake Preview
              </span>
              <h4 className="text-sm font-bold text-slate-900">{node.title || "Ticket Request"}</h4>
              <p className="text-label text-slate-500">{node.description || "Initial ticket intake fields"}</p>
            </div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-caption font-bold text-emerald-800">
              Interactive Test
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
            <div className="col-span-2">
              <span className="mb-1 block text-xs font-bold text-slate-700">
                Request Title <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={previewValues.summary}
                onChange={(e) => setPreviewValues({ ...previewValues, summary: e.target.value })}
                className="wrike-input w-full text-xs"
              />
            </div>
            <div className="col-span-2">
              <span className="mb-1 block text-xs font-bold text-slate-700">Description / Details</span>
              <textarea
                rows={2}
                value={previewValues.description}
                onChange={(e) => setPreviewValues({ ...previewValues, description: e.target.value })}
                className="wrike-input w-full text-xs resize-y"
              />
            </div>
            {customFields.map((field) => (
              <DynamicField
                key={field.id}
                field={field}
                value={previewValues[field.key]}
                values={previewValues}
                directory={directory}
                currentUser={currentUser}
                bindSessionIdentity={true}
                required={Boolean(field.required)}
                onChange={(val) => setPreviewValues({ ...previewValues, [field.key]: val })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

type ConditionValueKind = "BOOLEAN" | "NUMBER" | "DATE" | "SELECT" | "USER" | "DEPARTMENT" | "GROUP" | "LIST" | "TEXT";
type ConditionChoice = { value: string; label: string };
type ConditionFieldChoice = {
  id: string;
  label: string;
  source: "CONTEXT" | "NODE_OUTPUT";
  path: string;
  nodeId?: string;
  kind: ConditionValueKind;
  choices?: ConditionChoice[];
};

const conditionKindForFormField = (field: FormFieldDefinition): ConditionValueKind => {
  if (field.type === "CHECKBOX") return "BOOLEAN";
  if (["NUMBER", "MONEY"].includes(field.type)) return "NUMBER";
  if (["DATE", "DATETIME"].includes(field.type)) return "DATE";
  if (["SELECT", "RADIO"].includes(field.type)) return "SELECT";
  if (field.type === "MULTI_SELECT") return "LIST";
  if (field.type === "USER") return "USER";
  if (field.type === "DEPARTMENT") return "DEPARTMENT";
  if (field.type === "GROUP") return "GROUP";
  return "TEXT";
};

const conditionKindForVariable = (type: string): ConditionValueKind => {
  if (type === "BOOLEAN") return "BOOLEAN";
  if (["NUMBER", "MONEY"].includes(type)) return "NUMBER";
  if (["DATE", "DATETIME"].includes(type)) return "DATE";
  if (type === "USER_REF") return "USER";
  if (type === "GROUP_REF") return "GROUP";
  if (type === "RECORD_REF") return "DEPARTMENT";
  if (type === "LIST") return "LIST";
  return "TEXT";
};

const conditionFieldsForWorkflow = (workflow: WorkflowVersion | null | undefined, directory: any, selectedNodeId: string): ConditionFieldChoice[] => {
  const system: ConditionFieldChoice[] = [
    { id: "system-requester-manager", label: "Requester · is department manager", source: "CONTEXT", path: "requesterIsDepartmentManager", kind: "BOOLEAN" },
    { id: "system-requester-department", label: "Requester · department / branch", source: "CONTEXT", path: "departmentId", kind: "DEPARTMENT", choices: directory.departments.map((item: any) => ({ value: item.id, label: item.name })) },
    { id: "system-requester-manager-id", label: "Requester · manager assigned", source: "CONTEXT", path: "requester.managerId", kind: "USER", choices: directory.users.map((item: any) => ({ value: item.id, label: item.fullName })) },
    { id: "system-requester-role", label: "Requester · role", source: "CONTEXT", path: "requester.roles", kind: "LIST", choices: directory.roles.map((role: string) => ({ value: role, label: role.replaceAll("_", " ") })) },
    { id: "system-requester-group", label: "Requester · group / team", source: "CONTEXT", path: "requester.groups", kind: "LIST", choices: directory.groups.map((item: any) => ({ value: item.id, label: item.name })) },
    { id: "system-current-assignee", label: "Workflow · current assignee", source: "CONTEXT", path: "currentAssigneeId", kind: "USER", choices: directory.users.map((item: any) => ({ value: item.id, label: item.fullName })) },
  ];
  if (!workflow) return system;
  const variables: ConditionFieldChoice[] = workflow.variables.map((variable) => ({ id: `variable-${variable.key}`, label: `Workflow variable · ${variable.key}`, source: "CONTEXT", path: variable.key, kind: conditionKindForVariable(variable.type) }));
  const intakeFields: ConditionFieldChoice[] = workflow.nodes.flatMap((workflowNode) => (workflowNode.inputConfig?.fields || []).map((field) => ({
    id: `field-${workflowNode.id}-${field.key}`,
    label: `Request form · ${field.label}`,
    source: "CONTEXT" as const,
    path: field.key,
    kind: conditionKindForFormField(field),
    choices: field.options?.map((option) => ({ value: option.value, label: option.label })),
  })));
  const upstreamNodeIds = new Set<string>();
  const pendingNodeIds = [selectedNodeId];
  while (pendingNodeIds.length) {
    const destinationNodeId = pendingNodeIds.pop()!;
    for (const edge of workflow.edges.filter((candidate) => candidate.destinationNodeId === destinationNodeId)) {
      if (!upstreamNodeIds.has(edge.sourceNodeId)) {
        upstreamNodeIds.add(edge.sourceNodeId);
        pendingNodeIds.push(edge.sourceNodeId);
      }
    }
  }
  const outputs: ConditionFieldChoice[] = workflow.nodes
    .filter((workflowNode) => upstreamNodeIds.has(workflowNode.id))
    .flatMap((workflowNode) => (workflowNode.outputSchema || []).map((output) => ({
      id: `output-${workflowNode.id}-${output.key}`,
      label: `Node output · ${workflowNode.title} · ${output.key}`,
      source: "NODE_OUTPUT" as const,
      nodeId: workflowNode.id,
      path: output.key,
      kind: conditionKindForVariable(output.type),
    })));
  return [...system, ...variables, ...intakeFields, ...outputs]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.source === item.source && candidate.path === item.path && candidate.nodeId === item.nodeId) === index);
};

const conditionOperatorsFor = (kind: ConditionValueKind) => {
  const common = [{ value: "EXISTS", label: "is filled" }, { value: "NOT_EXISTS", label: "is empty" }];
  if (kind === "BOOLEAN") return [{ value: "IS_TRUE", label: "is Yes" }, { value: "IS_FALSE", label: "is No" }];
  if (kind === "LIST") return [{ value: "CONTAINS", label: "contains" }, { value: "NOT_CONTAINS", label: "does not contain" }, ...common];
  if (kind === "NUMBER" || kind === "DATE") return [{ value: "EQUALS", label: "equals" }, { value: "NOT_EQUALS", label: "does not equal" }, { value: "GREATER_THAN", label: "is greater than" }, { value: "LESS_THAN", label: "is less than" }, ...common];
  return [{ value: "EQUALS", label: "equals" }, { value: "NOT_EQUALS", label: "does not equal" }, ...common];
};

const NodeInspector = ({ node, workflow, directory, onChange, onDuplicate, onRemove, currentUser }: any) => {
  if (isFixedEndpoint(node)) {
    return (
      <div>
        <div className="mb-3 flex items-center gap-2 text-semantic-success">
          <LockKeyhole className="h-4 w-4" />
          <span className="text-caption font-bold uppercase tracking-wider">Fixed endpoint</span>
        </div>
        <h3 className="text-sm font-bold">{node.type === "START" ? "Start" : "Complete"}</h3>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          This default node marks where the workflow begins or completes. It is protected from deletion and duplication, but you can move it and connect it on the canvas.
        </p>
      </div>
    );
  }
  const isHumanNode = ["TASK", "INFORMATION_REQUEST"].includes(node.type);
  const directorySections = directory.sections || [];
  const assignmentDepartmentId = directoryIdFromOption(node.assignment?.departmentId, "department");
  const assignmentSectionId = directoryIdFromOption(node.assignment?.sectionId, "section");
  const approvalDepartmentId = directoryIdFromOption(node.approval?.departmentId, "department");
  const selectedAssignmentSection = directorySections.find((section: any) => section.id === assignmentSectionId);
  const departmentUsers = directory.users.filter((user: any) =>
    assignmentSectionId
      ? user.sectionId === assignmentSectionId
      : !assignmentDepartmentId || user.departmentId === assignmentDepartmentId,
  );
  const approvalDepartmentSource = node.approval?.departmentSource || "STATIC";
  const usesDynamicApprovalDepartment = approvalDepartmentSource !== "STATIC";
  const approvalApproverSource = usesDynamicApprovalDepartment && node.approval?.approverSource === "SPECIFIC_USER"
    ? "DEPARTMENT_MEMBERS"
    : node.approval?.approverSource || "DEPARTMENT_MEMBERS";
  const approvalDepartmentUsers = directory.users.filter((user: any) => approvalDepartmentSource !== "STATIC" || !approvalDepartmentId || user.departmentId === approvalDepartmentId);
  const departmentOptions: SelectOption[] = [
    {
      value: "",
      label: "No organisational target",
      sublabel: "Clear the selected department or section",
      badge: "ALL",
    },
    ...[...directory.departments]
      .sort((left: any, right: any) => left.name.localeCompare(right.name, "az"))
      .flatMap((department: any) => [
        {
          value: `department:${department.id}`,
          label: department.name,
          sublabel: department.code ? `Department queue · ${department.code}` : "Department queue",
          badge: department.code,
        },
        ...directorySections
          .filter((section: any) => section.departmentId === department.id)
          .sort((left: any, right: any) => left.name.localeCompare(right.name, "az"))
          .map((section: any) => ({
            value: `section:${section.id}`,
            label: `↳ ${section.name}`,
            sublabel: `Section of ${department.name}${section.code ? ` · ${section.code}` : ""}`,
            badge: section.code || "SECTION",
          })),
      ]),
  ];
  const approvalDepartmentOptions = departmentOptions.filter((option) => option.value === "" || option.value.startsWith("department:"));
  const assignmentTargetValue = assignmentSectionId
    ? `section:${assignmentSectionId}`
    : assignmentDepartmentId
      ? `department:${assignmentDepartmentId}`
      : "";
  const employeeOptions: SelectOption[] = departmentUsers.map((user: any) => ({
    value: user.id,
    label: user.fullName,
    sublabel: [user.title, selectedAssignmentSection?.name || user.sectionName || user.departmentId].filter(Boolean).join(" · "),
    badge: user.roles?.[0]?.replaceAll("_", " "),
  }));
  const approvalUserOptions: SelectOption[] = approvalDepartmentUsers.map((user: any) => ({
    value: user.id,
    label: user.fullName,
    sublabel: [user.title, user.departmentId].filter(Boolean).join(" · "),
    badge: user.roles?.[0]?.replaceAll("_", " "),
  }));
  const rawCondition = node.condition?.clauses?.[0] && !("clauses" in node.condition.clauses[0]) ? node.condition.clauses[0] : undefined;
  const conditionFields = conditionFieldsForWorkflow(workflow, directory, node.id);
  const conditionField: ConditionFieldChoice | undefined = conditionFields.find((field) => field.source === rawCondition?.left?.source && field.path === rawCondition?.left?.path && field.nodeId === rawCondition?.left?.nodeId)
    || (rawCondition?.left?.path ? { id: `legacy-${rawCondition.left.path}`, label: `Saved variable · ${rawCondition.left.path}`, source: rawCondition.left.source === "NODE_OUTPUT" ? "NODE_OUTPUT" : "CONTEXT", path: rawCondition.left.path, nodeId: rawCondition.left.nodeId, kind: "TEXT" as const } : undefined)
    || conditionFields[0];
  const conditionOperators = conditionField ? conditionOperatorsFor(conditionField.kind) : [];
  const selectedOperator = conditionOperators.some((item) => item.value === rawCondition?.operator) ? rawCondition!.operator : conditionOperators[0]?.value || "EQUALS";
  const requiresLiteral = !["EXISTS", "NOT_EXISTS", "IS_TRUE", "IS_FALSE"].includes(selectedOperator);
  const rawLiteral = rawCondition?.right?.source === "LITERAL" ? rawCondition.right.value : "";
  const literalChoices = conditionField?.choices || [];
  const conditionFieldOptions: SelectOption[] = conditionFields.map((field) => {
    const isWorkflowVariable = field.label.startsWith("Workflow variable ·");
    return {
      value: field.id,
      label: field.label,
      sublabel: field.source === "NODE_OUTPUT"
        ? "Completed upstream node output"
        : isWorkflowVariable
          ? "Workflow variable available at runtime"
          : "Requester or current workflow context",
      badge: field.source === "NODE_OUTPUT" ? "OUTPUT" : isWorkflowVariable ? "VARIABLE" : "CONTEXT",
    };
  });
  const conditionOperatorOptions: SelectOption[] = conditionOperators.map((operator) => ({
    value: operator.value,
    label: operator.label,
    sublabel: `For ${conditionField?.kind?.toLowerCase() || "this"} values`,
  }));
  const conditionLiteralOptions: SelectOption[] = [
    ...(!literalChoices.some((choice) => choice.value === rawLiteral) && rawLiteral !== ""
      ? [{ value: String(rawLiteral), label: String(rawLiteral), sublabel: "Saved value" }]
      : []),
    ...literalChoices.map((choice) => ({ value: choice.value, label: choice.label })),
  ];
  const updateCondition = (field: ConditionFieldChoice | undefined, operator = selectedOperator, literal: unknown = rawLiteral) => {
    if (!field) return;
    const needsLiteral = !["EXISTS", "NOT_EXISTS", "IS_TRUE", "IS_FALSE"].includes(operator);
    onChange({
      condition: {
        combinator: "ALL",
        clauses: [{
          left: { source: field.source, path: field.path, ...(field.nodeId ? { nodeId: field.nodeId } : {}) },
          operator,
          ...(needsLiteral ? { right: { source: "LITERAL", value: literal } } : {}),
        }],
      },
    });
  };
  return (
  <div>
    <div className="mb-4 flex items-center justify-between">
      <div>
        <div className="text-caption font-bold uppercase tracking-wider text-semantic-success">
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
    {["INPUT", "TICKET_INPUT"].includes(node.type) && (
      <InputNodeFormEditor
        node={node}
        onChange={onChange}
        directory={directory}
        currentUser={currentUser}
      />
    )}
    {isHumanNode && (
      <>
        <label className="mb-3 block">
          <span className="mini-label">Department / section</span>
          <CustomSelect
            id={`workflow-node-department-${node.id}`}
            value={assignmentTargetValue}
            onChange={(target) => {
              const [kind, id] = target.split(":", 2);
              const normalizedId = directoryIdFromOption(id, kind === "section" ? "section" : "department");
              const section = kind === "section" ? directorySections.find((item: any) => item.id === normalizedId) : undefined;
              const departmentId = kind === "department" ? id : section?.departmentId;
              onChange({
                assignment: {
                  ...(node.assignment || {}),
                  departmentId: directoryIdFromOption(departmentId, "department"),
                  sectionId: section?.id,
                  groupId: undefined,
                  assigneeId: undefined,
                },
              });
            }}
            options={departmentOptions}
            placeholder="Select department or section…"
            searchPlaceholder="Search department, section or AD code…"
            className="mt-1"
          />
          <span className="mt-1 block text-xs leading-4 text-semantic-muted">
            Sections are active AD-linked units. A section route limits the queue and employee list to that section; a department route keeps the full department queue.
          </span>
        </label>
        <label className="mb-3 block">
          <span className="mini-label">Assign type</span>
          <select
            value={node.assignment?.strategy || "UNASSIGNED_TEAM_QUEUE"}
            onChange={(event) => onChange({ assignment: { ...(node.assignment || {}), strategy: event.target.value, assigneeId: undefined } })}
            className="wrike-input mt-1 w-full"
          >
            <option value="DEPARTMENT_OWNER">Department / branch manager</option>
            <option value="FIXED_PERSON">Specific department employee</option>
            <option value="UNASSIGNED_TEAM_QUEUE">Anyone in this department / branch</option>
          </select>
        </label>
        {node.assignment?.strategy === "FIXED_PERSON" && (
          <label className="mb-3 block">
            <span className="mini-label">Eligible employee</span>
            <CustomSelect
              id={`workflow-node-employee-${node.id}`}
              value={node.assignment?.assigneeId || ""}
              onChange={(assigneeId) => onChange({ assignment: { ...(node.assignment || {}), assigneeId: assigneeId || undefined } })}
              options={employeeOptions}
              placeholder={assignmentDepartmentId ? "Select eligible employee…" : "Select a department or section first…"}
              searchPlaceholder="Search eligible employee or title…"
              disabled={!assignmentDepartmentId}
              className="mt-1"
            />
          </label>
        )}
        <div className={`mb-3 rounded-lg border p-3 text-label leading-4 ${node.type === "TASK" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-teal-200 bg-teal-50 text-teal-900"}`}>
          {node.type === "TASK"
            ? "The assigned person confirms this task through a “I confirm” dialog; that decision is recorded in the workflow audit trail."
            : "Information request creates a persisted, authorized response work item. The workflow pauses until the recipient submits the requested information."}
        </div>
      </>
    )}
    {node.type === "APPROVAL" && (
      <>
        <label className="mb-3 block">
          <span className="mini-label">Şöbə / filial mənbəyi</span>
          <select
            value={approvalDepartmentSource}
            onChange={(event) =>
              onChange({
                approval: {
                  ...node.approval,
                  departmentSource: event.target.value,
                  departmentId: undefined,
                  specificUserIds: undefined,
                  ...(event.target.value !== "STATIC" && node.approval?.approverSource === "SPECIFIC_USER"
                    ? { approverSource: "DEPARTMENT_MEMBERS" }
                    : {}),
                },
              })
            }
            className="wrike-input mt-1 w-full"
          >
            <option value="STATIC">Sabit şöbə / filial</option>
            <option value="REQUESTER_DEPARTMENT">Sorğunu yaradanın şöbə / filialı</option>
            <option value="REQUESTER_PARENT_DEPARTMENT">Sorğunu yaradanın üst şöbəsi</option>
            <option value="TICKET_DEPARTMENT">Formda seçilən şöbə / filial</option>
            <option value="TICKET_PARENT_DEPARTMENT">Formda seçilən şöbənin üst şöbəsi</option>
          </select>
        </label>
        {approvalDepartmentSource === "STATIC" && (
          <label className="mb-3 block">
            <span className="mini-label">Sabit şöbə / filial</span>
            <select
              id={`workflow-approval-department-${node.id}`}
              value={approvalDepartmentId ? `department:${approvalDepartmentId}` : ""}
              onChange={(event) =>
                onChange({
                  approval: {
                    ...node.approval,
                    departmentId: directoryIdFromOption(event.target.value, "department"),
                    specificUserIds: undefined,
                  },
                })
              }
              className="wrike-input mt-1 w-full cursor-pointer"
              aria-label="Sabit şöbə və ya filial seçin"
            >
              {approvalDepartmentOptions.map((department) => (
                <option key={department.value} value={department.value}>
                  {department.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="mb-3 block">
          <span className="mini-label">Assign approval to</span>
          <select
            value={approvalApproverSource}
            onChange={(event) =>
              onChange({
                approval: {
                  ...node.approval,
                  approverSource: event.target.value,
                  specificUserIds: undefined,
                  role: undefined,
                },
              })
            }
            className="wrike-input mt-1 w-full"
          >
            <option value="DEPARTMENT_MEMBERS">Anyone in department / branch</option>
            <option value="DEPARTMENT_HEAD">Department / branch head</option>
            {!usesDynamicApprovalDepartment && <option value="SPECIFIC_USER">Specific user</option>}
            {node.approval?.approverSource && !["DEPARTMENT_MEMBERS", "DEPARTMENT_HEAD", "SPECIFIC_USER"].includes(node.approval.approverSource) && (
              <option value={node.approval.approverSource}>{node.approval.approverSource.replaceAll("_", " ")} (legacy)</option>
            )}
          </select>
        </label>
        {!usesDynamicApprovalDepartment && node.approval?.approverSource === "SPECIFIC_USER" && (
          <label className="mb-3 block">
            <span className="mini-label">Specific user</span>
            <CustomSelect
              id={`workflow-approval-user-${node.id}`}
              value={node.approval?.specificUserIds?.[0] || ""}
              onChange={(assigneeId) => onChange({ approval: { ...node.approval, specificUserIds: assigneeId ? [assigneeId] : [] } })}
              options={approvalUserOptions}
              placeholder={node.approval?.departmentId ? "Select user in this department…" : "Select user…"}
              searchPlaceholder="Search user, title or role…"
              className="mt-1"
            />
          </label>
        )}
        {node.approval?.approverSource === "ROLE" && (
          <label className="mb-3 block">
            <span className="mini-label">LDAP-derived approver role</span>
            <select value={node.approval?.role || ""} onChange={(event) => onChange({ approval: { ...node.approval, role: event.target.value || undefined } })} className="wrike-input mt-1 w-full">
              <option value="">Select role…</option>
              {directory.roles.map((role: string) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}
            </select>
          </label>
        )}
        {node.approval?.approverSource === "DYNAMIC_EXPRESSION" && (
          <label className="mb-3 block">
            <span className="mini-label">Context user path</span>
            <input value={node.approval?.dynamicPath || ""} onChange={(event) => onChange({ approval: { ...node.approval, dynamicPath: event.target.value } })} className="wrike-input mt-1 w-full" placeholder="currentAssigneeId" />
          </label>
        )}
        <label className="mb-3 block">
          <span className="mini-label">Escalation path</span>
          <select
            value={node.approval?.escalationSource || ""}
            onChange={(event) =>
              onChange({
                approval: {
                  ...node.approval,
                  escalationSource: event.target.value || undefined,
                },
              })
            }
            className="wrike-input mt-1 w-full"
          >
            <option value="">No escalation</option>
            <option value="DEPARTMENT_HEAD">Department / branch head</option>
            <option value="REQUESTER_MANAGER">Requester manager</option>
            <option value="ROLE">Directory role</option>
            <option value="CAB_BOARD">Governance / CAB board</option>
          </select>
          <span className="mt-1 block text-xs leading-4 text-semantic-muted">
            The selected resolver is added when the approval reaches its timeout.
          </span>
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
        <DurationField
          label="Approval timeout"
          value={node.approval?.timeoutMinutes}
          onChange={(timeoutMinutes) =>
            onChange({ approval: { ...node.approval, timeoutMinutes } })
          }
        />
        <DurationField
          label="Reminder interval"
          value={node.approval?.reminderMinutes}
          onChange={(reminderMinutes) =>
            onChange({ approval: { ...node.approval, reminderMinutes } })
          }
        />
        <div className="mb-3 grid grid-cols-2 gap-2 text-label font-semibold text-slate-600">
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
        <DurationField
          label="Duration / offset"
          value={node.timer?.durationMinutes ?? node.timer?.offsetMinutes}
          onChange={(minutes) =>
            onChange({
              timer: {
                ...node.timer,
                durationMinutes: minutes,
                offsetMinutes: minutes,
              },
            })
          }
        />
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
            value={node.join?.strategy === "ANY" ? "ANY" : "ALL"}
            onChange={(event) =>
              onChange({ join: { strategy: event.target.value } })
            }
            className="wrike-input mt-1 w-full"
          >
            <option value="ALL">ALL — AND: bütün qollar tamamlanmalıdır</option>
            <option value="ANY">ANY — OR: istənilən bir qol kifayətdir</option>
          </select>
        </label>
        <p className="-mt-1 mb-3 text-label leading-4 text-slate-500">
          ALL növbəti node-a AND məntiqi ilə, ANY isə OR məntiqi ilə keçir.
        </p>
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
        <div className="mini-label mb-1">Decision rule</div>
        <p className="mb-3 text-caption leading-4 text-slate-500">Choose data that exists at runtime. The server evaluates this rule; the canvas only displays the saved decision.</p>
        <div className="grid gap-3">
          <label>
            <span className="mini-label">1. Check this data</span>
            <CustomSelect
              id={`condition-field-${node.id}`}
              value={conditionField?.id || ""}
              onChange={(fieldId) => {
              const nextField = conditionFields.find((field) => field.id === fieldId);
              const nextOperator = nextField ? conditionOperatorsFor(nextField.kind)[0]?.value || "EQUALS" : "EQUALS";
              updateCondition(nextField, nextOperator, nextField?.choices?.[0]?.value || "");
              }}
              options={conditionFieldOptions}
              placeholder="Select workflow data…"
              searchPlaceholder="Search requester, form field or output…"
              className="mt-1"
            />
          </label>
          <label>
            <span className="mini-label">2. Apply this rule</span>
            <CustomSelect
              id={`condition-operator-${node.id}`}
              value={selectedOperator}
              onChange={(operator) => updateCondition(conditionField, operator, literalChoices.some((choice) => choice.value === rawLiteral) ? rawLiteral : literalChoices[0]?.value || "")}
              options={conditionOperatorOptions}
              searchable={false}
              className="mt-1"
            />
          </label>
          {requiresLiteral && (literalChoices.length ? (
            <label>
              <span className="mini-label">3. Compare with</span>
              <CustomSelect
                id={`condition-value-${node.id}`}
                value={String(rawLiteral ?? "")}
                onChange={(literal) => updateCondition(conditionField, selectedOperator, literal)}
                options={conditionLiteralOptions}
                placeholder="Select a permitted value…"
                searchable={literalChoices.length > 7}
                searchPlaceholder="Search permitted values…"
                className="mt-1"
              />
            </label>
          ) : (
            <label>
              <span className="mini-label">3. Compare with</span>
              <input type={conditionField?.kind === "NUMBER" ? "number" : conditionField?.kind === "DATE" ? "date" : "text"} value={String(rawLiteral ?? "")} onChange={(event) => updateCondition(conditionField, selectedOperator, conditionField?.kind === "NUMBER" && event.target.value !== "" ? Number(event.target.value) : event.target.value)} className="wrike-input mt-1 w-full" placeholder={conditionField?.kind === "TEXT" ? "Enter the text to compare" : "Enter comparison value"} />
            </label>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-2 text-caption leading-4 text-blue-800">Connect each path from its own port: <strong className="text-emerald-700">Yes</strong> (green, top) and <strong className="text-amber-700">No</strong> (amber, bottom). Only one of these branches runs.</div>
      </div>
    )}
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-label text-slate-500">
      Node ID: <code>{node.id}</code>
      <br />
      For decisions, drag from the labeled Yes or No port, then choose the next
      node. The branch outcome is saved with the edge.
    </div>
  </div>
);
};

const RuntimeView = ({ instances, execution, onOpen, onComplete, onClaim, onDecision, onRetry, onComment }: any) => {
  const [comment, setComment] = useState("");
  const [confirmationItem, setConfirmationItem] = useState<any>(null);
  const [informationResponse, setInformationResponse] = useState("");
  return (
  <div className="flex min-h-0 flex-1">
    <aside className="w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-bold">Workflow executions</h2>
      <div className="space-y-2">
        {instances.map((instance: any) => (
          <button
            key={instance.id}
            onClick={() => onOpen(instance.id)}
            className={`w-full rounded-xl border p-3 text-left ${execution?.instance?.id === instance.id ? "border-semantic-brand bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}
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
            <div className="mt-1 text-caption uppercase text-slate-400">
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
          <div className="mb-6 grid grid-cols-4 gap-3">
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
              <h3 className="mb-3 text-sm font-bold">Workflow progress</h3>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-2xl font-bold text-slate-900">
                      {execution.progress.completed} / {execution.progress.total}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Activities completed</div>
                  </div>
                  <StatusPill status={execution.instance.status} />
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${execution.progress.total ? Math.round((execution.progress.completed / execution.progress.total) * 100) : 0}%` }}
                  />
                </div>
              </div>

              {execution.instance?.context && Object.keys(execution.instance.context).length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <ClipboardEdit className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Ticket Intake Data</span>
                    </h4>
                    <span className="text-caption text-slate-400 font-semibold">
                      Validated Launch Parameters
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 rounded-xl bg-slate-50 p-3 text-xs">
                    {Object.entries(execution.instance.context).map(([key, value]) => {
                      if (["currentStageId", "activeNodeIds"].includes(key)) return null;
                      return (
                        <div key={key} className="rounded-lg bg-white p-2 border border-slate-200/70">
                          <span className="text-caption font-bold text-slate-500 capitalize">
                            {key.replace(/([A-Z])/g, " $1").replaceAll("_", " ")}
                          </span>
                          <div className="mt-0.5 truncate font-semibold text-slate-800">
                            {typeof value === "boolean" ? (
                              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-caption font-bold ${value ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                                {value ? "Yes / Confirmed" : "No"}
                              </span>
                            ) : typeof value === "object" && value !== null ? (
                              JSON.stringify(value)
                            ) : (
                              String(value || "—")
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
            <aside className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-bold">Active work</h3>
                <div className="space-y-2">
                  {execution.workItems
                    .filter(
                      (item: any) =>
                        !["COMPLETED", "CANCELLED"].includes(item.status) &&
                        item.workType !== "APPROVAL_REQUEST",
                    )
                    .map((item: any) => {
                      const isInformationRequest = execution.nodes.some((node: any) => node.id === item.nodeInstanceId && node.nodeType === "INFORMATION_REQUEST");
                      return <div
                        key={item.id}
                        className="rounded-xl border border-slate-200 p-3"
                      >
                        <div className="text-xs font-bold text-blue-700">
                          {item.key}
                        </div>
                        <div className="mt-1 text-sm font-semibold">
                          {item.title}
                        </div>
                        <div className="mt-1 text-caption text-slate-500">
                          {item.assignmentGroupId || "Workflow owner queue"} ·{" "}
                          {item.status}
                        </div>
                        {item.status !== "IN_PROGRESS" && (
                          <button onClick={() => onClaim(item.id)} className="wrike-btn-secondary mt-3 w-full py-1.5 text-xs">Claim work</button>
                        )}
                        <button
                          onClick={() => { setInformationResponse(""); setConfirmationItem({ ...item, isInformationRequest }); }}
                          className="wrike-btn-primary mt-2 w-full py-1.5 text-xs"
                        >
                          {isInformationRequest ? "Provide response" : "I confirm"}
                        </button>
                      </div>;
                    })}
                  {!execution.workItems.some(
                    (item: any) =>
                      !["COMPLETED", "CANCELLED"].includes(item.status) &&
                      item.workType !== "APPROVAL_REQUEST",
                  ) && (
                    <p className="text-xs text-slate-400">
                      No active human work.
                    </p>
                  )}
                </div>
              </section>
              {execution.approvals?.filter((chain: any) => chain.status === "PENDING").length > 0 && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="mb-3 text-sm font-bold text-amber-900">Pending approvals</h3>
                  <div className="space-y-3">
                    {execution.approvals.filter((chain: any) => chain.status === "PENDING").map((chain: any) => (
                      <div key={chain.id} className="rounded-xl border border-amber-200 bg-white p-3">
                        <div className="text-xs font-bold">{chain.title}</div>
                        {chain.steps.filter((step: any) => step.status === "PENDING").map((step: any) => (
                          <div key={step.id} className="mt-2 rounded-lg bg-slate-50 p-2">
                            <div className="text-caption text-slate-600">{step.assignedApproverName || step.requiredRole || "Eligible approval queue"}</div>
                            {step.canDecide ? (
                              <div className="mt-2 flex gap-2">
                                <button onClick={() => onDecision(chain.id, step.id, "APPROVED")} className="flex-1 rounded bg-emerald-600 px-2 py-1.5 text-caption font-bold text-white">Approve</button>
                                <button onClick={() => onDecision(chain.id, step.id, "REJECTED")} className="flex-1 rounded bg-red-600 px-2 py-1.5 text-caption font-bold text-white">Reject + comment</button>
                              </div>
                            ) : (
                              <div className="mt-2 text-caption text-slate-500">Waiting for the assigned approver.</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {execution.deadLetters?.some((entry: any) => entry.status !== "RESOLVED") && <section className="rounded-2xl border border-red-200 bg-red-50 p-4"><h3 className="mb-3 text-sm font-bold text-red-800">Failed automation recovery</h3><div className="space-y-2">{execution.deadLetters.filter((entry: any) => entry.status !== "RESOLVED").map((entry: any) => <div key={entry.id} className="rounded-xl border border-red-200 bg-white p-3"><div className="text-xs font-bold">{entry.actionKey}</div><div className="mt-1 line-clamp-2 text-caption text-red-700">{entry.error}</div><button onClick={() => onRetry(entry.id)} className="wrike-btn-secondary mt-2 w-full py-1.5 text-xs">Requeue safely</button></div>)}</div></section>}
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold">Governed lifecycle</h3>
                  <span className="text-caption font-bold text-slate-400">
                    {execution.notifications?.length || 0} notices
                  </span>
                </div>
                <div className="space-y-2">
                  {execution.slaClocks?.map((clock: any) => (
                    <div
                      key={clock.id}
                      className="rounded-lg border border-slate-200 p-2"
                    >
                      <div className="flex items-center justify-between text-label font-bold">
                        <span>{clock.label}</span>
                        <StatusPill status={clock.status} />
                      </div>
                      <div className="mt-1 text-caption text-slate-500">
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
                        className="mb-1 text-caption text-slate-600"
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
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold">Participants & comments</h3>
                  <span className="text-caption font-bold text-slate-400">{execution.participants?.length || 0} participants</span>
                </div>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {execution.participants?.map((participant: any) => <span key={participant.id} className="rounded-full bg-slate-100 px-2 py-1 text-caption font-semibold text-slate-700" title={participant.title}>{participant.fullName}</span>)}
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {execution.comments?.map((entry: any) => <div key={entry.id} className="rounded-lg bg-slate-50 p-2"><div className="text-caption font-bold text-slate-700">{entry.authorName} · {new Date(entry.createdAt).toLocaleString()}</div><p className="mt-1 whitespace-pre-wrap text-label text-slate-600">{entry.body}</p></div>)}
                  {!execution.comments?.length && <p className="text-xs text-slate-400">No comments yet.</p>}
                </div>
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} maxLength={5000} className="wrike-input mt-3 w-full resize-y" placeholder="Add an auditable update or decision context…" />
                <button type="button" disabled={!comment.trim()} onClick={() => { const body = comment.trim(); if (!body) return; onComment(body); setComment(""); }} className="wrike-btn-primary mt-2 w-full py-1.5 text-xs disabled:opacity-50">Add comment</button>
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
                        <div className="text-label font-bold">
                          {event.type.replaceAll("_", " ")}
                        </div>
                        <div className="text-caption text-slate-400">
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
    {confirmationItem && (
      <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-labelledby="task-confirmation-title">
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></div>
            <div>
              <h3 id="task-confirmation-title" className="text-base font-bold text-slate-900">{confirmationItem.isInformationRequest ? "Provide requested information" : "Confirm task"}</h3>
              <p className="mt-1 text-sm text-slate-600">{confirmationItem.isInformationRequest ? `Respond to “${confirmationItem.title}”. Your response will be retained in the workflow timeline.` : `Are you confirming that “${confirmationItem.title}” has been completed?`}</p>
            </div>
          </div>
          {confirmationItem.isInformationRequest ? (
            <textarea value={informationResponse} onChange={(event) => setInformationResponse(event.target.value)} rows={4} maxLength={5000} className="wrike-input mt-4 w-full resize-y" placeholder="Provide the requested information…" />
          ) : <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">Your confirmation is recorded with your authenticated identity in the workflow audit trail.</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirmationItem(null)} className="wrike-btn-secondary px-3 py-2 text-xs">Cancel</button>
            <button disabled={confirmationItem.isInformationRequest && !informationResponse.trim()} onClick={() => { onComplete(confirmationItem.id, confirmationItem.isInformationRequest ? { response: informationResponse.trim(), respondedFrom: "runtime-workspace" } : { confirmation: "APPROVED", confirmedFrom: "runtime-workspace" }); setConfirmationItem(null); }} className="wrike-btn-primary px-3 py-2 text-xs disabled:opacity-50">{confirmationItem.isInformationRequest ? "Submit response" : "I confirm"}</button>
          </div>
        </div>
      </div>
    )}
  </div>
  );
};

const AnalyticsView = ({ analytics }: any) => (
  <div className="flex-1 overflow-y-auto p-6">
    <div className="mx-auto max-w-6xl">
      <h2 className="text-xl font-bold">Workflow analytics</h2>
      <p className="mt-1 text-sm text-slate-500">
        Operational performance across workflow, node, approval, and
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
                  className="h-full rounded-full bg-semantic-brand"
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
    <div className="text-caption font-bold uppercase tracking-wider text-slate-400">
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
    className={`rounded-full px-2 py-0.5 text-caption font-bold ${status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : status === "FAILED" || status === "REJECTED" ? "bg-red-100 text-red-700" : status === "WAITING" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}
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
