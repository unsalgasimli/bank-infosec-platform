import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Search,
  CheckCircle2,
  Shield,
  Lock,
  Flame,
  AlertTriangle,
  Send,
  Sparkles,
  Layers,
  Clock,
  ArrowRight,
  RefreshCw,
  FolderSync,
  Building2,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { RequestFormDefinition } from '../../../shared/types/request-forms.js';

interface WrikeRequestFormsViewProps {
  onFormSubmitted?: (ticket: any) => void;
}

export const CANONICAL_FALLBACK_FORMS: RequestFormDefinition[] = [
  {
    id: 'form-incident',
    title: 'Report Cyber Incident / Data Leak',
    category: 'SOC & Incident Response',
    iconName: 'Flame',
    color: 'red',
    description: 'Emergency intake for detected brute-force attacks, malware, ransomware, or confidential data leakage.',
    destinationFolder: 'Incident Response Operations 📁',
    defaultSeverity: 'CRITICAL',
    defaultPriority: 'P1_URGENT',
    defaultTicketType: 'INCIDENT',
    isActive: true,
    fields: [
      { id: 'title', label: 'Incident Headline / Summary', type: 'text', required: true, placeholder: 'e.g. Suspicious unauthorized traffic to SWIFT host' },
      { id: 'urgency', label: 'Urgency Tier', type: 'select', required: true, options: ['EMERGENCY', 'HIGH', 'MEDIUM', 'LOW'], defaultValue: 'HIGH' },
      { id: 'targetSystem', label: 'Target Banking System', type: 'select', required: true, options: ['SWIFT Alliance Gateway', 'Apex Core Banking Gateway (Temenos T24)', 'Apex Retail Mobile Banking Backend API', 'Perimeter DC1 Gateway Firewall'], defaultValue: 'SWIFT Alliance Gateway' },
      { id: 'justification', label: 'Technical Evidence & Indicators', type: 'textarea', required: false, placeholder: 'Provide IP addresses, affected workstations, timestamps...' },
    ],
  },
  {
    id: 'form-exception',
    title: 'Production Firewall Exception Waiver',
    category: 'GRC Dual-Control',
    iconName: 'Lock',
    color: 'amber',
    description: 'Request temporary firewall port whitelist, cipher waiver, or administrative bypass requiring CISO 4-eyes sign-off.',
    destinationFolder: 'Firewall & Network Exceptions 📁',
    defaultSeverity: 'HIGH',
    defaultPriority: 'P2_HIGH',
    defaultTicketType: 'SECURITY_EXCEPTION',
    isActive: true,
    fields: [
      { id: 'title', label: 'Exception Request Summary', type: 'text', required: true, placeholder: 'e.g. Temporary Port 8443 bypass for payment staging' },
      { id: 'targetSystem', label: 'Target Banking System', type: 'select', required: true, options: ['SWIFT Alliance Gateway', 'Apex Core Banking Gateway (Temenos T24)', 'Perimeter DC1 Gateway Firewall'], defaultValue: 'Perimeter DC1 Gateway Firewall' },
      { id: 'durationDays', label: 'Exception Validity Period (Days)', type: 'select', required: true, options: ['7', '30', '60'], defaultValue: '30' },
      { id: 'justification', label: 'Business Justification & Compensating Controls', type: 'textarea', required: true, placeholder: 'Explain business reason, impact if denied, IPS monitoring...' },
    ],
  },
  {
    id: 'form-pentest',
    title: 'Application Security Pentest Intake',
    category: 'DevSecOps & AppSec',
    iconName: 'Shield',
    color: 'blue',
    description: 'Schedule pre-release SAST, DAST, and manual penetration testing for mobile & core banking API releases.',
    destinationFolder: 'Core Banking Application Hardening 📁',
    defaultSeverity: 'MEDIUM',
    defaultPriority: 'P2_HIGH',
    defaultTicketType: 'SECURITY_REVIEW',
    isActive: true,
    fields: [
      { id: 'title', label: 'Release / Application Name', type: 'text', required: true, placeholder: 'e.g. Mobile Banking iOS v3.4 Release Pentest' },
      { id: 'targetSystem', label: 'Target Banking System', type: 'select', required: true, options: ['Apex Retail Mobile Banking Backend API', 'Apex Core Banking Gateway (Temenos T24)'], defaultValue: 'Apex Retail Mobile Banking Backend API' },
      { id: 'justification', label: 'Release Scope & Testing Schedule', type: 'textarea', required: false, placeholder: 'Endpoints to test, testing window, contact person...' },
    ],
  },
  {
    id: 'form-asset',
    title: 'New Banking Asset & Server Registration',
    category: 'CMDB & Architecture',
    iconName: 'Layers',
    color: 'green',
    description: 'Register production Linux server, firewall, or API gateway into CMDB with data classification tier.',
    destinationFolder: 'Banking Infrastructure Assets 📁',
    defaultSeverity: 'LOW',
    defaultPriority: 'P3_MEDIUM',
    defaultTicketType: 'SECURITY_REVIEW',
    isActive: true,
    fields: [
      { id: 'title', label: 'Asset Name / Hostname', type: 'text', required: true, placeholder: 'e.g. srv-dc1-auth-02.apexbank.local' },
      { id: 'targetSystem', label: 'Primary Cluster / Environment', type: 'select', required: true, options: ['DC1 Primary Datacenter', 'DC2 Disaster Recovery Datacenter', 'Cloud Private VPC'], defaultValue: 'DC1 Primary Datacenter' },
      { id: 'justification', label: 'Hardware Specs & Network Subnet', type: 'textarea', required: false, placeholder: 'IP Address, OS version, application hosted...' },
    ],
  },
];

