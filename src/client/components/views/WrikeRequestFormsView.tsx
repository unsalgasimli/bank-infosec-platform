import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  ArrowRight,
  CheckCircle2,
  Shield,
  Lock,
  Flame,
  AlertTriangle,
  Send,
  Sparkles,
  Layers,
  Upload,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { RequestFormDefinition } from '../../../shared/types/request-forms.js';

interface WrikeRequestFormsViewProps {
  onFormSubmitted?: (ticket: any) => void;
}

export const WrikeRequestFormsView: React.FC<WrikeRequestFormsViewProps> = ({ onFormSubmitted }) => {
  const { fetchWithAuth } = useAuth();
  const [forms, setForms] = useState<RequestFormDefinition[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>('form-incident');
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<Record<string, any>>({
    urgency: 'HIGH',
    impactLevel: 'CRITICAL',
    targetSystem: 'SWIFT Alliance Gateway',
    title: '',
    description: '',
    durationDays: '30',
    justification: '',
  });

  const loadForms = async () => {
    try {
      const res = await fetchWithAuth('/api/request-forms');
      const data = await res.json();
      if (data.success && data.forms) {
        setForms(data.forms);
        if (data.forms.length > 0 && !selectedFormId) {
          setSelectedFormId(data.forms[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load request forms', err);
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeForm = forms.find((f) => f.id === selectedFormId);

    try {
      setIsSubmitting(true);
      const res = await fetchWithAuth(`/api/request-forms/${selectedFormId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: formData }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmittedMessage(
          `✅ Request successfully submitted! Created ticket ${data.ticket.key} with SLA routed to "${activeForm?.destinationFolder}".`
        );
        if (onFormSubmitted) {
          onFormSubmitted(data.ticket);
        }
        setFormData({
          urgency: 'HIGH',
          impactLevel: 'CRITICAL',
          targetSystem: 'SWIFT Alliance Gateway',
          title: '',
          description: '',
          durationDays: '30',
          justification: '',
        });
      }
    } catch (err) {
      console.error('Failed to submit form', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFormIcon = (iconName: string) => {
    switch (iconName) {
      case 'Flame':
        return Flame;
      case 'Lock':
        return Lock;
      case 'Shield':
        return Shield;
      case 'Layers':
      default:
        return Layers;
    }
  };

  const selectedForm = forms.find((f) => f.id === selectedFormId);

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-page-muted overflow-hidden select-none">
      {/* Wrike Request Forms Top Bar */}
      <div className="bg-semantic-panel border-b border-semantic-surface-alt px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-wrike-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-semantic-success-surface text-semantic-brand border border-semantic-success-border flex items-center justify-center font-bold text-xs">
            <FileText className="w-4 h-4 text-semantic-brand" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-semantic-primary">
                Wrike Dynamic Request Forms & Work Intake
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success text-caption font-bold border border-semantic-success-border">
                Real-Time Backend Synced
              </span>
            </div>
            <p className="text-label text-semantic-jira-muted-alt">
              Capture incoming business requests with conditional branching, validation, and automated routing.
            </p>
          </div>
        </div>
      </div>

      {/* Main 2-Pane Intake Workspace */}
      <div className="flex-1 flex overflow-hidden p-5 gap-5">
        {/* Left Form Catalog */}
        <div className="w-80 flex flex-col space-y-3 shrink-0 overflow-y-auto custom-scrollbar">
          <div className="text-xs font-bold uppercase tracking-wider text-semantic-jira-muted-alt px-1">
            Available Security Request Forms ({forms.length})
          </div>
          {forms.map((form) => {
            const Icon = getFormIcon(form.iconName);
            const isSelected = selectedFormId === form.id;
            return (
              <div
                key={form.id}
                onClick={() => {
                  setSelectedFormId(form.id);
                  setSubmittedMessage(null);
                }}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? 'border-semantic-brand bg-semantic-panel shadow-wrike-md scale-[1.01]'
                    : 'border-semantic-surface-alt bg-semantic-panel hover:border-semantic-jira-border-muted'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-semantic-subtle border border-semantic-surface-alt flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-semantic-brand" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-semantic-primary">{form.title}</h4>
                    <span className="text-caption font-semibold text-semantic-jira-muted-alt">{form.category}</span>
                  </div>
                </div>
                <p className="text-label text-semantic-jira-muted-alt leading-relaxed mb-2">
                  {form.description}
                </p>
                <div className="text-caption font-mono text-semantic-info flex items-center gap-1">
                  <span>Routing: {form.destinationFolder}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Form Live Execution */}
        <div className="flex-1 bg-semantic-panel rounded-xl border border-semantic-surface-alt shadow-wrike-sm p-6 overflow-y-auto custom-scrollbar flex flex-col justify-between">
          <div>
            {/* Form Title & Destination Header */}
            <div className="flex items-center justify-between border-b border-semantic-surface-alt pb-3 mb-5">
              <div>
                <span className="text-label font-mono font-bold text-semantic-brand uppercase tracking-wider">
                  {selectedForm?.category}
                </span>
                <h2 className="text-base font-bold text-semantic-primary mt-0.5">{selectedForm?.title}</h2>
              </div>
              <div className="text-right">
                <span className="text-caption text-semantic-jira-muted-alt block">Auto-Destination Folder</span>
                <span className="text-xs font-mono font-semibold text-semantic-info">
                  {selectedForm?.destinationFolder}
                </span>
              </div>
            </div>

            {submittedMessage && (
              <div className="p-3 mb-4 rounded-lg bg-semantic-success-surface border border-semantic-success-border text-xs font-semibold text-semantic-success flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{submittedMessage}</span>
              </div>
            )}

            {/* Dynamic Form Questions */}
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-semantic-brand-ink mb-1 block">Request Summary / Headline *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={`e.g. ${selectedForm?.id === 'form-incident' ? 'Suspicious unauthorized traffic to SWIFT host' : 'Temporary Port 8443 bypass for payment staging'}`}
                  className="wrike-input py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-semantic-brand-ink mb-1 block">Urgency / Severity Tier</label>
                  <select
                    value={formData.urgency}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                    className="wrike-input py-2"
                  >
                    <option value="EMERGENCY">Emergency (P1 SLA: 15 mins)</option>
                    <option value="HIGH">High Urgency (P2 SLA: 1 hour)</option>
                    <option value="MEDIUM">Standard (P3 SLA: 4 hours)</option>
                    <option value="LOW">Low (P4 SLA: 24 hours)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-semantic-brand-ink mb-1 block">Target Banking System</label>
                  <select
                    value={formData.targetSystem}
                    onChange={(e) => setFormData({ ...formData, targetSystem: e.target.value })}
                    className="wrike-input py-2"
                  >
                    <option value="SWIFT Alliance Gateway">SWIFT Alliance Gateway (Tier-1)</option>
                    <option value="Apex Core Banking Gateway (Temenos T24)">Apex Core Banking Gateway (Temenos T24)</option>
                    <option value="Apex Retail Mobile Banking Backend API">Apex Retail Mobile Banking Backend API</option>
                    <option value="Perimeter DC1 Gateway Firewall">Perimeter DC1 Gateway Firewall</option>
                  </select>
                </div>
              </div>

              {/* Conditional Branching Fields based on Selected Form */}
              {selectedFormId === 'form-exception' && (
                <div className="p-3.5 bg-semantic-warning-card border border-semantic-warning-border rounded-lg space-y-3">
                  <div className="font-bold text-xs text-semantic-warning flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Dual-Control Exception Parameters (ISO 27001)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-semantic-brand-ink block mb-1">Exception Validity Period</label>
                      <select
                        value={formData.durationDays}
                        onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                        className="wrike-input"
                      >
                        <option value="7">7 Calendar Days</option>
                        <option value="30">30 Calendar Days (Standard)</option>
                        <option value="60">60 Calendar Days (CISO Pre-approval Required)</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-semantic-brand-ink block mb-1">Compensating Controls</label>
                      <input
                        type="text"
                        placeholder="e.g. IPS sensor monitoring enabled"
                        className="wrike-input"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="font-bold text-semantic-brand-ink mb-1 block">Business Justification & Context</label>
                <textarea
                  value={formData.justification}
                  onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                  placeholder="Provide technical rationale, regulatory obligations, or incident evidence..."
                  className="wrike-input h-24 resize-none"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-3 border-t border-semantic-surface-alt flex items-center justify-between">
                <div className="text-label text-semantic-jira-muted-alt flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-semantic-brand" />
                  <span>Wrike Work Intake routes this request directly to active pipelines.</span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="wrike-btn-primary py-2 px-5 text-xs shadow-sm disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Submitting...' : 'Submit Request Form'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
