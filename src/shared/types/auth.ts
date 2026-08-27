export type BankRole =
  | 'PLATFORM_ADMIN'
  | 'DEPARTMENT_ADMIN'
  | 'INFOSEC_ADMIN'
  | 'IT_ADMIN'
  | 'HR_ADMIN'
  | 'CORE_BANK_ADMIN'
  | 'LEGAL_ADMIN'
  | 'CISO'
  | 'INFOSEC_MANAGER'
  | 'TEAM_LEAD'
  | 'SECURITY_ANALYST'
  | 'SOC_ANALYST'
  | 'GRC_ANALYST'
  | 'APPSEC_ANALYST'
  | 'DLP_ANALYST'
  | 'VULN_ANALYST'
  | 'AUDITOR'
  | 'DEPARTMENT_MANAGER'
  | 'ASSIGNEE'
  | 'REQUESTER'
  | 'APPROVER'
  | 'RISK_OWNER'
  | 'APPLICATION_OWNER'
  | 'ASSET_OWNER'
  | 'READ_ONLY_USER'
  | 'EXTERNAL_VENDOR';

export type SecurityDomain =
  | 'GENERAL_INFOSEC'
  | 'SOC'
  | 'VULNERABILITY_MGMT'
  | 'APPSEC'
  | 'GRC'
  | 'DLP'
  | 'IAM_PAM'
  | 'SEC_ARCHITECTURE'
  | 'AUDIT_COMPLIANCE'
  | 'THIRD_PARTY_RISK';

export type ConfidentialityTier =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'RESTRICTED'
  | 'CONFIDENTIAL_SECURITY_ONLY'
  | 'HIGHLY_RESTRICTED_HR_LEGAL';

export type SecurityClearanceLevel = ConfidentialityTier;

export interface BankDivision {
  id: string;
  name: string;
  code: string;
}

export interface DepartmentSettings {
  defaultSlaHours?: number;
  criticalSlaHours?: number;
  autoAssignEnabled?: boolean;
  defaultAssigneeId?: string;
  requireDualApproval?: boolean;
  allowedTicketCategories?: string[];
  workingHours?: {
    start: string; // e.g. "09:00"
    end: string;   // e.g. "18:00"
    timezone: string; // e.g. "Asia/Baku"
  };
  notifications?: {
    emailAlerts: boolean;
    slackWebhook?: string;
    escalateAfterHours: number;
  };
}

export interface BankDepartment {
  id: string;
  divisionId: string;
  name: string;
  code: string;
  description?: string;
  managerId?: string;
  adminUserIds?: string[];
  color?: string;
  icon?: string;
  isActive?: boolean;
  memberCount?: number;
  connectionCount?: number;
  templateCount?: number;
  activeTaskCount?: number;
  sections?: BankDepartmentSection[];
  sectionCount?: number;
  managerName?: string;
  managerEmail?: string;
  settings?: DepartmentSettings;
  createdAt?: string;
  updatedAt?: string;
  /** Set only after this record is confirmed by a successful live AD sync. */
  directorySource?: 'ACTIVE_DIRECTORY';
}

/** A child organisational unit (şöbə/bölmə) owned by a department. */
export interface BankDepartmentSection {
  id: string;
  departmentId: string;
  name: string;
  code: string;
  /** 'SOBE' (Section with Manager) | 'BOLME' (Sub-unit under Section, NO Manager) | 'SEKTOR' */
  sectionType?: 'SOBE' | 'BOLME' | 'SEKTOR' | 'GROUP';
  /** If this is a Bölmə (sub-unit), parentSectionId points to the parent Şöbə. */
  parentSectionId?: string;
  /** Bölmə has no manager of its own (false); Şöbə has a manager (true). */
  hasOwnManager?: boolean;
  managerId?: string;
  managerName?: string;
  managerEmail?: string;
  isActive?: boolean;
  memberCount?: number;
  createdAt?: string;
  updatedAt?: string;
  /** Set only after this record is confirmed by a successful live AD sync. */
  directorySource?: 'ACTIVE_DIRECTORY';
}

