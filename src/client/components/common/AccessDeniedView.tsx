import React from 'react';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface AccessDeniedViewProps {
  destinationId: string;
  onReturnToSafeView: () => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({ destinationId, onReturnToSafeView }) => {
  const { currentUser } = useAuth();

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-semantic-subtle">
      <div className="wrike-card max-w-lg w-full p-8 text-center space-y-4 shadow-sm border border-semantic-danger-border bg-semantic-panel">
        <div className="w-16 h-16 rounded-2xl bg-semantic-danger-surface text-semantic-danger border border-semantic-danger-border flex items-center justify-center mx-auto shadow-sm">
          <Lock className="w-8 h-8" />
        </div>

        <div>
          <span className="font-mono text-xs font-bold text-semantic-danger bg-semantic-danger-surface px-2.5 py-0.5 rounded-full border border-semantic-danger-border">
            403 RBAC RESTRICTED
          </span>
          <h2 className="text-lg font-bold text-semantic-primary mt-2">Access Denied: Module Restricted</h2>
          <p className="text-xs text-semantic-muted mt-1.5 leading-relaxed">
            Your user account (<strong>{currentUser?.fullName}</strong>) with roles{' '}
            <code className="bg-semantic-neutral-surface px-1.5 py-0.5 rounded text-semantic-primary font-mono text-label">
              [{currentUser?.roles.join(', ')}]
            </code>{' '}
            and security clearance <strong>{currentUser?.securityClearance}</strong> does not have authorization to view destination{' '}
            <code className="bg-semantic-neutral-surface px-1.5 py-0.5 rounded text-semantic-info font-mono text-label">
              "{destinationId}"
            </code>.
          </p>
        </div>

        <div className="pt-3 border-t border-semantic-border flex justify-center">
          <button
            onClick={onReturnToSafeView}
            className="wrike-btn-primary text-xs py-2 px-4 flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to My Work</span>
          </button>
        </div>
      </div>
    </div>
  );
};
