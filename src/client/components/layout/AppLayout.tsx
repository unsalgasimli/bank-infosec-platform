import React, { useState } from 'react';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { CommandPalette } from './CommandPalette.js';
import { TicketCreateModal } from '../tickets/TicketCreateModal.js';
import { Ticket } from '../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../shared/types/asset.js';

interface AppLayoutProps {
  activeView: string;
  onSelectView: (view: string) => void;
  tickets: Ticket[];
  applications: BankApplication[];
  assets: BankAsset[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onTicketCreated: (ticket: Ticket) => void;
  onNavigate: (view: string, id?: string) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  activeView,
  onSelectView,
  tickets,
  applications,
  assets,
  searchQuery,
  onSearchChange,
  onTicketCreated,
  onNavigate,
  children,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  return (
    <div className="h-screen w-screen flex flex-col bg-bank-950 text-bank-100 overflow-hidden font-sans">
      {/* Top Header */}
      <TopBar
        onOpenCreate={() => setIsCreateOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onNavigate={onNavigate}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
      />

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar activeView={activeView} onSelectView={onSelectView} />

        {/* Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-bank-950">
          {children}
        </main>
      </div>

      {/* Create Ticket Modal */}
      <TicketCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
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
    </div>
  );
};
