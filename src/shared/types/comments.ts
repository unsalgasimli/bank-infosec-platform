import { ConfidentialityTier } from './auth.js';

export type CommentVisibility = 'PUBLIC' | 'INTERNAL' | 'SECURITY_TEAM_ONLY' | 'RESTRICTED_MANAGERS';

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  content: string;
  visibility: CommentVisibility;
  confidentiality: ConfidentialityTier;
  mentions: string[]; // User IDs
  createdAt: string;
  updatedAt?: string;
  isEdited: boolean;
  parentId?: string; // Threading
  reactions: {
    emoji: string;
    userIds: string[];
  }[];
}
