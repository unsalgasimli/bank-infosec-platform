export type IdeaCategory =
  | 'THREAT_VECTOR'
  | 'ZERO_TRUST'
  | 'COMPLIANCE'
  | 'INCIDENT_IR'
  | 'DEVSECOPS'
  | 'GENERAL';

export type IdeaColor = 'green' | 'blue' | 'amber' | 'coral' | 'purple';

export interface IdeaNode {
  id: string;
  title: string;
  description: string;
  category: IdeaCategory;
  color: IdeaColor;
  x: number;
  y: number;
  status: 'IDEA' | 'UNDER_REVIEW' | 'CONVERTED';
  convertedTicketKey?: string;
  convertedTicketId?: string;
  priority: 'P1_URGENT' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW';
  assignee?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
