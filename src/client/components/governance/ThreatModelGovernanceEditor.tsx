import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Download, FileText, Info, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ThreatModelDetail } from './ThreatModelDetailPanel.js';
import { ThreatModelEmergencyEditor } from './ThreatModelEmergencyEditor.js';
import { ThreatControlCatalogEditor } from './ThreatControlCatalogEditor.js';
import { ThreatContentEditor } from './ThreatContentEditor.js';
import { ThreatArchitectureEditor } from './ThreatArchitectureEditor.js';
import { ThreatAnalysisEditor } from './ThreatAnalysisEditor.js';
import { ThreatFindingEditor } from './ThreatFindingEditor.js';
import { ThreatGovernanceAdminEditor } from './ThreatGovernanceAdminEditor.js';
import { renderThreatSnapshotReport } from '../../../shared/threat-snapshot-report.js';
import { useI18n } from '../../context/I18nContext.js';

type Props = {
  detail: ThreatModelDetail;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  onRefresh: () => Promise<void>;
  initialSection?: string;
  allowedSections?: string[];
};

const inputClass = 'jira-input mt-1.5 w-full text-xs';
const split = (value: FormDataEntryValue | null) =>
  String(value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Human-readable select labels; keys go through the translation catalog. */
const classificationLabels: Record<string, string> = {
  PUBLIC: 'Public', INTERNAL: 'Internal', RESTRICTED: 'Restricted',
  CONFIDENTIAL_SECURITY_ONLY: 'Confidential (Security only)', HIGHLY_RESTRICTED_HR_LEGAL: 'Highly Restricted (HR & Legal)',
};
const sensitivityLabels: Record<string, string> = {
  personalData: 'Personal data', sensitivePersonalData: 'Sensitive personal data', bankSecrecy: 'Bank secrecy',
  credentialData: 'Credential data', paymentData: 'Payment data',
};

const SCREENING_SIGNAL_METADATA: Record<
  string,
  { title: string; titleAz: string; category: string; categoryAz: string; desc: string; descAz: string }
> = {
  paymentRelated: {
    title: 'Payment processing systems',
    titleAz: 'Ödəniş emalı və əməliyyat sistemləri',
    category: 'Critical Capability',
    categoryAz: 'Kritik qabiliyyət',
    desc: 'Direct integration with payment gateways, cardholder data environments, or fund transfer networks.',
    descAz: 'Ödəniş şlüzləri, kart məlumatları mühiti və ya pul köçürmə şəbəkələri ilə birbaşa inteqrasiya.',
  },
  financialTransactions: {
    title: 'Financial transactions & balance transfers',
    titleAz: 'Maliyyə tranzaksiyaları və köçürmələri',
    category: 'Critical Capability',
    categoryAz: 'Kritik qabiliyyət',
    desc: 'Originates, mutates, or clears financial movement of funds, credits, or balances.',
    descAz: 'Pul vəsaitlərinin və ya kredit balanslarının maliyyə hərəkətini icra edir və ya dəyişir.',
  },
  authenticationChange: {
    title: 'Authentication & credential architecture',
    titleAz: 'Autentifikasiya və etibarnamə arxitekturası',
    category: 'Critical Capability',
    categoryAz: 'Kritik qabiliyyət',
    desc: 'Modifications to SSO, MFA, password verification, biometric, or token issuance.',
    descAz: 'SSO, MFA, şifrələmə, biometrik və ya token verilməsi məntiqində dəyişikliklər.',
  },
  iamPamRelated: {
    title: 'IAM / PAM privileged identity governance',
    titleAz: 'IAM / PAM imtiyazlı giriş idarəetməsi',
    category: 'Critical Capability',
    categoryAz: 'Kritik qabiliyyət',
    desc: 'Enforces identity lifecycle, privileged administrative sessions, or entitlement delegation.',
    descAz: 'İstifadəçi həyat dövrü, imtiyazlı sessiyalar və ya inzibati səlahiyyət idarəetməsi.',
  },
  cryptography: {
    title: 'Cryptographic controls & key management',
    titleAz: 'Kriptoqrafik nəzarət və açar idarəetməsi',
    category: 'Critical Capability',
    categoryAz: 'Kritik qabiliyyət',
    desc: 'HSM usage, key lifecycle, envelope encryption, or custom cryptographic algorithms.',
    descAz: 'HSM modulları, açar həyat dövrü, zərf şifrələməsi və ya kriptoqrafik alqoritmlər.',
  },
  bankSecrecy: {
    title: 'Banking secrecy & regulated customer financials',
    titleAz: 'Bank sirri və tənzimlənən müştəri məlumatları',
    category: 'Critical Capability',
    categoryAz: 'Kritik qabiliyyət',
    desc: 'Accesses, transforms, or stores legally protected banking secrecy records.',
    descAz: 'Qanunla qorunan bank sirri təşkil edən maliyyə qeydlərinə çıxış, saxlama və ya emal.',
  },
  sensitivePersonalData: {
    title: 'Special category sensitive personal data',
    titleAz: 'Xüsusi kateqoriyalı həssas fərdi məlumatlar',
    category: 'Critical Capability',
    categoryAz: 'Kritik qabiliyyət',
    desc: 'Biometric, national identity PIN, health, or sensitive demographic records.',
    descAz: 'Biometrik, şəxsiyyət vəsiqəsi, FİN kod və ya xüsusi qorunan fərdi məlumatlar.',
  },
  privilegedCapability: {
    title: 'Privileged administrative capability',
    titleAz: 'İmtiyazlı inzibati funksionallıq',
    category: 'Critical Capability',
    categoryAz: 'Kritik qabiliyyət',
    desc: 'System-wide administrative overrides, database direct mutations, or break-glass access.',
    descAz: 'Sistem miqyasında inzibati müdaxilə, bazaya birbaşa dəyişiklik və ya fövqəladə giriş.',
  },
  criticalInfrastructure: {
    title: 'Critical banking infrastructure & core networks',
    titleAz: 'Kritik bank infrastrukturu və əsas şəbəkələr',
    category: 'Critical Capability',
    categoryAz: 'Kritik qabiliyyət',
    desc: 'Host OS root tier, backbone switches, hypervisors, or domain controller environments.',
    descAz: 'Əsas əməliyyat sistemi mühiti, magistral kommutatorlar və ya domen nəzarətçiləri.',
  },
  coreBankingRelated: {
    title: 'Core banking systems (CBS) integration',
    titleAz: 'Əsas bank sistemləri (CBS) inteqrasiyası',
    category: 'Critical Capability',
    categoryAz: 'Kritik qabiliyyət',
    desc: 'Direct hooks or batch interfaces into the core general ledger and account books.',
    descAz: 'Əsas mühasibatlıq və hesab kitabları ilə birbaşa inteqrasiya və ya paket interfeysləri.',
  },
  criticalThirdParty: {
    title: 'Critical third-party vendor connection',
    titleAz: 'Kritik kənar üçüncü tərəf bağlantısı',
    category: 'Critical Capability',
    categoryAz: 'Kritik qabiliyyət',
    desc: 'External financial vendors, clearing networks, credit bureaus, or payment gateways.',
    descAz: 'Kənar maliyyə təchizatçıları, klirinq şəbəkələri, kredit büroları və ya ödəniş sistemləri.',
  },
  highValueBusinessLogic: {
    title: 'High-value business logic & automated decisions',
    titleAz: 'Yüksək dəyərli biznes məntiqi və avtomatlaşdırılmış qərarlar',
    category: 'Critical Capability',
    categoryAz: 'Kritik qabiliyyət',
    desc: 'Automated loan approvals, underwriting engines, treasury trades, or anti-fraud rules.',
    descAz: 'Avtomatlaşdırılmış kredit təsdiqi, xəzinədarlıq əməliyyatları və ya fırıldaqçılıq qaydaları.',
  },
  internetExposed: {
    title: 'Internet-facing surface / public ingress',
    titleAz: 'İnternetə açıq səth və ictimai giriş',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Direct ingress routing from public internet without bastion or perimeter security proxy.',
    descAz: 'İctimai internetdən təhlükəsizlik zonasına birbaşa daxilolma marşrutu.',
  },
  customerData: {
    title: 'Customer identifying data (PII)',
    titleAz: 'Müştəri eyniləşdirmə məlumatları (PII)',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Customer names, contact records, phone numbers, email addresses, or account metadata.',
    descAz: 'Müştəri adları, əlaqə nömrələri, e-poçt ünvanları və ya hesab meta-məlumatları.',
  },
  confidentialData: {
    title: 'Bank confidential & proprietary data',
    titleAz: 'Bank məxfi və mülkiyyət məlumatları',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Internal business models, pricing strategies, source code, or confidential contracts.',
    descAz: 'Daxili biznes modelləri, qiymət strategiyaları, mənbə kodu və ya daxili müqavilələr.',
  },
  authorizationChange: {
    title: 'Authorization matrix & role modifications',
    titleAz: 'Avtorizasiya matrisi və rol bölgüsü dəyişikliyi',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Modifications to RBAC/ABAC policies, tenant boundary checks, or endpoint permission scopes.',
    descAz: 'RBAC/ABAC siyasətləri, zona ayrılması və ya son nöqtə icazə səviyyələrində dəyişikliklər.',
  },
  externalApi: {
    title: 'External API integration / partner endpoint',
    titleAz: 'Kənar API inteqrasiyası və tərəfdaş son nöqtəsi',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Inbound or outbound webhook, REST/GraphQL interface connecting to external third parties.',
    descAz: 'Kənar tərəflərlə əlaqə quran daxil olan və ya çıxan vebhuk, REST/GraphQL interfeysi.',
  },
  trustBoundary: {
    title: 'Crosses network / zone trust boundary',
    titleAz: 'Şəbəkə / zona etibar sərhədini keçir',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Traffic traverses firewalls, VPC peering, DMZ boundaries, or isolated security segments.',
    descAz: 'Trafik şəbəkələrarası ekranı, DMZ-ni və ya təcrid olunmuş təhlükəsizlik zonasını keçir.',
  },
  thirdPartyIntegration: {
    title: 'Third-party SaaS / cloud service integration',
    titleAz: 'Üçüncü tərəf SaaS / bulud xidməti inteqrasiyası',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'External third-party SDKs, telemetry collectors, or SaaS webhook handlers.',
    descAz: 'Üçüncü tərəf SDK-lar, telemetriya toplayıcıları və ya SaaS vebhuk işləyiciləri.',
  },
  cloudDeployment: {
    title: 'Cloud infrastructure / container deployment',
    titleAz: 'Bulud infrastrukturu və konteyner tətbiqi',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Kubernetes, cloud workloads, serverless functions, or cloud object storage buckets.',
    descAz: 'Kubernetes, bulud iş yükləri, serverless funksiyalar və ya bulud saxlama mühiti.',
  },
  newDataStore: {
    title: 'New datastore / database instance',
    titleAz: 'Yeni məlumat anbarı və ya verilənlər bazası',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Provisions a new SQL, NoSQL, in-memory cache (Redis), or search index cluster.',
    descAz: 'Yeni SQL, NoSQL, Redis keş və ya axtarış indeksi klasteri əlavə edilir.',
  },
  secretsHandling: {
    title: 'Secrets management / token / API keys',
    titleAz: 'Məxfi açarlar, token və API açarlarının emalı',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Processes, stores, or rotates credentials, private certificates, or service tokens.',
    descAz: 'Etibarnamələrin, şəxsi sertifikatların və ya servis tokenlərinin saxlanması və yenilənməsi.',
  },
  materialArchitectureChange: {
    title: 'Material architecture & topology change',
    titleAz: 'Əhəmiyyətli memarlıq və topologiya dəyişikliyi',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Restructuring system communication paths, protocol transitions, or core service splits.',
    descAz: 'Sistem rabitə yollarının yenidən qurulması, protokol dəyişikliyi və ya servis bölgüsü.',
  },
  highCriticalAsset: {
    title: 'Interacts with Tier-1 / Tier-2 critical asset',
    titleAz: '1-ci və ya 2-ci səviyyəli kritik aktivlə qarşılıqlı əlaqə',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Downstream dependency or caller of enterprise high-criticality banking applications.',
    descAz: 'Yüksək kritiklikli bank sisteminin aşağı axın asılılığı və ya çağırıcısı.',
  },
  securityIncidentDriven: {
    title: 'Security incident / breach remediation',
    titleAz: 'Təhlükəsizlik insidenti / pozuntu islahatı',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'System modifications driven by post-incident RCA, breach response, or audit findings.',
    descAz: 'İnsident təhlili, təhlükəsizlik pozuntusu və ya audit tapıntıları nəticəsində edilən dəyişikliklər.',
  },
  criticalVulnerability: {
    title: 'Critical CVE / penetration test fix',
    titleAz: 'Kritik CVE / nüfuz testi tapıntısının aradan qaldırılması',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Architectural changes specifically designed to remediate high/critical CVEs or pentest bugs.',
    descAz: 'Yüksək/kritik təhlükəsizlik boşluqlarını aradan qaldırmaq üçün nəzərdə tutulmuş memarlıq dəyişiklikləri.',
  },
  aiIntegration: {
    title: 'AI / ML / LLM model or agent integration',
    titleAz: 'Süni intellekt (AI/ML/LLM) və ya agent inteqrasiyası',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Prompt engineering, vector datastores, autonomous agent decisioning, or model inference.',
    descAz: 'Sorğu mühəndisliyi, vektor bazaları, avtonom agent qərarları və ya model nəticələri.',
  },
  newMobileFunctionality: {
    title: 'Mobile application client functionality',
    titleAz: 'Mobil tətbiq müştəri funksionallığı',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Client-side banking features, mobile SDKs, device security, or jailbreak/root verification.',
    descAz: 'Mobil bankçılıq imkanları, mobil SDK-lar, cihaz root/jailbreak yoxlaması.',
  },
  newMessageBroker: {
    title: 'Message broker / queue infrastructure',
    titleAz: 'Mesaj brokeri və növbə infrastrukturu',
    category: 'Security Impact',
    categoryAz: 'Təhlükəsizlik təsiri',
    desc: 'Kafka, RabbitMQ, SQS, or event stream ingestion messaging pipelines.',
    descAz: 'Kafka, RabbitMQ, SQS və ya hadisə axını qəbul konveyerləri.',
  },
  internalChange: {
    title: 'Internal application / routine maintenance',
    titleAz: 'Daxili tətbiq dəyişikliyi və ya rutin xidmət',
    category: 'Internal Change',
    categoryAz: 'Daxili dəyişiklik',
    desc: 'Standard bug fixes, internal refactoring, or low-risk non-material enhancements.',
    descAz: 'Standart xəta düzəlişi, daxili refaktoring və ya aşağı riskli rutin təkmilləşdirmə.',
  },
};

/** Forms submit actual persisted domain records; errors stay inside the workspace. */
export function ThreatModelGovernanceEditor({
  detail,
  fetchWithAuth,
  onRefresh,
  initialSection = 'screening',
  allowedSections,
}: Props) {
  const { t, language } = useI18n();
  const isAz = language === 'az';
  const [data, setData] = useState<any>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [section, setSection] = useState(initialSection);
  const [exportFormat, setExportFormat] = useState<'json' | 'html'>('html');
  const pendingScrollHost = useRef<HTMLElement | null>(null);
  const pendingScrollTop = useRef<number | null>(null);

  useEffect(() => {
    setData(undefined);
  }, [detail.model.id]);

  useEffect(() => {
    setSection(initialSection);
  }, [detail.model.id, initialSection]);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void fetchWithAuth(`/api/threat-models/${detail.model.id}/governance`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || t('Governance could not be loaded.'));
        if (!controller.signal.aborted) setData(result.governance);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(String(cause.message));
      });
    return () => controller.abort();
  }, [detail.model.id, refresh]);

  // Nested governance sections can mount different-sized forms. Retain the user's
  // viewport instead of allowing the surrounding workspace to snap back to its top.
  useLayoutEffect(() => {
    const host = pendingScrollHost.current;
    const top = pendingScrollTop.current;
    if (!host || top === null) return;
    const frame = window.requestAnimationFrame(() => {
      host.scrollTop = top;
      pendingScrollHost.current = null;
      pendingScrollTop.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [section]);

  const changeSection = (event: React.MouseEvent<HTMLButtonElement>, nextSection: string) => {
    const scrollHost = event.currentTarget.closest('.custom-scrollbar') as HTMLElement | null;
    pendingScrollHost.current = scrollHost;
    pendingScrollTop.current = scrollHost?.scrollTop ?? null;
    setSection(nextSection);
  };

  const submit = async (
    event: React.FormEvent<HTMLFormElement>,
    path: string,
    transform?: (form: FormData) => unknown
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response = await fetchWithAuth(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transform ? transform(form) : Object.fromEntries(form)),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || t('Governance operation failed.'));
      await onRefresh();
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Operation failed.'));
    } finally {
      setBusy(false);
    }
  };

  const base = `/api/threat-models/${detail.model.id}`;
  const revision = detail.revisions?.find((item) => item.id === data?.revision?.id);
  const mutable =
    revision &&
    ['DRAFT', 'CHANGES_REQUIRED'].includes(revision.status) &&
    !['RETIRED', 'ARCHIVED'].includes(detail.model.status);

  const select = (name: string, label: string, items: any[], optional = false) => (
    <label className="block text-xs font-semibold text-semantic-jira-muted">
      {t(label)}
      <select name={name} className={inputClass} required={!optional}>
        <option value="">{t('Select…')}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title || item.name || item.code || item.id}
          </option>
        ))}
      </select>
    </label>
  );

  const field = (name: string, label: string, value = '', type = 'text', required = true) => (
    <label className="block text-xs font-semibold text-semantic-jira-muted">
      {t(label)}
      <input className={inputClass} name={name} defaultValue={value} type={type} required={required} />
    </label>
  );

  const save = (
    <div className="pt-2 sm:col-span-2">
      <button type="submit" className="jira-btn-primary text-xs" disabled={busy}>
        {t('Save to server')}
      </button>
    </div>
  );

  const allTabsList = [
    { id: 'screening', label: t('Screening') },
    { id: 'scope', label: t('Scope') },
    { id: 'architecture', label: t('Architecture') },
    { id: 'data', label: t('Data') },
    { id: 'requirements', label: t('Requirements') },
    { id: 'control catalog', label: t('Control catalog') },
    { id: 'threat content', label: t('Threat content') },
    { id: 'analysis', label: t('Analysis') },
    { id: 'findings', label: t('Findings') },
    { id: 'threat state', label: t('Threat state') },
    { id: 'exceptions', label: t('Exceptions') },
    { id: 'emergency', label: t('Emergency') },
    { id: 'compliance', label: t('Compliance') },
    { id: 'access & retention', label: t('Access & retention') },
    { id: 'versions', label: t('Versions') },
  ];

  const tabsList = allowedSections
    ? allTabsList.filter((item) => allowedSections.includes(item.id))
    : allTabsList;

  const getSignalInfo = (signal: string) => {
    const meta = SCREENING_SIGNAL_METADATA[signal];
    if (!meta) {
      return {
        title: signal.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
        category: t('Security Impact'),
        desc: '',
      };
    }
    return {
      title: isAz ? meta.titleAz : meta.title,
      category: isAz ? meta.categoryAz : meta.category,
      desc: isAz ? meta.descAz : meta.desc,
    };
  };

  return (
    <section className="threat-governance-editor space-y-4">
      {error && (
        <div
          role="alert"
          className="border border-semantic-danger-border bg-semantic-danger-surface text-semantic-danger p-3.5 rounded-xl text-xs flex items-center gap-2 shadow-xs"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!data ? (
        error ? (
          <div className="p-4 border border-semantic-jira-border bg-semantic-panel rounded-xl text-center">
            <button className="jira-btn-subtle text-xs" onClick={() => setRefresh((value) => value + 1)}>
              {t('Retry governance load')}
            </button>
          </div>
        ) : (
          <div className="p-8 border border-semantic-jira-border bg-semantic-panel rounded-xl text-center text-xs text-semantic-jira-muted animate-pulse">
            {t('Loading governance record…')}
          </div>
        )
      ) : (
        <>
          {/* Policy & Tier Summary Card */}
          <div className={`border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs ${
            data.revision.tier === null
              ? 'border-semantic-danger-border/80 bg-semantic-danger-surface/40'
              : 'border-semantic-jira-border bg-semantic-panel'
          }`}>
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shadow-xs ${
                  data.revision.tier === null
                    ? 'bg-semantic-danger-surface text-semantic-danger border border-semantic-danger-border'
                    : 'bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border'
                }`}
              >
                {data.revision.tier === null ? (
                  <ShieldAlert className="w-5 h-5" />
                ) : (
                  <ShieldCheck className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-semantic-jira-primary tracking-tight">
                    {data.revision.tier === null
                      ? t('UNSCREENED — approval blocked')
                      : `${t('Tier')} TM-${data.revision.tier} ${t('Model')}`}
                  </span>
                  <span
                    className={`text-micro font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                      data.revision.tier === null
                        ? 'border-semantic-danger-border bg-semantic-danger text-white'
                        : 'border-semantic-jira-info-border bg-semantic-jira-brand-surface text-semantic-jira-brand'
                    }`}
                  >
                    {data.revision.tier === null ? t('Not assessed') : `TM-${data.revision.tier}`}
                  </span>
                </div>
                <div className="text-micro text-semantic-jira-muted">
                  {t('Screening policy')}: <span className="font-mono">{data.revision.policy_version_id || t('Not evaluated')}</span> · {t('Current policy')} v{data.policy.version}
                </div>
              </div>
            </div>

            {!mutable && (
              <div className="text-micro font-medium px-2.5 py-1 rounded bg-semantic-jira-surface border border-semantic-jira-border text-semantic-jira-muted flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-semantic-jira-brand" />
                <span>{t('Reviewed content locked · Create revision to edit')}</span>
              </div>
            )}
          </div>

          {/* Sub-Navigation Tabs: shown only when more than one section is allowed */}
          {tabsList.length > 1 && (
            <nav className="threat-governance-subnav flex flex-wrap gap-1 p-1 bg-semantic-jira-surface/60 border border-semantic-jira-border rounded-xl" aria-label={t('Stage sections')}>
              {tabsList.map((tab) => {
                const active = section === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                      active
                        ? 'bg-semantic-panel text-semantic-jira-brand shadow-xs border border-semantic-jira-border'
                        : 'text-semantic-jira-muted hover:text-semantic-jira-primary hover:bg-semantic-jira-hover/40'
                    }`}
                    onClick={(event) => changeSection(event, tab.id)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Tab Content Panes */}
          {section === 'access & retention' && (
            <ThreatGovernanceAdminEditor
              key={detail.model.id}
              detail={detail}
              fetchWithAuth={fetchWithAuth}
              onRefresh={onRefresh}
            />
          )}
          {section === 'findings' && (
            <ThreatFindingEditor
              key={detail.model.id}
              detail={detail}
              mutable={Boolean(mutable)}
              fetchWithAuth={fetchWithAuth}
              onRefresh={onRefresh}
            />
          )}
          {section === 'analysis' && (
            <ThreatAnalysisEditor
              key={detail.model.id}
              detail={detail}
              mutable={Boolean(mutable)}
              fetchWithAuth={fetchWithAuth}
              onRefresh={onRefresh}
            />
          )}
          {section === 'architecture' && (
            <ThreatArchitectureEditor
              key={detail.model.id}
              detail={detail}
              mutable={Boolean(mutable)}
              fetchWithAuth={fetchWithAuth}
              onRefresh={async () => {
                await onRefresh();
                setRefresh((value) => value + 1);
              }}
            />
          )}
          {section === 'threat content' && (
            <ThreatContentEditor
              key={detail.model.id}
              detail={detail}
              mutable={Boolean(mutable)}
              fetchWithAuth={fetchWithAuth}
              onRefresh={onRefresh}
            />
          )}
          {section === 'control catalog' && (
            <ThreatControlCatalogEditor
              detail={detail}
              mutable={Boolean(mutable)}
              fetchWithAuth={fetchWithAuth}
              onRefresh={async () => {
                await onRefresh();
                setRefresh((value) => value + 1);
              }}
            />
          )}
          {section === 'emergency' && (
            <ThreatModelEmergencyEditor
              modelId={detail.model.id}
              changeId={detail.model.changeId || detail.model.releaseId}
              emergencies={data.emergencies}
              fetchWithAuth={fetchWithAuth}
              onRefresh={async () => {
                await onRefresh();
                setRefresh((value) => value + 1);
              }}
            />
          )}

          {section === 'screening' && (
            <form
              onSubmit={(event) =>
                void submit(event, `${base}/applicability`, (form) => ({
                  justification: form.get('justification'),
                  answers: Object.fromEntries(
                    data.policy.rules.map((rule: any) => [rule.signal, form.get(rule.signal) === 'true'])
                  ),
                }))
              }
              className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm space-y-4"
            >
              <div className="space-y-1 pb-3 border-b border-semantic-jira-border/60">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-semantic-jira-primary text-xs uppercase tracking-wider">
                    {t('Security Screening Assessment')}
                  </h4>
                  <span className="text-micro font-mono text-semantic-jira-muted">
                    {data.policy.rules.length} {t('governance signals')}
                  </span>
                </div>
                <p className="text-xs text-semantic-jira-muted leading-relaxed">
                  {t('Answer every question explicitly. Canonical criticality and data classification can raise the tier; a manual downgrade is not available.')}
                </p>
              </div>
              <fieldset disabled={!mutable || busy} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-3.5">
                  {data.policy.rules.map((rule: any) => {
                    const info = getSignalInfo(rule.signal);
                    return (
                      <div
                        key={rule.signal}
                        className="p-3.5 rounded-xl border border-semantic-jira-border bg-semantic-panel hover:border-semantic-jira-info-border transition-colors flex flex-col gap-2.5 shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0">
                            <div className="font-semibold text-xs text-semantic-jira-primary leading-snug">
                              {info.title}
                            </div>
                            {info.desc && (
                              <p className="text-micro text-semantic-jira-muted leading-normal">
                                {info.desc}
                              </p>
                            )}
                          </div>
                          <span
                            className={`text-micro font-bold px-1.5 py-0.5 rounded border whitespace-nowrap flex-shrink-0 ${
                              rule.minimumTier === 3
                                ? 'border-semantic-danger-border bg-semantic-danger-surface text-semantic-danger'
                                : rule.minimumTier === 2
                                ? 'border-semantic-warning-border bg-semantic-warning-surface text-semantic-warning'
                                : 'border-semantic-jira-border bg-semantic-jira-surface text-semantic-jira-muted'
                            }`}
                          >
                            TM-{rule.minimumTier}
                          </span>
                        </div>
                        <select
                          name={rule.signal}
                          aria-label={info.title}
                          className="jira-input text-xs py-1.5"
                          required
                          defaultValue=""
                        >
                          <option value="">{t('Not assessed')}</option>
                          <option value="false">{t('No')}</option>
                          <option value="true">{t('Yes')}</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
                <div className="pt-2 border-t border-semantic-jira-border/60">
                  {field('justification', t('Assessment rationale'))}
                </div>
                <div className="pt-2">
                  <button type="submit" className="jira-btn-primary text-xs" disabled={busy}>
                    {t('Save screening assessment')}
                  </button>
                </div>
              </fieldset>
            </form>
          )}

          {section === 'scope' && (
            <form
              key={data.revision.version}
              onSubmit={(event) =>
                void submit(event, `${base}/scope`, (form) => ({
                  ...Object.fromEntries(form),
                  version: data.revision.version,
                }))
              }
              className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm space-y-4"
            >
              <div className="pb-2 border-b border-semantic-jira-border/60">
                <h4 className="font-bold text-semantic-jira-primary text-xs uppercase tracking-wider">
                  {t('Scope & Architectural Boundary')}
                </h4>
              </div>
              <fieldset disabled={!mutable || busy} className="grid gap-4">
                {[
                  ['scopeSummary', 'Scope'],
                  ['architectureSummary', 'Architecture summary'],
                  ['assumptions', 'Security assumptions'],
                  ['securityObjectives', 'Security objectives'],
                ].map(([name, label]) => (
                  <label key={name} className="block text-xs font-semibold text-semantic-jira-muted">
                    {t(label)}
                    <textarea
                      name={name}
                      className={`${inputClass} min-h-[70px]`}
                      required
                      defaultValue={revision?.[name] || ''}
                    />
                  </label>
                ))}
                {save}
              </fieldset>
            </form>
          )}

          {section === 'data' && (
            <div className="space-y-4">
              {Array.isArray(data.dataObjects) && data.dataObjects.length > 0 ? (
                <div className="border border-semantic-jira-border rounded-xl divide-y divide-semantic-jira-border bg-semantic-panel shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 font-bold text-caption uppercase text-semantic-jira-muted bg-semantic-jira-surface/50">
                    {t('Tracked Information Assets')}
                  </div>
                  {data.dataObjects.map((item: any) => (
                    <div key={item.id} className="px-4 py-2.5 text-xs flex items-center justify-between">
                      <span className="font-medium text-semantic-jira-primary">{item.name}</span>
                      <span className="text-micro px-2 py-0.5 rounded bg-semantic-jira-surface border border-semantic-jira-border text-semantic-jira-muted">
                        {t(classificationLabels[item.classification] ?? item.classification)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <form
                onSubmit={(event) =>
                  void submit(event, `${base}/data-objects`, (form) => ({
                    ...Object.fromEntries(form),
                    personalData: form.has('personalData'),
                    sensitivePersonalData: form.has('sensitivePersonalData'),
                    bankSecrecy: form.has('bankSecrecy'),
                    credentialData: form.has('credentialData'),
                    paymentData: form.has('paymentData'),
                  }))
                }
                className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="pb-2 border-b border-semantic-jira-border/60">
                  <h4 className="font-bold text-semantic-jira-primary text-xs uppercase tracking-wider">
                    {t('Register Information Asset')}
                  </h4>
                </div>
                <fieldset disabled={!mutable || busy} className="grid md:grid-cols-2 gap-4">
                  {field('name', 'Information asset name')}
                  {field('ownerId', 'Canonical data owner ID')}
                  <label className="block text-xs font-semibold text-semantic-jira-muted">
                    {t('Classification')}
                    <select name="classification" className={inputClass}>
                      {Object.entries(classificationLabels).map(([value, label]) => (
                        <option key={value} value={value}>{t(label)}</option>
                      ))}
                    </select>
                  </label>
                  {field('retention', 'Retention')}
                  {field('allowedLocations', 'Allowed processing / storage locations')}
                  {field('encryptionRequirements', 'Encryption requirements')}
                  {select('componentId', 'Component (choose component OR flow)', detail.components, true)}
                  {select('flowId', 'Data flow', detail.dataFlows, true)}
                  <div className="md:col-span-2 flex flex-wrap gap-4 pt-2">
                    {Object.entries(sensitivityLabels).map(([name, label]) => (
                      <label key={name} className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input type="checkbox" name={name} className="rounded border-semantic-jira-border text-semantic-jira-brand focus:ring-semantic-jira-brand" />
                        {t(label)}
                      </label>
                    ))}
                  </div>
                  {save}
                </fieldset>
              </form>

              <details className="bg-semantic-jira-surface/50 border border-semantic-jira-border rounded-xl p-4 text-xs">
                <summary className="font-semibold text-semantic-jira-primary cursor-pointer">
                  {t('Reuse an existing information asset on another component / flow')}
                </summary>
                <form onSubmit={(event) => void submit(event, `${base}/data-objects`)} className="mt-3">
                  <fieldset disabled={!mutable || busy} className="grid gap-3">
                    {select('dataObjectId', 'Existing data object', data.dataObjects)}
                    {select('componentId', 'Component', detail.components, true)}
                    {select('flowId', 'Data flow', detail.dataFlows, true)}
                    {save}
                  </fieldset>
                </form>
              </details>
            </div>
          )}

          {section === 'requirements' && (
            <div className="space-y-4">
              <details className="bg-semantic-jira-surface/50 border border-semantic-jira-border rounded-xl p-4 text-xs">
                <summary className="font-semibold text-semantic-jira-primary cursor-pointer">
                  {t('Replace a retired compliance interpretation')}
                </summary>
                <form
                  key={data.revision.version}
                  onSubmit={(event) =>
                    void submit(event, `${base}/compliance-mappings/replace`, (form) => ({
                      requirementId: form.get('requirementId'),
                      revisionVersion: data.revision.version,
                      complianceIds: split(form.get('complianceIds')),
                      reason: form.get('reason'),
                    }))
                  }
                  className="mt-3"
                >
                  <fieldset disabled={!mutable || busy} className="grid gap-3">
                    {select('requirementId', 'Requirement', data.requirements)}
                    {field('complianceIds', 'Validated replacement interpretation IDs (comma-separated)')}
                    {field('reason', 'Mapping replacement rationale')}
                    {save}
                  </fieldset>
                </form>
              </details>

              <div className="space-y-2">
                <div className="text-caption font-bold uppercase tracking-wider text-semantic-jira-muted">
                  {t('Security Requirements')}
                </div>
                <div className="space-y-2">
                  {data.requirements.map((item: any) => (
                    <div
                      key={item.id}
                      className="border border-semantic-jira-border bg-semantic-panel p-4 rounded-xl shadow-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-semantic-jira-primary">{item.title}</span>
                        <span
                          className={`text-micro font-semibold px-2 py-0.5 rounded ${
                            item.mandatory
                              ? 'bg-semantic-danger-surface text-semantic-danger border border-semantic-danger-border'
                              : 'bg-semantic-jira-surface text-semantic-jira-muted border border-semantic-jira-border'
                          }`}
                        >
                          {item.mandatory ? t('Mandatory') : t('Optional')}
                        </span>
                      </div>
                      <div className="text-xs text-semantic-jira-muted">
                        {t('Threats')}: {item.threat_ids.join(', ') || '—'} · {t('Controls')}: {item.control_ids.join(', ') || t('Missing')} · {t('Compliance')}: {item.compliance_ids.join(', ') || t('Unmapped')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <form
                onSubmit={(event) =>
                  void submit(event, `${base}/security-requirements`, (form) => ({
                    ...Object.fromEntries(form),
                    mandatory: form.get('mandatory') !== 'false',
                    threatIds: [form.get('threatId')],
                    controlIds: split(form.get('controlIds')),
                    complianceIds: split(form.get('complianceIds')),
                  }))
                }
                className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="pb-2 border-b border-semantic-jira-border/60">
                  <h4 className="font-bold text-semantic-jira-primary text-xs uppercase tracking-wider">
                    {t('Add Security Requirement')}
                  </h4>
                </div>
                <fieldset disabled={!mutable || busy} className="grid md:grid-cols-2 gap-4">
                  {field('title', 'Security requirement')}
                  {field('description', 'Actionable acceptance criteria')}
                  {field('ownerId', 'Implementation owner ID')}
                  {field('verificationMethod', 'Verification method')}
                  {select('threatId', 'Threat', detail.threats)}
                  {field('controlIds', 'Control IDs (comma-separated)', '', 'text', false)}
                  {field('complianceIds', 'Compliance IDs (comma-separated)', '', 'text', false)}
                  <label className="block text-xs font-semibold text-semantic-jira-muted">
                    {t('Mandatory')}
                    <select name="mandatory" className={inputClass}>
                      <option value="true">{t('Yes')}</option>
                      <option value="false">{t('No')}</option>
                    </select>
                  </label>
                  {save}
                </fieldset>
              </form>

              <form
                onSubmit={(event) => void submit(event, `${base}/requirement-controls`)}
                className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="pb-2 border-b border-semantic-jira-border/60">
                  <h4 className="font-bold text-semantic-jira-primary text-xs uppercase tracking-wider">
                    {t('Map Control to Requirement')}
                  </h4>
                </div>
                <fieldset disabled={!mutable || busy} className="grid md:grid-cols-2 gap-4">
                  {select('requirementId', 'Existing requirement', data.requirements)}
                  {select('controlId', 'Map an implementation control', detail.controls)}
                  {save}
                </fieldset>
              </form>
            </div>
          )}

          {section === 'threat state' && (
            <form
              onSubmit={(event) => {
                const form = new FormData(event.currentTarget);
                void submit(event, `/api/threats/${form.get('threatId')}/transition`);
              }}
              className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm space-y-4"
            >
              <div className="space-y-1 pb-2 border-b border-semantic-jira-border/60">
                <h4 className="font-bold text-semantic-jira-primary text-xs uppercase tracking-wider">
                  Threat Lifecycle Transition
                </h4>
                <p className="text-xs text-semantic-jira-muted">
                  Server verifies transitions, independent assurance, verified evidence, residual risk, and existing risk exceptions.
                </p>
              </div>
              <fieldset disabled={!mutable || busy} className="grid md:grid-cols-2 gap-4">
                {select('threatId', 'Threat', detail.threats)}
                <label className="block text-xs font-semibold text-semantic-jira-muted">
                  Requested state
                  <select name="status" className={inputClass}>
                    {['OPEN', 'MITIGATING', 'MITIGATED', 'ACCEPTED', 'CLOSED'].map((state) => (
                      <option key={state}>{state}</option>
                    ))}
                  </select>
                </label>
                <div className="md:col-span-2">{field('reason', 'Transition rationale')}</div>
                {save}
              </fieldset>
            </form>
          )}

          {section === 'exceptions' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-semantic-jira-surface/70 border border-semantic-jira-border rounded-xl text-xs text-semantic-jira-muted flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-semantic-warning flex-shrink-0" />
                <span>
                  Critical: emergency only (7 days); High: 30 days; Medium: 90 days; Low: 180 days. Critical risk continues to block production releases.
                </span>
              </div>

              <form
                onSubmit={(event) => {
                  const form = new FormData(event.currentTarget);
                  void submit(event, `/api/threats/${form.get('threatId')}/risk-acceptance`, (f) => ({
                    ...Object.fromEntries(f),
                    emergency: f.has('emergency'),
                    renewalAssessment: f.get('renewalRationale')
                      ? {
                          rationale: f.get('renewalRationale'),
                          remediationStatus: f.get('remediationStatus'),
                          evidenceId: f.get('assessmentEvidenceId'),
                        }
                      : undefined,
                  }));
                }}
                className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="pb-2 border-b border-semantic-jira-border/60">
                  <h4 className="font-bold text-semantic-jira-primary text-xs uppercase tracking-wider">
                    Request Risk Acceptance Exception
                  </h4>
                </div>
                <fieldset disabled={!mutable || busy} className="grid md:grid-cols-2 gap-4">
                  {select('threatId', 'Threat', detail.threats)}
                  {field('reason', 'Reason remediation cannot happen now')}
                  {field('businessJustification', 'Business and technical impact')}
                  {field('compensatingControls', 'Compensating controls')}
                  {field('remediationOwnerId', 'Remediation owner ID')}
                  {field('remediationPlan', 'Remediation plan')}
                  {field('remediationDeadline', 'Remediation deadline', '', 'datetime-local')}
                  {field('expiresAt', 'Exception expiry', '', 'datetime-local')}
                  <div className="md:col-span-2">
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input type="checkbox" name="emergency" className="rounded border-semantic-jira-border" />
                      <span>Critical emergency exception</span>
                    </label>
                  </div>
                  <details className="md:col-span-2 bg-semantic-jira-surface/50 border border-semantic-jira-border rounded-xl p-3.5 space-y-3">
                    <summary className="font-semibold text-xs text-semantic-jira-primary cursor-pointer">
                      Renewal of a previously approved exception
                    </summary>
                    <p className="text-xs text-semantic-jira-muted">
                      New assessment and retained evidence are mandatory. Repeated High/Critical exceptions also require independent escalation before CISO approval.
                    </p>
                    {field('renewalRationale', 'Fresh residual-risk assessment rationale', '', 'text', false)}
                    {field('remediationStatus', 'Current remediation progress / remaining gaps', '', 'text', false)}
                    {select(
                      'assessmentEvidenceId',
                      'Current revision evidence',
                      (detail.evidence || []).filter((item) => item.revisionId === data.revision.id),
                      true
                    )}
                  </details>
                  {save}
                </fieldset>
              </form>

              <form
                onSubmit={(event) => {
                  const form = new FormData(event.currentTarget);
                  void submit(event, `${base}/exceptions/${form.get('exceptionId')}/escalation-review`);
                }}
                className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="pb-2 border-b border-semantic-jira-border/60">
                  <h4 className="font-bold text-semantic-jira-primary text-xs uppercase tracking-wider">
                    Independent Escalation Review
                  </h4>
                </div>
                <fieldset disabled={busy} className="grid md:grid-cols-2 gap-4">
                  {select(
                    'exceptionId',
                    'Repeated High/Critical exception escalation',
                    (detail.exceptions || []).filter(
                      (item) => item.escalationRequired && ['REQUESTED', 'UNDER_REVIEW'].includes(item.status)
                    )
                  )}
                  {field('reason', 'Independent escalation review rationale')}
                  {save}
                </fieldset>
              </form>

              <form
                onSubmit={(event) => {
                  const form = new FormData(event.currentTarget);
                  void submit(event, `/api/threat-model-exceptions/${form.get('exceptionId')}/decision`);
                }}
                className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="pb-2 border-b border-semantic-jira-border/60">
                  <h4 className="font-bold text-semantic-jira-primary text-xs uppercase tracking-wider">
                    Exception Decision
                  </h4>
                </div>
                <fieldset disabled={busy} className="grid md:grid-cols-2 gap-4">
                  {select('exceptionId', 'Exception decision', detail.exceptions || [])}
                  <label className="block text-xs font-semibold text-semantic-jira-muted">
                    Decision
                    <select name="decision" className={inputClass}>
                      <option>APPROVED</option>
                      <option>REJECTED</option>
                      <option>REVOKED</option>
                    </select>
                  </label>
                  {save}
                </fieldset>
              </form>
            </div>
          )}

          {section === 'compliance' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-semantic-jira-surface/70 border border-semantic-jira-border rounded-xl text-xs text-semantic-jira-muted">
                Catalog proposals require independent compliance-owner validation. A mapping is not proof of compliance.
              </div>

              <div className="space-y-3">
                {data.compliance.map((item: any) => (
                  <div
                    key={item.id}
                    className="border border-semantic-jira-border bg-semantic-panel p-4 rounded-xl shadow-xs space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-xs text-semantic-jira-primary">
                        {item.framework} {item.framework_version} · {item.code}
                      </span>
                      <span className="font-mono text-micro px-2 py-0.5 rounded bg-semantic-jira-surface border border-semantic-jira-border text-semantic-jira-muted">
                        {item.current_validation_status}
                      </span>
                    </div>
                    <div className="text-xs text-semantic-jira-muted">
                      {item.title} · {item.source_url}
                    </div>
                    {item.current_validation_status !== 'RETIRED' && (
                      <form
                        onSubmit={(event) =>
                          void submit(event, `/api/threat-compliance-requirements/${item.id}/decision`, (form) => ({
                            decision: item.current_validation_status === 'VALIDATED' ? 'RETIRED' : 'VALIDATED',
                            reason: form.get('reason'),
                          }))
                        }
                        className="pt-2 border-t border-semantic-jira-border/40"
                      >
                        <fieldset disabled={busy} className="flex flex-wrap gap-2 items-end">
                          <div className="flex-1 min-w-[200px]">
                            {field(
                              'reason',
                              item.current_validation_status === 'VALIDATED'
                                ? 'Retirement reason'
                                : 'Independent validation rationale'
                            )}
                          </div>
                          <button className="jira-btn-primary text-xs" disabled={busy}>
                            {item.current_validation_status === 'VALIDATED' ? 'Retire definition' : 'Validate definition'}
                          </button>
                        </fieldset>
                      </form>
                    )}
                  </div>
                ))}
              </div>

              <form
                onSubmit={(event) => void submit(event, '/api/threat-compliance-requirements')}
                className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="pb-2 border-b border-semantic-jira-border/60">
                  <h4 className="font-bold text-semantic-jira-primary text-xs uppercase tracking-wider">
                    Register Compliance Requirement
                  </h4>
                </div>
                <fieldset disabled={busy} className="grid md:grid-cols-2 gap-4">
                  {field('framework', 'Framework')}
                  {field('frameworkVersion', 'Version')}
                  {field('code', 'Requirement code')}
                  {field('title', 'Internal interpretation')}
                  {field('sourceUrl', 'Authoritative source URL', '', 'url')}
                  <label className="block text-xs font-semibold text-semantic-jira-muted">
                    Source kind
                    <select name="requirementKind" className={inputClass}>
                      <option>BANK_POLICY</option>
                      <option>REGULATORY_MINIMUM</option>
                      <option>APPLICATION_REQUIREMENT</option>
                    </select>
                  </label>
                  {save}
                </fieldset>
              </form>
            </div>
          )}

          {section === 'versions' && (
            <div className="space-y-4">
              <div className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="pb-2 border-b border-semantic-jira-border/60">
                  <h4 className="font-bold text-semantic-jira-primary text-xs uppercase tracking-wider">
                    Evidence Pack Export & Revisions
                  </h4>
                </div>
                <label className="block text-xs font-semibold text-semantic-jira-muted max-w-xs">
                  Evidence pack format
                  <select
                    className={inputClass}
                    value={exportFormat}
                    onChange={(event) => setExportFormat(event.target.value as 'json' | 'html')}
                  >
                    <option value="html">Readable HTML / browser print</option>
                    <option value="json">Canonical JSON evidence pack</option>
                  </select>
                </label>
                <form onSubmit={(event) => void submit(event, `${base}/revisions`)}>
                  <fieldset disabled={busy || revision?.status !== 'APPROVED'} className="space-y-3">
                    {field('changeReason', 'Reason for new revision')}
                    <button
                      type="submit"
                      className="jira-btn-primary text-xs"
                      disabled={busy || revision?.status !== 'APPROVED'}
                    >
                      Create Next Revision
                    </button>
                  </fieldset>
                </form>
              </div>

              {detail.revisions?.filter((item) => item.status === 'APPROVED').length ? (
                <div className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm space-y-3">
                  <div className="font-bold text-xs uppercase tracking-wider text-semantic-jira-muted">
                    Immutable Approved Evidence Packs
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {detail.revisions
                      ?.filter((item) => item.status === 'APPROVED')
                      .map((item) => (
                        <button
                          key={item.id}
                          className="jira-btn-subtle text-xs flex items-center gap-1.5"
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            setError('');
                            void fetchWithAuth(`${base}/revisions/${item.id}/export`)
                              .then(async (response) => {
                                const result = await response.json();
                                if (!response.ok || !result.success)
                                  throw new Error(result.error || 'Export failed.');
                                const url = URL.createObjectURL(
                                  new Blob(
                                    [
                                      exportFormat === 'html'
                                        ? renderThreatSnapshotReport(result.report)
                                        : JSON.stringify(result.report, null, 2),
                                    ],
                                    {
                                      type: exportFormat === 'html' ? 'text/html' : 'application/json',
                                    }
                                  )
                                );
                                const anchor = document.createElement('a');
                                anchor.href = url;
                                anchor.download = `${detail.model.key}-v${item.revisionNumber}-approved.${exportFormat}`;
                                anchor.click();
                                URL.revokeObjectURL(url);
                              })
                              .catch((cause) => setError(cause.message))
                              .finally(() => setBusy(false));
                          }}
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download immutable v{item.revisionNumber} evidence pack</span>
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}
