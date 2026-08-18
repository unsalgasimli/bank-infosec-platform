import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Send,
  Bot,
  User,
  Search,
  ArrowRight,
  ShieldCheck,
  Zap,
  Terminal,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface RovoAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRunJql: (jql: string) => void;
  onNavigate: (view: string, id?: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'rovo' | 'user';
  text: string;
  jql?: string;
  viewLink?: string;
  timestamp: string;
}

export const RovoAssistantDrawer: React.FC<RovoAssistantDrawerProps> = ({
  isOpen,
  onClose,
  onRunJql,
  onNavigate,
}) => {
  const { currentUser } = useAuth();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-1',
      sender: 'rovo',
      text: `Hello ${
        currentUser?.fullName?.split(' ')[0] || 'Analyst'
      }! I am **Atlassian Intelligence (Rovo)** for Apex Bank SecOps. I can summarize active incidents, construct complex JQL queries, evaluate SLA compliance, or investigate CVEs. How can I help you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  if (!isOpen) return null;

  const quickPrompts = [
    {
      label: 'Find SLA breached tickets',
      prompt: 'Show me all tickets that have breached or are at risk of breaching SLA',
      jql: 'slaState in ("BREACHED", "AT_RISK") ORDER BY priority DESC',
    },
    {
      label: 'Critical SOC Incidents',
      prompt: 'List all open Critical & High incidents in the SOC project',
      jql: 'project = "SOC" AND severity in ("P1_CRITICAL", "P2_HIGH") AND status != "RESOLVED"',
    },
    {
      label: 'Pending Dual-Control Approvals',
      prompt: 'Show all security exceptions awaiting CISO approval',
      jql: 'project = "GRC" AND status = "APPROVAL_PENDING"',
    },
    {
      label: 'Banking CMDB Risk',
      prompt: 'Show all Tier-1 banking applications with open vulnerabilities',
      viewLink: 'applications',
    },
  ];

  const handleSend = (textToSend?: string) => {
    const text = textToSend || query;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuery('');

    // Generate intelligent SecOps response
    setTimeout(() => {
      let rovoResponse: ChatMessage = {
        id: `r-${Date.now()}`,
        sender: 'rovo',
        text: 'Analyzing banking security context and Jira ticket telemetry...',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const lower = text.toLowerCase();
      if (lower.includes('sla') || lower.includes('breach')) {
        rovoResponse.text =
          'Found **2 high-priority tickets** exceeding SLA threshold. Generated JQL query to isolate them immediately:';
        rovoResponse.jql = 'slaState in ("BREACHED", "AT_RISK") ORDER BY priority DESC';
      } else if (lower.includes('soc') || lower.includes('incident') || lower.includes('p1')) {
        rovoResponse.text =
          'Retrieved **SOC-101 (Brute Force on Swift Gateway)**. Current status: *Containment*. Recommended action: Review firewall IP blocklist and verify dual-control sign-off.';
        rovoResponse.jql = 'project = "SOC" AND severity = "P1_CRITICAL"';
        rovoResponse.viewLink = 'soc-incidents';
      } else if (lower.includes('approval') || lower.includes('dual')) {
        rovoResponse.text =
          'There are **2 pending dual-control authorization steps** awaiting CISO / SOC Lead approval for production firewall policy exception.';
        rovoResponse.viewLink = 'approvals';
      } else if (lower.includes('cve') || lower.includes('vuln')) {
        rovoResponse.text =
          'Identified **CVE-2026-3829 (Remote Code Execution in Core Banking Gateway)** affecting Tier-1 Core Banking. Patch SLA is 24 hours under ISO 27001 policy.';
        rovoResponse.jql = 'project = "VM" AND cveId ~ "CVE-2026-3829"';
      } else {
        rovoResponse.text = `Understood. I searched the Jira database for "${text}". You can use JQL filtering or view the live queues below.`;
        rovoResponse.jql = `text ~ "${text}" ORDER BY updated DESC`;
      }

      setMessages((prev) => [...prev, rovoResponse]);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-md bg-[#FFFFFF] border-l border-[#DFE1E6] h-full shadow-2xl flex flex-col">
        {/* Header with Rovo Brand Badge */}
        <div className="p-3.5 border-b border-[#DFE1E6] flex items-center justify-between bg-[#F4F5F7]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md rovo-gradient-badge flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-bold text-[#172B4D]">Atlassian Rovo</h2>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF]">
                  AI SecOps
                </span>
              </div>
              <p className="text-[10px] text-[#5E6C84]">Intelligence for Apex Bank Security</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#EBECF0] text-[#5E6C84] hover:text-[#172B4D] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Suggestions */}
        <div className="p-2.5 border-b border-[#EBECF0] bg-[#FAFBFC] overflow-x-auto custom-scrollbar flex gap-1.5 shrink-0">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (qp.jql) {
                  onRunJql(qp.jql);
                  onNavigate('tickets');
                  onClose();
                } else if (qp.viewLink) {
                  onNavigate(qp.viewLink);
                  onClose();
                } else {
                  handleSend(qp.prompt);
                }
              }}
              className="px-2.5 py-1 rounded bg-[#FFFFFF] hover:bg-[#EBECF0] border border-[#DFE1E6] text-[#172B4D] text-[11px] whitespace-nowrap flex items-center gap-1 transition-colors"
            >
              <Zap className="w-3 h-3 text-[#FF8B00]" />
              <span>{qp.label}</span>
            </button>
          ))}
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar text-xs">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'rovo' && (
                <div className="w-6 h-6 rounded-full rovo-gradient-badge flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                  <Sparkles className="w-3 h-3" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-lg p-3 space-y-2 ${
                  m.sender === 'user'
                    ? 'bg-[#0052CC] text-white'
                    : 'bg-[#FFFFFF] border border-[#DFE1E6] text-[#172B4D]'
                }`}
              >
                <div className="leading-relaxed whitespace-pre-wrap">{m.text}</div>

                {/* Interactive JQL snippet if present */}
                {m.jql && (
                  <div className="mt-2 p-2 bg-[#FFFFFF] border border-[#DFE1E6] rounded text-[11px] font-mono text-[#0052CC] flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[10px] text-[#5E6C84]">
                      <span>JQL Filter Query:</span>
                      <Terminal className="w-3 h-3 text-[#5E6C84]" />
                    </div>
                    <code className="text-[11px] break-all">{m.jql}</code>
                    <button
                      onClick={() => {
                        onRunJql(m.jql!);
                        onNavigate('tickets');
                        onClose();
                      }}
                      className="mt-1 jira-btn-primary py-1 px-2 text-[10px] flex items-center justify-center gap-1"
                    >
                      <span>Run Query in Jira</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* View link button if present */}
                {m.viewLink && (
                  <button
                    onClick={() => {
                      onNavigate(m.viewLink!);
                      onClose();
                    }}
                    className="mt-1 jira-btn-secondary py-1 px-2 text-[10px] flex items-center gap-1 w-full justify-center"
                  >
                    <span>Open View ({m.viewLink})</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}

                <div
                  className={`text-[9px] text-right ${
                    m.sender === 'user' ? 'text-blue-100' : 'text-[#7A869A]'
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>

              {m.sender === 'user' && (
                <div className="w-6 h-6 rounded-full bg-[#EBECF0] border border-[#DFE1E6] flex items-center justify-center text-[#172B4D] text-[10px] font-bold shrink-0 mt-0.5">
                  <User className="w-3 h-3" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer Input */}
        <div className="p-3 border-t border-[#DFE1E6] bg-[#F4F5F7]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask Rovo anything about Jira tickets, SLA or risks..."
              className="flex-1 bg-[#FFFFFF] border border-[#DFE1E6] rounded px-3 py-1.5 text-xs text-[#172B4D] placeholder-[#7A869A] focus:outline-none focus:border-[#0052CC]"
            />
            <button
              type="submit"
              disabled={!query.trim()}
              className="p-1.5 bg-[#0052CC] hover:bg-[#0052CC] disabled:opacity-40 text-white rounded transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="mt-1.5 text-[10px] text-[#7A869A] text-center">
            Atlassian Intelligence answers are protected by bank RBAC policies.
          </div>
        </div>
      </div>
    </div>
  );
};
