export interface RequestFormField {
  id: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'date'
    | 'datetime'
    | 'select'
    | 'multi-select'
    | 'radio'
    | 'checkbox'
    | 'user'
    | 'group'
    | 'asset'
    | 'service'
    | 'ip-address'
    | 'url'
    | 'email'
    | 'file'
    | 'risk'
    | 'confidential'
    | 'calculated'
    | 'hidden';
  required: boolean;
  options?: string[];
  placeholder?: string;
  defaultValue?: any;
  conditionalOn?: {
    fieldId: string;
    operator?: 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'CONTAINS' | 'IS_SET';
    value?: any;
  };
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    allowedExtensions?: string[];
    maxFileSizeMb?: number;
  };
}

export interface RequestFormDefinition {
  id: string;
  title: string;
  category: string;
  iconName: string;
  color: string;
  description: string;
  destinationFolder: string;
  defaultSeverity: string;
  defaultPriority: string;
  defaultTicketType: string;
  workflowId?: string;
  slaPolicyId?: string;
  approvalPolicyId?: string;
  defaultGroupId?: string;
  visibility?: 'PUBLIC_INTERNAL' | 'TEAM_ONLY' | 'SECURITY_ONLY' | 'RESTRICTED' | 'CONFIDENTIAL';
  allowedRequesterRoleIds?: string[];
  fields: RequestFormField[];
  isActive: boolean;
}

export interface RequestFormSubmission {
  id: string;
  formId: string;
  submittedByUserId: string;
  submittedByUserName: string;
  values: Record<string, any>;
  createdTicketId: string;
  createdTicketKey: string;
  createdAt: string;
}
