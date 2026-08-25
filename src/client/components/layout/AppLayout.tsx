import React, { useEffect } from 'react';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { CommandPalette } from './CommandPalette.js';
import { RovoAssistantDrawer } from './RovoAssistantDrawer.js';
import { Ticket } from '../../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import { TicketCreateModal } from '../tickets/TicketCreateModal.js';
import { RiskRegisterItem } from '../../../shared/types/risk.js';
import { KBArticle } from '../../../shared/types/kb.js';

interface AppLayoutProps {
  activeView: string;
  onSelectView: (view: string) => void;
  tickets: Ticket[];
  applications: BankApplication[];
  assets: BankAsset[];
  risks?: RiskRegisterItem[];
  kbArticles?: KBArticle[];
  pendingApprovalsCount?: number;
  departmentsCount?: number;
  activeDepartmentId?: string | null;
  onSelectDepartment?: (deptId: string | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRunJql: (jql: string) => void;
  onTicketCreated: (ticket: Ticket) => void;
  onNavigate: (view: string, id?: string) => void;
  isCreateOpen: boolean;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  activeView,
  onSelectView,
  tickets,
  applications,
  assets,
  risks = [],
  kbArticles = [],
  pendingApprovalsCount = 0,
  departmentsCount = 5,
  activeDepartmentId = null,
  onSelectDepartment,
  searchQuery,
  onSearchChange,
  onRunJql,
  onTicketCreated,
  onNavigate,
  isCreateOpen,
  onOpenCreate,
  onCloseCreate,
  children,
}) => {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = React.useState(false);
  const [isRovoOpen, setIsRovoOpen] = React.useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);

  // Global Keyboard Shortcuts Listener
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

      if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onOpenCreate();
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      } else if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenCreate]);

  return (
    <div className="h-screen w-screen flex flex-col bg-semantic-page text-semantic-primary overflow-hidden font-sans">
      {/* Wrike Top Navigation Header */}
      <TopBar
        onOpenCreate={onOpenCreate}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenRovo={() => setIsRovoOpen(true)}
        onNavigate={onNavigate}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        activeDepartmentId={activeDepartmentId}
        onSelectDepartment={onSelectDepartment}
        onToggleSidebar={() => setIsMobileSidebarOpen((open) => !open)}
      />

      {/* Main App Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Enterprise Navigation Sidebar */}
        <Sidebar
          activeDestination={activeView}
          onSelectDestination={onSelectView}
          tickets={tickets}
          applicationsCount={applications.length}
          assetsCount={assets.length}
          risksCount={risks.length}
          kbCount={kbArticles.length}
          pendingApprovalsCount={pendingApprovalsCount}
          departmentsCount={departmentsCount}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {isMobileSidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 top-14 z-dsOverlay bg-slate-950/40 lg:hidden"
          />
        )}

        {/* Spacious Main Content Area */}
        <main className="min-w-0 flex-1 flex flex-col overflow-hidden bg-semantic-page">
          <div className="flex-1 flex overflow-hidden">
            {children}
          </div>
        </main>
      </div>

      {/* Enterprise Multi-Department Workflow & Task Creation Modal */}
      <TicketCreateModal
        isOpen={isCreateOpen}
        onClose={onCloseCreate}
        applications={applications}
        assets={assets}
        onCreated={onTicketCreated}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={onNavigate}
        tickets={tickets}
      />

      {/* Wrike AI Copilot Drawer */}
      <RovoAssistantDrawer
        isOpen={isRovoOpen}
        onClose={() => setIsRovoOpen(false)}
        onRunJql={onRunJql}
        onNavigate={onNavigate}
      />
    </div>
  );
};
