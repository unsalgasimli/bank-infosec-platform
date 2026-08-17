import { SecurityDomain } from './auth.js';

export interface TeamQueue {
  id: string;
  name: string;
  code: string;
  securityDomain: SecurityDomain;
  description: string;
  iconName: string;
  jqlFilter: string;
  visibleColumns: string[];
  slaWarningMinutes: number;
  count?: number;
}