export const WrikeRequestFormsView: React.FC<WrikeRequestFormsViewProps> = ({ onFormSubmitted }) => {
  const { fetchWithAuth } = useAuth();
  const { t } = useI18n();
  const [forms, setForms] = useState<RequestFormDefinition[]>(CANONICAL_FALLBACK_FORMS);
  const [selectedFormId, setSelectedFormId] = useState<string>('form-incident');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
      setIsLoading(true);
      const res = await fetchWithAuth('/api/request-forms');
      const data = await res.json();
      if (data.success && Array.isArray(data.forms) && data.forms.length > 0) {
        setForms(data.forms);
      }
    } catch (err) {
      console.warn('Using canonical fallback request forms:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadForms();
  }, []);

  const selectedForm = useMemo(() => {
    return forms.find((f) => f.id === selectedFormId) || forms[0] || CANONICAL_FALLBACK_FORMS[0];
  }, [forms, selectedFormId]);

  // Sync form defaults when selectedForm changes
  useEffect(() => {
    if (!selectedForm) return;
    const initialValues: Record<string, any> = {};
    for (const field of selectedForm.fields || []) {
      initialValues[field.id] = field.defaultValue || '';
    }
    setFormData((prev) => ({
      ...initialValues,
      urgency: prev.urgency || initialValues.urgency || 'HIGH',
      targetSystem: prev.targetSystem || initialValues.targetSystem || 'SWIFT Alliance Gateway',
      title: prev.title || '',
      justification: prev.justification || '',
    }));
  }, [selectedFormId]);

  const categories = useMemo(() => {
    const list = Array.from(new Set(forms.map((f) => f.category).filter(Boolean)));
    return ['ALL', ...list];
  }, [forms]);

  const filteredForms = useMemo(() => {
    return forms.filter((form) => {
      const matchesCat = selectedCategory === 'ALL' || form.category === selectedCategory;
      const text = `${form.title} ${form.description} ${form.category}`.toLowerCase();
      const matchesSearch = !searchQuery || text.includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [forms, selectedCategory, searchQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForm) return;

    try {
      setIsSubmitting(true);
      const res = await fetchWithAuth(`/api/request-forms/${selectedForm.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: formData }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmittedMessage(
          `✅ Müraciət qeydə alındı! Bilet: ${data.ticket.key} (${selectedForm.destinationFolder}).`
        );
        if (onFormSubmitted) {
          onFormSubmitted(data.ticket);
        }
        setFormData({
          urgency: 'HIGH',
          targetSystem: 'SWIFT Alliance Gateway',
          title: '',
          justification: '',
          durationDays: '30',
        });
      } else {
        alert(data.error || 'Müraciət göndərilərkən xəta baş verdi.');
      }
    } catch (err: any) {
      alert(`Xəta: ${err.message || 'Müraciət göndərilmədi.'}`);
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

  const ActiveIcon = selectedForm ? getFormIcon(selectedForm.iconName) : FileText;

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-page overflow-hidden select-none">
      {/* Enterprise Header Bar */}
      <div className="bg-semantic-panel border-b border-semantic-border px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-semantic-success-surface text-semantic-brand border border-semantic-success-border flex items-center justify-center font-bold shadow-xs">
            <FileText className="w-5 h-5 text-semantic-brand" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-extrabold text-semantic-primary tracking-tight">
                {t('Security Request Forms & Work Intake')}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-semantic-success-surface text-semantic-brand text-micro font-bold border border-semantic-success-border">
                {forms.length} {t('Active Intake Forms')}
              </span>
            </div>
            <p className="text-xs text-semantic-muted mt-0.5">
              {t('Capture incoming business requests with conditional branching, validation, and automated routing.')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => void loadForms()}
            disabled={isLoading}
            className="wrike-btn-secondary text-xs py-1.5 px-3 flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{t('Refresh Catalog')}</span>
          </button>
        </div>
      </div>

      {/* Main 2-Pane Intake Workspace */}
      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        {/* Left Form Catalog */}
        <div className="w-84 xl:w-96 flex flex-col space-y-3.5 shrink-0 overflow-hidden">
          {/* Search and Category Filter */}
          <div className="space-y-2">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-semantic-placeholder absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('Search intake forms...')}
                className="w-full bg-semantic-panel border border-semantic-border-strong focus:border-semantic-brand rounded-lg pl-8.5 pr-3 py-1.5 text-xs text-semantic-primary outline-none transition-colors"
              />
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-micro">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-full font-semibold transition-all shrink-0 ${
                    selectedCategory === cat
                      ? 'bg-semantic-brand text-white shadow-xs'
                      : 'bg-semantic-panel border border-semantic-border text-semantic-muted hover:text-semantic-primary'
                  }`}
                >
                  {cat === 'ALL' ? t('All Forms') : cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between px-1 text-micro font-bold uppercase tracking-wider text-semantic-muted">
            <span>{t('Available Forms')} ({filteredForms.length})</span>
          </div>

          {/* Form Cards List */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
            {filteredForms.map((form) => {
              const Icon = getFormIcon(form.iconName);
              const isSelected = selectedForm?.id === form.id;
              return (
                <div
                  key={form.id}
                  onClick={() => {
                    setSelectedFormId(form.id);
                    setSubmittedMessage(null);
                  }}
                  className={`p-3.5 rounded-xl border transition-all duration-150 cursor-pointer text-left ${
                    isSelected
                      ? 'border-semantic-brand bg-semantic-panel shadow-sm border-l-4 border-l-semantic-brand'
                      : 'border-semantic-border bg-semantic-panel hover:border-semantic-border-strong hover:bg-semantic-subtle/70'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-semantic-success-surface text-semantic-brand border border-semantic-success-border'
                        : 'bg-semantic-subtle text-semantic-muted border border-semantic-border'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-semantic-muted">
                          {form.category}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-semantic-subtle border border-semantic-border text-semantic-secondary">
                          {form.defaultSeverity}
                        </span>
                      </div>
                      <h4 className="font-bold text-xs text-semantic-primary leading-snug">
                        {form.title}
                      </h4>
                      <p className="text-[11px] text-semantic-muted leading-relaxed mt-1 line-clamp-2">
                        {form.description}
                      </p>
                      <div className="mt-2 text-[10.5px] font-mono text-semantic-info flex items-center gap-1.5">
                        <FolderSync className="w-3 h-3 shrink-0" />
                        <span className="truncate">{form.destinationFolder}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Form Live Execution */}
        <div className="flex-1 bg-semantic-panel rounded-xl border border-semantic-border shadow-sm p-6 overflow-y-auto custom-scrollbar flex flex-col justify-between">
          <div className="space-y-6">
            {/* Form Title & Destination Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-semantic-border pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-semantic-success-surface text-semantic-brand border border-semantic-success-border flex items-center justify-center">
                  <ActiveIcon className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-mono font-bold text-semantic-brand uppercase tracking-wider">
                      {selectedForm?.category}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-semantic-subtle text-semantic-secondary border border-semantic-border text-[10px] font-bold font-mono">
                      SLA: {selectedForm?.defaultPriority || 'P2'}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-semantic-primary mt-0.5">
                    {selectedForm?.title}
                  </h2>
                </div>
              </div>

              <div className="sm:text-right text-xs">
                <span className="text-caption text-semantic-muted block">{t('Destination Pipeline')}</span>
                <span className="font-mono font-semibold text-semantic-info text-xs">
                  {selectedForm?.destinationFolder}
                </span>
              </div>
            </div>

            {submittedMessage && (
              <div className="p-3.5 rounded-lg bg-semantic-success-surface border border-semantic-success-border text-xs font-semibold text-semantic-success flex items-center justify-between shadow-xs animate-fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{submittedMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSubmittedMessage(null)}
                  className="text-micro font-bold text-semantic-muted hover:text-semantic-primary"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Dynamic Form Questions */}
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-semantic-primary mb-1.5 block">
                  {t('Request Summary / Headline')} <span className="text-semantic-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={
                    selectedForm?.id === 'form-incident'
                      ? 'e.g. Suspicious unauthorized traffic to SWIFT host'
                      : selectedForm?.id === 'form-exception'
                      ? 'e.g. Temporary Port 8443 bypass for payment staging'
                      : 'e.g. Production microservice security assessment'
                  }
                  className="w-full bg-semantic-panel border border-semantic-border-strong focus:border-semantic-brand rounded-lg px-3.5 py-2 text-xs text-semantic-primary outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-semantic-primary mb-1.5 block">
                    {t('Urgency / Severity Tier')}
                  </label>
                  <select
                    value={formData.urgency || 'HIGH'}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                    className="w-full bg-semantic-panel border border-semantic-border-strong focus:border-semantic-brand rounded-lg px-3 py-2 text-xs text-semantic-primary outline-none transition-colors"
                  >
                    <option value="EMERGENCY">Emergency (P1 SLA: 15 mins)</option>
                    <option value="HIGH">High Urgency (P2 SLA: 1 hour)</option>
                    <option value="MEDIUM">Standard (P3 SLA: 4 hours)</option>
                    <option value="LOW">Low (P4 SLA: 24 hours)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-semantic-primary mb-1.5 block">
                    {t('Target Banking System')}
                  </label>
                  <select
                    value={formData.targetSystem || 'SWIFT Alliance Gateway'}
                    onChange={(e) => setFormData({ ...formData, targetSystem: e.target.value })}
                    className="w-full bg-semantic-panel border border-semantic-border-strong focus:border-semantic-brand rounded-lg px-3 py-2 text-xs text-semantic-primary outline-none transition-colors"
                  >
                    <option value="SWIFT Alliance Gateway">SWIFT Alliance Gateway (Tier-1)</option>
                    <option value="Apex Core Banking Gateway (Temenos T24)">Apex Core Banking Gateway (Temenos T24)</option>
                    <option value="Apex Retail Mobile Banking Backend API">Apex Retail Mobile Banking Backend API</option>
                    <option value="Perimeter DC1 Gateway Firewall">Perimeter DC1 Gateway Firewall</option>
                    <option value="Corporate Active Directory (DC1)">Corporate Active Directory (DC1)</option>
                  </select>
                </div>
              </div>

              {/* Conditional Dual-Control Parameters for Exception */}
              {selectedForm?.id === 'form-exception' && (
                <div className="p-4 bg-semantic-warning-surface/50 border border-semantic-warning-border rounded-xl space-y-3">
                  <div className="font-bold text-xs text-semantic-warning flex items-center gap-2">
                    <Lock className="w-4 h-4 text-semantic-warning shrink-0" />
                    <span>{t('Dual-Control Exception Parameters (ISO 27001)')}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-semantic-primary block mb-1">
                        {t('Exception Validity Period')}
                      </label>
                      <select
                        value={formData.durationDays || '30'}
                        onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                        className="w-full bg-semantic-panel border border-semantic-border-strong focus:border-semantic-brand rounded-lg px-3 py-1.5 text-xs text-semantic-primary outline-none"
                      >
                        <option value="7">7 Calendar Days</option>
                        <option value="30">30 Calendar Days (Standard)</option>
                        <option value="60">60 Calendar Days (CISO Pre-approval Required)</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-semantic-primary block mb-1">
                        {t('Compensating Controls')}
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. IPS sensor monitoring enabled"
                        className="w-full bg-semantic-panel border border-semantic-border-strong focus:border-semantic-brand rounded-lg px-3 py-1.5 text-xs text-semantic-primary outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="font-bold text-semantic-primary mb-1.5 block">
                  {t('Business Justification & Context')}
                </label>
                <textarea
                  value={formData.justification || ''}
                  onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                  placeholder={t('Provide technical rationale, regulatory obligations, or incident evidence...')}
                  className="w-full bg-semantic-panel border border-semantic-border-strong focus:border-semantic-brand rounded-lg px-3.5 py-2.5 text-xs text-semantic-primary outline-none h-28 resize-none transition-colors"
                />
              </div>

              {/* Submit Button & Auto-Routing Callout */}
              <div className="pt-4 border-t border-semantic-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-caption text-semantic-muted flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-semantic-brand shrink-0" />
                  <span>{t('Work intake routes this request directly to verified operational squads.')}</span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="wrike-btn-primary py-2.5 px-6 text-xs font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? t('Submitting...') : t('Submit Request Form')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
