export interface KBArticle {
  id: string;
  slug: string;
  title: string;
  category: 'REMEDIATION_GUIDE' | 'INCIDENT_PLAYBOOK' | 'HARDENING_STANDARD' | 'SECURITY_POLICY' | 'SOP';
  summary: string;
  contentMarkdown: string;
  associatedCwes?: string[];
  associatedCves?: string[];
  associatedDomains?: string[];
  authorName: string;
  authorRole: string;
  approvedByCiso: boolean;
  version: string;
  lastReviewedAt: string;
  tags: string[];
  viewCount: number;
}
