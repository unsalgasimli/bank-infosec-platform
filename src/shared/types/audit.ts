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
    | 'USER_CREATE'
    | 'USER_UPDATE'
    | 'USER_DELETE'
    | 'USER_SYNC'
    | 'LDAP_AUTH_SUCCESS'
    | 'LDAP_AUTH_FAILED'
    | 'PROJECT_CREATED'
    | 'PROJECT_UPDATED'
    | 'PROJECT_ARCHIVED'
    | 'PROJECT_MEMBER_ADDED'
    | 'PROJECT_MEMBER_REMOVED'
    | 'PROJECT_PERMISSION_CHANGED'
    | 'PROJECT_MILESTONE_UPDATED'
    | 'PROJECT_TASK_UPDATED'
    | 'PROJECT_STATUS_UPDATED'
    | 'CMDB_CI_CREATED'
    | 'CMDB_CI_UPDATED'
    | 'CMDB_CI_RETIRED'
    | 'CMDB_RELATIONSHIP_CREATED'
    | 'CMDB_RELATIONSHIP_REMOVED'
    | 'CMDB_CI_MERGED';


  entityType: 'TICKET' | 'COMMENT' | 'ATTACHMENT' | 'APPROVAL' | 'USER' | 'WORKFLOW' | 'SLA_POLICY' | 'SECURITY_EXCEPTION' | 'USER_DIRECTORY' | 'DEPARTMENT' | 'PROJECT' | 'PROJECT_MEMBER' | 'PROJECT_MILESTONE' | 'PROJECT_RISK' | 'CONFIGURATION_ITEM' | 'CI_RELATIONSHIP';
  entityId: string;
  entityKey?: string;
  
  fieldChanges?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  
  metadata?: Record<string, any>;
}
