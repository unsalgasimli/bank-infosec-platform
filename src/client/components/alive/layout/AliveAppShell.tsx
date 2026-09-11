import React, { useState, useEffect } from 'react';
import { AliveTopBar } from './AliveTopBar.js';
import { AliveAdaptiveSidebar } from './AliveAdaptiveSidebar.js';
import { AliveCommandLauncher } from '../commands/AliveCommandLauncher.js';
import { TicketCreateModal } from '../../tickets/TicketCreateModal.js';
import { Ticket } from '../../../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../../../shared/types/asset.js';
import { RiskRegisterItem } from '../../../../shared/types/risk.js';
import { KBArticle } from '../../../../shared/types/kb.js';

import { BankDepartment } from '../../../../shared/types/auth.js';

interface AliveAppShellProps {
  activeView: string;
  activeViewTitle?: string;
  activeParentModuleTitle?: string;
  onSelectView: (view: string) => void;
  tickets: Ticket[];
  applications: BankApplication[];
  assets: BankAsset[];
  risks?: RiskRegisterItem[];
  kbArticles?: KBArticle[];
  pendingApprovalsCount?: number;
  departments?: BankDepartment[];
  departmentsCount?: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onTicketCreated: (ticket: Ticket) => void;
  onNavigate: (view: string, id?: string) => void;
  isCreateOpen: boolean;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  children: React.ReactNode;
}

export const AliveAppShell: React.FC<AliveAppShellProps> = ({
  activeView,
  activeViewTitle,
  activeParentModuleTitle,
  onSelectView,
  tickets,
  applications,
  assets,
  pendingApprovalsCount = 0,
  departments = [],
  onTicketCreated,
  onNavigate,
  isCreateOpen,
  onOpenCreate,
  onCloseCreate,
  children,
}) => {
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Global Keyboard Shortcuts (Cmd+K, Ctrl+K, /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsCommandOpen(true);
      } else if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onOpenCreate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenCreate]);

  return (
    <div
      data-ui-experience="alive"
      className="h-screen w-screen flex flex-col bg-semantic-page text-semantic-primary overflow-hidden font-sans select-none"
    >
      {/* Top Header */}
      <AliveTopBar
        activeViewTitle={activeViewTitle}
        activeParentModuleTitle={activeParentModuleTitle}
        onOpenCreate={onOpenCreate}
        onOpenCommandPalette={() => setIsCommandOpen(true)}
        onToggleSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        departments={departments}
        onNavigate={onNavigate}
      />

      {/* Main Container */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Adaptive Sidebar */}
        <AliveAdaptiveSidebar
          activeDestination={activeView}
          onSelectDestination={onSelectView}
          tickets={tickets}
          pendingApprovalsCount={pendingApprovalsCount}
          assetsCount={applications.length + assets.length}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Mobile Backdrop */}
        {isMobileSidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 top-14 z-dsOverlay bg-slate-950/60 lg:hidden backdrop-blur-xs"
          />
        )}

        {/* Active Workspace Canvas */}
        <main className="min-w-0 min-h-0 flex-1 flex flex-col overflow-hidden alive-workspace-canvas">
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {children}
          </div>
        </main>
      </div>

      {/* Universal Command Studio */}
      <AliveCommandLauncher
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onNavigate={onNavigate}
        onOpenCreate={onOpenCreate}
        tickets={tickets}
        applications={applications}
        assets={assets}
      />

      {/* Ticket Creation Modal */}
      <TicketCreateModal
        isOpen={isCreateOpen}
        onClose={onCloseCreate}
        applications={applications}
        assets={assets}
        onCreated={onTicketCreated}
      />
    </div>
  );
};
