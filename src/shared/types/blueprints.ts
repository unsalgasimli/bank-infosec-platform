export interface BlueprintTaskTemplate {
  id?: string;
  title: string;
  description: string;
  technicalSeverity: 'INFORMATIONAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  businessPriority: 'P1_URGENT' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW';
  category: 'VULNERABILITY' | 'INCIDENT' | 'SECURITY_EXCEPTION' | 'SECURITY_REVIEW' | 'AUDIT_FINDING' | 'IAM_REQUEST' | 'GENERAL_REQUEST';
  targetDepartment?: string;
  assigneeRole?: string;
  assigneeId?: string;
  offsetDays: number;
  durationDays: number;
  dependsOnIndex?: number | null;
  tags: string[];
}

export interface ProjectBlueprint {
  id: string;
  title: string;
  domain: string;
  departmentId?: string;
  isCrossDepartment?: boolean;
  participatingDepartments?: string[];
  taskCount: number;
  estimatedDays: number;
  description: string;
  iconName: string;
  defaultTasks: BlueprintTaskTemplate[];
  createdAt?: string;
  updatedAt?: string;
}

