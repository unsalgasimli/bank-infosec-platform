import React, { useState } from 'react';
import { X, Sparkles, Send, User, ArrowRight, Terminal, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { Ticket } from '../../../shared/types/ticket.js';

interface RovoAssistantDrawerProps { isOpen: boolean; onClose: () => void; onRunJql: (jql: string) => void; onNavigate: (view: string, id?: string) => void; }
interface ChatMessage { id: string; sender: 'assistant' | 'user'; text: string; jql?: string; tickets?: Ticket[]; timestamp: string; }

const timestamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const messageId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** A transparent, server-backed work search; it does not fabricate AI findings. */
export const RovoAssistantDrawer: React.FC<RovoAssistantDrawerProps> = ({ isOpen, onClose, onRunJql, onNavigate }) => {
  const { fetchWithAuth } = useAuth();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  if (!isOpen) return null;
  const openTicket = (ticket: Ticket) => { onNavigate('tickets', ticket.id); onClose(); };
  const handleSend = async () => {
    const text = query.trim();
    if (!text || isSearching) return;
    setMessages((existing) => [...existing, { id: messageId(), sender: 'user', text, timestamp: timestamp() }]);
    setQuery(''); setIsSearching(true);
    try {
      const response = await fetchWithAuth(`/api/tickets?jql=${encodeURIComponent(text)}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Search request failed.');
      const results: Ticket[] = data.tickets || [];
      setMessages((existing) => [...existing, { id: messageId(), sender: 'assistant', text: results.length ? `${results.length} authorized ticket${results.length === 1 ? '' : 's'} found.` : 'No authorized tickets match this search.', jql: text, tickets: results.slice(0, 8), timestamp: timestamp() }]);
    } catch (error) {
      setMessages((existing) => [...existing, { id: messageId(), sender: 'assistant', text: error instanceof Error ? error.message : 'Search request failed.', timestamp: timestamp() }]);
    } finally { setIsSearching(false); }
  };

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn"><div className="w-full max-w-md bg-white border-l border-[#DFE1E6] h-full shadow-2xl flex flex-col">
    <div className="p-3.5 border-b border-[#DFE1E6] flex items-center justify-between bg-[#F4F5F7]"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-md rovo-gradient-badge flex items-center justify-center text-white"><Sparkles className="w-4 h-4" /></div><div><h2 className="text-xs font-bold text-[#172B4D]">Work search</h2><p className="text-[10px] text-[#5E6C84]">Server-backed, authorized ticket search</p></div></div><button onClick={onClose} className="p-1 rounded hover:bg-[#EBECF0] text-[#5E6C84]"><X className="w-4 h-4" /></button></div>
    <div className="p-3 text-[11px] text-[#64748B] bg-[#FAFBFC] border-b border-[#EBECF0] flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 text-[#D46B08]" />This tool reports only results returned by the backend. It does not infer incidents, compliance status, or remediation advice.</div>
    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar text-xs">{messages.length === 0 ? <div className="text-center text-[#64748B] py-10">Search by ticket key, text, or a supported JQL query.</div> : messages.map((message) => <div key={message.id} className={`flex gap-2.5 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-lg p-3 space-y-2 ${message.sender === 'user' ? 'bg-[#0052CC] text-white' : 'bg-white border border-[#DFE1E6] text-[#172B4D]'}`}><div>{message.text}</div>{message.jql && <div className="p-2 bg-[#F8FAFC] border border-[#DFE1E6] rounded text-[11px] font-mono text-[#0052CC]"><div className="flex justify-between text-[#5E6C84] mb-1"><span>Backend query</span><Terminal className="w-3 h-3" /></div><code className="break-all">{message.jql}</code><button onClick={() => { onRunJql(message.jql!); onNavigate('tickets'); onClose(); }} className="mt-2 jira-btn-primary py-1 px-2 text-[10px] flex items-center gap-1">Open results <ArrowRight className="w-3 h-3" /></button></div>}{message.tickets?.map((ticket) => <button key={ticket.id} onClick={() => openTicket(ticket)} className="block w-full text-left p-2 rounded border border-[#DFE1E6] hover:border-[#0052CC]"><span className="font-mono font-bold text-[#0052CC]">{ticket.key}</span><span className="ml-2 text-[#172B4D]">{ticket.title}</span></button>)}<div className={`text-[9px] text-right ${message.sender === 'user' ? 'text-blue-100' : 'text-[#7A869A]'}`}>{message.timestamp}</div></div>{message.sender === 'user' && <div className="w-6 h-6 rounded-full bg-[#EBECF0] border border-[#DFE1E6] flex items-center justify-center text-[#172B4D]"><User className="w-3 h-3" /></div>}</div>)}</div>
    <form onSubmit={(event) => { event.preventDefault(); void handleSend(); }} className="p-3 border-t border-[#DFE1E6] bg-[#F4F5F7] flex items-center gap-1.5"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tickets or enter JQL…" className="flex-1 bg-white border border-[#DFE1E6] rounded px-3 py-1.5 text-xs text-[#172B4D]" /><button type="submit" disabled={!query.trim() || isSearching} className="p-1.5 bg-[#0052CC] disabled:opacity-40 text-white rounded"><Send className="w-4 h-4" /></button></form>
  </div></div>;
};
