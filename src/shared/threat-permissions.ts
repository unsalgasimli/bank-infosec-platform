import type { BankRole, BankUser } from './types/auth.js';
export const threatCapabilities = {
  'threat_model.appsec_review':['APPSEC_ANALYST','INFOSEC_ADMIN','INFOSEC_MANAGER','CISO'],
  'threat_model.architecture_review':['SECURITY_ARCHITECT'],
  'threat_model.release_authorize':['RELEASE_AUTHORITY'],
  'threat_model.risk_accept':['CISO','RISK_OWNER'],
  'threat_model.compliance_review':['GRC_ANALYST'],
  'threat_model.admin':['CISO','INFOSEC_ADMIN'],
} satisfies Record<string,BankRole[]>;
export type ThreatCapability=keyof typeof threatCapabilities;
export function hasThreatCapability(actor:BankUser,capability:ThreatCapability):boolean {
  return actor.isActive && !actor.roles.includes('AUDITOR') && (threatCapabilities[capability] as BankRole[]).some(role=>actor.roles.includes(role));
}
export function canReadSecurityModel(actor:BankUser):boolean {
  // Risk ownership alone never grants access to other applications' models.
  return actor.isActive && (actor.roles.includes('AUDITOR') || (['threat_model.appsec_review','threat_model.architecture_review','threat_model.release_authorize','threat_model.compliance_review','threat_model.admin'] as ThreatCapability[]).some(key=>hasThreatCapability(actor,key)));
}