export interface BankTeam {
  id: string;
  departmentId: string;
  name: string;
  code: string;
  leadId?: string;
  securityDomain?: SecurityDomain;
}

export interface BankUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  title: string;
  divisionId: string;
  departmentId: string;
  /** AD-confirmed Section (Şöbə) under departmentId. */
  sectionId?: string;
  sectionName?: string;
  /** Hydrated section relation returned by department detail endpoints. */
  section?: BankDepartmentSection;
  /** AD-confirmed Sub-unit (Bölmə) under Section (Şöbə). Has no separate manager. */
  unitId?: string;
  unitName?: string;
  teamIds: string[];
  roles: BankRole[];
  securityClearance: ConfidentialityTier;
  managerId?: string;
  ownedApplicationIds: string[];
  ownedAssetIds: string[];
  ownedRiskIds: string[];
  isActive: boolean;
  avatarUrl?: string;
  phone?: string;
  // Active Directory / LDAP attributes
  sAMAccountName?: string;
  /** Stable Active Directory object identity; survives username renames. */
  directoryObjectGuid?: string;
  /** Optional reference to the imported HR baseline employee number. */
  baselineEmployeeId?: string;
  userPrincipalName?: string;
  distinguishedName?: string;
  ldapDomain?: string;
  distributionGroups?: string[];
  ldapBindStatus?: 'BOUND' | 'AUTHENTICATED';
  lastLdapLoginAt?: string;
  /** Set only after this profile is confirmed by a successful live AD bind/sync. */
  directorySource?: 'ACTIVE_DIRECTORY';
  /** Identity classification is separate from AD group memberships and access roles. */
  directoryAccountType?: 'HUMAN' | 'SERVICE' | 'TEST' | 'TECHNICAL' | 'PRIVILEGED';
  /** Only verified human identities participate in department trees and assignment pickers. */
  organizationEligible?: boolean;
  /** If this was a technical/suffix account, link to canonical username */
  primaryUsername?: string;
}

export interface ApprovalChainNode {
  level: 'DIRECT_MANAGER' | 'SECTION_MANAGER' | 'DEPARTMENT_MANAGER' | 'CISO';
  userId: string;
  userName: string;
  fullName: string;
  title: string;
  email: string;
  entityType: 'DIRECT_REPORT' | 'SECTION' | 'DEPARTMENT';
  entityName: string;
}

export interface UserApprovalHierarchy {
  userId: string;
  username: string;
  fullName: string;
  title: string;
  departmentId: string;
  departmentName: string;
  departmentManager?: { id: string; name: string; email: string; title: string };
  sectionId?: string;
  sectionName?: string;
  sectionManager?: { id: string; name: string; email: string; title: string };
  unitId?: string;
  unitName?: string;
  directManager?: { id: string; name: string; email: string; title: string };
  approvalChain: ApprovalChainNode[];
}

export interface LDAPLoginPayload {
  usernameOrEmail: string;
  password?: string;
}

export interface LDAPGroupInfo {
  name: string;
  distinguishedName: string;
  description: string;
  type: 'SECURITY_DISTRIBUTION_GROUP' | 'SECURITY_GROUP' | 'DISTRIBUTION_GROUP';
  isInfosecGroup: boolean;
  memberCount: number;
}

export interface AuthSessionResponse {
  success: boolean;
  user: BankUser;
  ldapInfo?: {
    server: string;
    bindDn: string;
    distributionGroup: string;
    authenticatedAt: string;
    kerberosTicketIssued?: boolean;
  };
  message?: string;
}

export interface ABACContext {
  user: BankUser;
  action: 'READ' | 'WRITE' | 'CREATE' | 'DELETE' | 'APPROVE' | 'TRANSITION' | 'EXPORT' | 'ADMIN';
  resourceType: 'TICKET' | 'COMMENT' | 'ATTACHMENT' | 'ASSET' | 'APP' | 'RISK' | 'EXCEPTION' | 'REPORT' | 'AUDIT';
  resource?: any;
}
