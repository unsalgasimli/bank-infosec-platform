export interface ProofingAnnotation {
  id: string;
  x: number;
  y: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  comment: string;
  status: 'OPEN' | 'RESOLVED' | 'APPROVED';
  createdAt: string;
}

export interface ProofingDocument {
  id: string;
  title: string;
  documentType: string;
  fileUrl: string;
  version: string;
  classification: string;
  isSignedOff: boolean;
  signedByUserId?: string;
  signedByUserName?: string;
  signedAt?: string;
  signatureHash?: string;
  annotations: ProofingAnnotation[];
  createdAt: string;
  updatedAt: string;
}
