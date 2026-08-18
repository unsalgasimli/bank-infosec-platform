export interface RequestFormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'number';
  required: boolean;
  options?: string[];
  placeholder?: string;
  defaultValue?: any;
  conditionalOn?: {
    fieldId: string;
    value: any;
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
