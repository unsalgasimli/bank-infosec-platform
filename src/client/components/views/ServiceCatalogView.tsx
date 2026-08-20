import React, { useEffect, useMemo, useState } from 'react';
import { Grid, Search, Shield, Key, Server, FileText, ArrowRight, Clock, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { RequestFormDefinition } from '../../../shared/types/request-forms.js';

interface ServiceCatalogViewProps { onOpenCreate: () => void; onNavigate: (destination: string) => void; }

const iconForCategory = (category: string) => {
  const value = category.toLowerCase();
  if (value.includes('access') || value.includes('iam')) return Key;
  if (value.includes('infra') || value.includes('asset')) return Server;
  if (value.includes('security') || value.includes('risk')) return Shield;
  return FileText;
};

export const ServiceCatalogView: React.FC<ServiceCatalogViewProps> = ({ onOpenCreate, onNavigate }) => {
  const { fetchWithAuth } = useAuth();
  const [forms, setForms] = useState<RequestFormDefinition[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchWithAuth('/api/request-forms')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Service catalog could not be loaded.');
        if (active) setForms((data.forms || []).filter((form: RequestFormDefinition) => form.isActive));
      })
      .catch((requestError) => active && setError(requestError instanceof Error ? requestError.message : 'Service catalog could not be loaded.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [fetchWithAuth]);

  const categories = useMemo(() => ['ALL', ...Array.from(new Set(forms.map((form) => form.category).filter(Boolean)))], [forms]);
  const filteredForms = forms.filter((form) => {
    const text = `${form.title} ${form.description} ${form.category} ${form.fields.map((field) => field.label).join(' ')}`.toLowerCase();
    return (selectedCategory === 'ALL' || form.category === selectedCategory) && (!searchQuery || text.includes(searchQuery.toLowerCase()));
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#F8FAFC] custom-scrollbar select-none">
      <div className="wrike-card p-6 bg-gradient-to-r from-[#FFFFFF] via-[#F8FAFC] to-[#EBF4FD]/40 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-[#0073D3] text-white flex items-center justify-center shadow-md"><Grid className="w-6 h-6" /></div><div><h1 className="text-xl font-bold text-[#162136]">Enterprise Service Catalog</h1><p className="text-xs text-[#64748B] mt-0.5">Authorized request forms and their configured workflow, approval and SLA policies.</p></div></div>
        <div className="relative w-full md:w-72"><Search className="w-4 h-4 absolute left-3 top-2.5 text-[#94A3B8]" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search service catalog..." className="w-full bg-white border border-[#CBD5E1] focus:border-[#0073D3] rounded-lg pl-9 pr-3 py-2 text-xs text-[#162136] outline-none" /></div>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">{categories.map((category) => <button key={category} onClick={() => setSelectedCategory(category)} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${selectedCategory === category ? 'bg-[#0073D3] text-white shadow-xs' : 'bg-white border border-[#E2E8F0] text-[#64748B]'}`}>{category === 'ALL' ? 'All Services' : category}</button>)}</div>
      {loading ? <div className="wrike-card p-10 text-center text-sm text-[#64748B]">Loading configured service catalog…</div> : error ? <div className="wrike-card p-10 text-center text-sm text-[#CF1322] flex flex-col items-center gap-2"><AlertCircle className="w-6 h-6" />{error}</div> : filteredForms.length === 0 ? <div className="wrike-card p-10 text-center text-sm text-[#64748B]">No authorized, active request forms match this filter.</div> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">{filteredForms.map((form) => { const Icon = iconForCategory(form.category); return <div key={form.id} className="wrike-card p-5 flex flex-col justify-between space-y-4 hover:border-[#0073D3] transition-all shadow-xs"><div className="space-y-3"><div className="flex items-center justify-between"><div className="w-10 h-10 rounded-xl bg-[#EBF4FD] text-[#0073D3] border border-[#BAE0FD] flex items-center justify-center"><Icon className="w-5 h-5" /></div><span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">{form.category}</span></div><div><h3 className="font-bold text-sm text-[#162136]">{form.title}</h3><p className="text-xs text-[#64748B] mt-1.5 leading-relaxed line-clamp-3">{form.description || 'No description has been configured.'}</p></div></div><div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between"><span className="text-[11px] text-[#64748B] flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-[#00B259]" />{form.slaPolicyId ? `SLA policy: ${form.slaPolicyId}` : 'No SLA policy assigned'}</span><button onClick={() => onNavigate('request-forms')} className="px-3 py-1.5 rounded-lg bg-[#0073D3] text-white font-bold text-xs flex items-center gap-1"><span>Open form</span><ArrowRight className="w-3 h-3" /></button></div></div>; })}</div>}
      {forms.length === 0 && !loading && !error && <button onClick={onOpenCreate} className="wrike-btn-primary text-xs">Create a ticket</button>}
    </div>
  );
};
