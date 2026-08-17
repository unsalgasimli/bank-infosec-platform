export type BankRole =
  | 'PLATFORM_ADMIN'
  | 'INFOSEC_ADMIN'
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

export interface BankDivision {
  id: string;
  name: string;
  code: string;
}

export interface BankDepartment {
  id: string;
  divisionId: string;
  name: string;
  code: string;
  managerId?: string;
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
  teamIds: string[];
  roles: BankRole[];
  securityClearance: ConfidentialityTier;
  ownedApplicationIds: string[];
  ownedAssetIds: string[];
  ownedRiskIds: string[];
  isActive: boolean;
  avatarUrl?: string;
  phone?: string;
}

export interface ABACContext {
  user: BankUser;
  action: 'READ' | 'WRITE' | 'CREATE' | 'DELETE' | 'APPROVE' | 'TRANSITION' | 'EXPORT' | 'ADMIN';
  resourceType: 'TICKET' | 'COMMENT' | 'ATTACHMENT' | 'ASSET' | 'APP' | 'RISK' | 'EXCEPTION' | 'REPORT' | 'AUDIT';
  resource?: any;
}
