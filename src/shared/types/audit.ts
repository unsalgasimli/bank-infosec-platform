export interface AuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  ipAddress: string;
  userAgent: string;
  correlationId: string;
  
  action:
    | 'TICKET_CREATED'
    | 'TICKET_UPDATED'
    | 'STATUS_TRANSITIONED'
    | 'ASSIGNMENT_CHANGED'
    | 'COMMENT_ADDED'
    | 'ATTACHMENT_UPLOADED'
    | 'ATTACHMENT_DOWNLOADED'
    | 'APPROVAL_DECISION'
    | 'SLA_BREACHED'
    | 'SLA_PAUSED'
    | 'SLA_RESUMED'
    | 'RISK_ACCEPTED'
    | 'EXCEPTION_CREATED'
    | 'EXCEPTION_EXPIRED'
    | 'BULK_UPDATE'
    | 'FINDING_INGESTED'
    | 'RESTRICTED_ACCESS_VIEWED'
    | 'ADMIN_CONFIG_CHANGED'
    | 'USER_LOGIN'
    | 'USER_LOGOUT'
    | 'LDAP_AUTH_SUCCESS'
    | 'LDAP_AUTH_FAILED';


  entityType: 'TICKET' | 'COMMENT' | 'ATTACHMENT' | 'APPROVAL' | 'USER' | 'WORKFLOW' | 'SLA_POLICY' | 'SECURITY_EXCEPTION';
  entityId: string;
  entityKey?: string;
  
  fieldChanges?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  
  metadata?: Record<string, any>;
}
