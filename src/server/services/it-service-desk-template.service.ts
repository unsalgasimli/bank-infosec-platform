import crypto from 'crypto';
import type {
  FormDefinition,
  FormFieldDefinition,
  FormVersion,
  RequestTypeDefinition,
  WorkflowCatalogTemplate,
  WorkflowDefinition,
  WorkflowVersion,
} from '../../shared/types/orchestration.js';
import type { BankRole } from '../../shared/types/auth.js';
import { db } from '../db/database.js';

const SYSTEM_OWNER_ID = 'platform-bank-infosec';
const INSTALLED_AT = '2026-08-24T00:00:00.000Z';
const BASIC_DEFINITION_ID = 'wf-it-helpdesk-basic-task';
const BASIC_FORM_ID = 'form-it-helpdesk-basic-task';
const BASIC_FORM_VERSION = 1;
const BASIC_WORKFLOW_VERSION = 1;

type ServiceDeskTask = { group: string; title: string; sourceId: string };

const tasks = (group: string, values: Array<[string, string]>): ServiceDeskTask[] =>
  values.map(([sourceId, title]) => ({ group, sourceId, title }));

/** Inventory captured from ServiceDesk Expressbank's IT catalogue. */
const SERVICE_DESK_TASKS: ServiceDeskTask[] = [
  ...tasks('IT · Texniki Dəstək', [
    ['01', 'Yerdəyişmə'], ['02', 'E-Matic'], ['03', 'Windows hesabı'], ['04', 'Printer / Scaner'],
    ['06', 'Kartricin dəyişdirilməsi ("Baş" ofis üçün)'], ['08', 'RMS'], ['09', 'İnternet'], ['10', 'E-Gov'],
    ['11', 'Elektron imza.'], ['13', 'Telefoniya'], ['14', 'VPN'], ['15', 'Wi-Fi'], ['16', 'Azericard Terminala qoşulmaq imkanı'],
    ['17', 'File Server'], ['18', 'Swift'], ['19', 'Fiziki avadanlıq'], ['20', 'Məzənnə tablosu'], ['21', 'Database'], ['22', 'Helpdesk categoriya'],
  ]),
  ...tasks('IT · T24', [
    ['01', 'RecordLock'], ['02', 'T24 istifadəçi (user) girişi problemi'], ['03', 'Kredit'], ['04', 'Depozit'], ['05', 'Hesablar, qalıq'],
    ['06', 'Sərəncam, Geriçağırma, Dublikat'], ['07', 'Məzuniyyət, Ezamiyyət, Əvəzetmə, Vəzifə, Etibarnamə'], ['08', 'Menyu dəyişikliyi, hüquqlar'],
    ['09', 'Kart'], ['10', 'Hesabdan çıxarış'], ['11', 'XOHKS, AZİPS, SWIFT'], ['12', 'T24-də pəncərə sazlamaları'], ['13', 'Zəif işləyir (İşləmir)'],
    ['14', 'Mühasibatlıq'], ['15', 'Hesabat report'], ['16', 'İnventory'], ['17', 'Digər'],
  ]),
  ...tasks('IT · ESD (SED)', [
    ['01', 'Mərhələnin geri qaytarılması'], ['02', 'Redaktə'], ['03', 'Bərkidilmiş sənədin dəyişilməsi'], ['05', 'ESD giriş izni'],
    ['06', 'Vəzifə dəyişikliyi'], ['07', 'Şablonun əlavə edilməsi, dəyişdirilməsi'], ['08', 'İşləmir (Zəif işləyir)'],
  ]),
  ...tasks('IT · Bank Program Təminatı', [
    ['01', 'Onlayn ödəniş sistemləri - Müştəri tapılmadı'], ['02', 'Onlayn ödəniş sistemləri - Mədaxil çətinliyi'], ['03', 'Məbləğ kartda əks olunmur'],
    ['04', 'Şəxsi kabinet'], ['05', 'SMS müştəriyə göndərilməyib'], ['06', 'DWH Hesabatları.'], ['07', 'DataProblems'], ['08', 'İB və EXP24'],
    ['09', 'Asan finans çətinlik'], ['10', 'Mkr çətinlik'], ['11', 'Məlumat mərkəzi proqramı'], ['12', 'Ani ödəniş'], ['13', 'Anbar akt'],
    ['14', 'İnventar proqramı'], ['15', 'Swift (email və çıxarış)'], ['16', 'Expresspay terminal'], ['17', 'Expresspay inkasasiya program'],
  ]),
  ...tasks('IT · Təcili pul köçürmə sistemləri', [
    ['01', 'Bütün TPK sistemlərin yazılması'], ['02', 'Contact'], ['03', 'Filialın dəyişdirilməsi'], ['04', 'HÖP'], ['05', 'Monex'],
    ['06', 'UPT'], ['07', 'Western Union'], ['08', 'Xezri'], ['09', 'Zolotaya korona'],
  ]),
  ...tasks('IT · RəqəmsalBanking', [['01', 'RəqəmsalBanking']]),
  ...tasks('IT · İnnovasiyalar və Proqramlaşdırma', [
    ['01', 'Yeni tətbiq / funksionallıq hazırlanması'],
    ['02', 'API və inteqrasiya sorğusu'],
    ['03', 'Daxili proqram təminatının təkmilləşdirilməsi'],
    ['04', 'Veb və mobil servis dəyişikliyi'],
    ['05', 'Məlumat bazası skripti / SQL icrası'],
    ['06', 'Avtomatlaşdırma və bot inteqrasiyası'],
    ['07', 'Proqram xətasının (Bug) aradan qaldırılması'],
  ]),
  ...tasks('IT · Şəbəkə İnzibatçılığı', [
    ['01', 'Şəbəkə bağlantısı problemi'],
    ['02', 'Firewall / Port açılması sorğusu'],
    ['03', 'VPN və uzaqdan giriş sazlanması'],
    ['04', 'Yeni IP təyini və VLAN ayrılması'],
    ['05', 'Wi-Fi bağlantısı və sazlama'],
    ['06', 'Switch / Router konfiqurasiyası'],
    ['07', 'Şəbəkə marşrutlaşdırma və monitorinq'],
  ]),
];

const checksum = (value: unknown) =>
  `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

const slugify = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const formFields = (): FormFieldDefinition[] => [
  { id: 'it-summary', key: 'summary', label: 'Nə lazımdır?', type: 'TEXT' as const, required: true, validation: { min: 3, max: 160 }, placeholder: 'Qısa və aydın başlıq yazın' },
  { id: 'it-description', key: 'description', label: 'Ətraflı məlumat', type: 'TEXTAREA' as const, required: true, validation: { min: 5, max: 4000 }, placeholder: 'Problemi və gözlənilən nəticəni sadə dildə izah edin' },
  { id: 'it-requester', key: 'requesterId', label: 'Müraciət edən', type: 'USER' as const, required: true },
  { id: 'it-department', key: 'departmentId', label: 'Şöbə / filial', type: 'DEPARTMENT' as const, required: true },
  { id: 'it-attachment', key: 'supportingEvidence', label: 'Əlavə fayl', type: 'ATTACHMENTS' as const, required: false, validation: { maxFileSizeMb: 25 } },
];

const addForm = (id: string, title: string, description: string, fields: FormFieldDefinition[] = formFields()) => {
  if (db.data.formDefinitionsV2.some((item) => item.id === id)) return;
  const definition: FormDefinition = { id, key: id, title, description, domain: 'ITSM', lifecycle: 'PUBLISHED', latestVersion: 1, ownerId: SYSTEM_OWNER_ID, maintainerIds: [], createdAt: INSTALLED_AT, updatedAt: INSTALLED_AT };
  const version: FormVersion = { id: `${id}-v1`, formDefinitionId: id, version: 1, status: 'PUBLISHED', sections: [{ id: `${id}-section`, title: 'Müraciət detalları', description, fields }], changeLog: 'ServiceDesk IT catalogue migration.', createdByUserId: SYSTEM_OWNER_ID, createdAt: INSTALLED_AT };
  db.data.formDefinitionsV2.push(definition);
  db.data.formVersions.push(version);
};

const addRequestType = (requestType: RequestTypeDefinition) => {
  const existing = db.data.requestTypesV2.find((item) => item.id === requestType.id);
  if (existing) {
    Object.assign(existing, requestType, { isActive: true });
  } else {
    db.data.requestTypesV2.push(requestType);
  }
};

const addCatalogTemplate = (template: WorkflowCatalogTemplate) => {
  const existing = db.data.workflowCatalogTemplates.find((item) => item.id === template.id);
  if (existing) {
    Object.assign(existing, template, { lifecycle: 'PUBLISHED' });
  } else {
    db.data.workflowCatalogTemplates.push(template);
  }
};

const taskWorkflow = (definitionId: string, formId: string, name: string, role: BankRole, description: string): WorkflowDefinition => ({
  id: definitionId, key: definitionId, name, description, domain: 'ITSM', defaultWorkType: 'TASK', lifecycle: 'PUBLISHED', scope: 'COMPANY', ownerId: SYSTEM_OWNER_ID, maintainerIds: [], latestVersion: 1, tags: ['it', 'helpdesk', 'service-desk'], iconName: 'LifeBuoy', createdAt: INSTALLED_AT, updatedAt: INSTALLED_AT,
});

const taskVersion = (definitionId: string, formId: string, role: BankRole, title: string): WorkflowVersion => {
  const payload: Omit<WorkflowVersion, 'checksum'> = {
    id: `${definitionId}-v1`, workflowDefinitionId: definitionId, version: 1, status: 'PUBLISHED',
    variables: [{ key: 'summary', type: 'STRING', required: true }, { key: 'description', type: 'STRING', required: true }, { key: 'requesterId', type: 'USER_REF', required: true }, { key: 'departmentId', type: 'RECORD_REF', required: true }],
    triggers: [{ id: `${definitionId}-manual`, type: 'MANUAL', enabled: true }],
    stages: [{ id: `${definitionId}-stage`, key: 'work', title: role === 'IT_ADMIN' ? 'Help Desk task' : 'InfoSec task', order: 1, trigger: 'IMMEDIATE', nodeIds: [`${definitionId}-start`, `${definitionId}-input`, `${definitionId}-task`, `${definitionId}-complete`] }],
    nodes: [
      { id: `${definitionId}-start`, key: 'start', type: 'START', title: 'Müraciət yaradıldı', position: { x: 80, y: 220 } },
      { id: `${definitionId}-input`, key: 'input', type: 'INPUT', title: 'Müraciət detalları', description: 'İstifadəçinin daxil etdiyi məlumatlar.', position: { x: 300, y: 220 }, inputConfig: { fields: formFields() } },
      { id: `${definitionId}-task`, key: 'task', type: 'TASK', title, description: role === 'IT_ADMIN' ? 'Help Desk növbəsi müraciəti qəbul edir, həll edir və nəticəni qeyd edir.' : 'InfoSec növbəsi müraciəti araşdırır və nəticəni qeyd edir.', instructions: 'Növbədən işi götürün, müraciəti icra edin, sübutu qeyd edin və tamamlayın.', acceptanceCriteria: ['İşin nəticəsi qeyd olunub', 'Müraciət edənə cavab verilib'], assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', role }, position: { x: 560, y: 220 }, timeoutMinutes: 1440 },
      { id: `${definitionId}-complete`, key: 'complete', type: 'SUCCESS_END', title: 'Müraciət tamamlandı', position: { x: 880, y: 220 } },
    ],
    edges: [{ id: `${definitionId}-e1`, sourceNodeId: `${definitionId}-start`, destinationNodeId: `${definitionId}-input`, dependencyType: 'FINISH_TO_START' }, { id: `${definitionId}-e2`, sourceNodeId: `${definitionId}-input`, destinationNodeId: `${definitionId}-task`, dependencyType: 'FINISH_TO_START' }, { id: `${definitionId}-e3`, sourceNodeId: `${definitionId}-task`, destinationNodeId: `${definitionId}-complete`, dependencyType: 'FINISH_TO_START' }],
    policySetId: 'policy-general-v1', policySetVersion: 1, formDefinitionId: formId, formVersion: 1, changeLog: 'ServiceDesk task routing template.', createdByUserId: SYSTEM_OWNER_ID, createdAt: INSTALLED_AT, publishedAt: INSTALLED_AT,
  };
  return { ...payload, checksum: checksum(payload) };
};

export class ItServiceDeskTemplateService {
  public static ensureInstalled(): boolean {
    let changed = false;
    db.data.formDefinitionsV2 ||= [];
    db.data.formVersions ||= [];
    db.data.workflowDefinitions ||= [];
    db.data.workflowVersions ||= [];
    db.data.requestTypesV2 ||= [];
    db.data.workflowCatalogTemplates ||= [];

    addForm(BASIC_FORM_ID, 'Help Desk task', 'Texniki terminlərə ehtiyac olmadan İT dəstək müraciəti yaradın.');
    const basicDefinition = taskWorkflow(BASIC_DEFINITION_ID, BASIC_FORM_ID, 'Help Desk Basic Task', 'IT_ADMIN', 'ServiceDesk-dən köçürülmüş basic IT müraciəti.');
    if (!db.data.workflowDefinitions.some((item) => item.id === BASIC_DEFINITION_ID)) { db.data.workflowDefinitions.push(basicDefinition); changed = true; }
    if (!db.data.workflowVersions.some((item) => item.workflowDefinitionId === BASIC_DEFINITION_ID && item.version === BASIC_WORKFLOW_VERSION)) { db.data.workflowVersions.push(taskVersion(BASIC_DEFINITION_ID, BASIC_FORM_ID, 'IT_ADMIN', 'Help Desk-də icra et')); changed = true; }

    for (const item of SERVICE_DESK_TASKS) {
      const slug = slugify(`${item.group}-${item.sourceId}-${item.title}`);
      const requestTypeId = `request-it-${slug}`;
      const templateId = `template-it-${slug}`;
      addRequestType({ id: requestTypeId, key: requestTypeId, name: item.title, description: `${item.group} üzrə Help Desk müraciəti.`, domain: 'ITSM', workType: 'TASK', category: 'IT_SUPPORT', iconName: 'LifeBuoy', formDefinitionId: BASIC_FORM_ID, formVersion: 1, workflowDefinitionId: BASIC_DEFINITION_ID, workflowVersion: 1, policySetId: 'policy-general-v1', supportedChannels: ['EMPLOYEE_PORTAL', 'AGENT', 'MANAGER', 'ADMIN', 'API'], visibility: 'INTERNAL', isActive: true, tags: ['it', 'helpdesk', 'basic-ticket', slugify(item.group)] });
      addCatalogTemplate({ id: templateId, workflowDefinitionId: BASIC_DEFINITION_ID, publishedWorkflowVersion: 1, title: item.title, purpose: 'Help Desk müraciəti — təsdiq tələb etmir.', domain: 'ITSM', category: 'IT', scope: 'COMPANY', ownerId: SYSTEM_OWNER_ID, maintainerIds: [], tags: ['it', 'helpdesk', 'basic-ticket', slugify(item.group)], iconName: 'LifeBuoy', estimatedDurationMinutes: 1440, stageCount: 1, departmentCount: 1, approvalCount: 0, automationCount: 0, runCount: 0, successRate: 0, favoriteUserIds: [], lifecycle: 'PUBLISHED', changeLog: `Imported from ServiceDesk ${item.group} (${item.sourceId}).`, kind: 'BASIC_TICKET', catalogGroup: item.group, requestTypeId });
      changed = true;
    }

    changed = this.ensureMailNotReceived() || changed;
    changed = this.ensureNetworkSoftwareInstallation() || changed;
    return changed;
  }

  private static ensureMailNotReceived(): boolean {
    const definitionId = 'wf-it-mail-not-received';
    const formId = 'form-it-mail-not-received';
    const requestTypeId = 'request-it-mail-not-received';
    const templateId = 'template-it-mail-not-received';
    addForm(formId, 'Mail gəlməyib', 'Elektron poçt müraciətləri birbaşa InfoSec növbəsinə yönləndirilir.');
    if (!db.data.workflowDefinitions.some((item) => item.id === definitionId)) db.data.workflowDefinitions.push(taskWorkflow(definitionId, formId, 'Mail gəlməyib', 'SECURITY_ANALYST', 'Mail gəlməyib müraciəti birbaşa InfoSec-ə gedir.'));
    if (!db.data.workflowVersions.some((item) => item.workflowDefinitionId === definitionId && item.version === 1)) db.data.workflowVersions.push(taskVersion(definitionId, formId, 'SECURITY_ANALYST', 'InfoSec mail araşdırması'));
    addRequestType({ id: requestTypeId, key: requestTypeId, name: 'Mail gəlməyib', description: 'Elektron poçt gəlmədikdə birbaşa InfoSec-ə göndərilən müraciət.', domain: 'INFORMATION_SECURITY', workType: 'TASK', category: 'IT_SUPPORT', iconName: 'MailWarning', formDefinitionId: formId, formVersion: 1, workflowDefinitionId: definitionId, workflowVersion: 1, policySetId: 'policy-general-v1', supportedChannels: ['EMPLOYEE_PORTAL', 'AGENT', 'MANAGER', 'ADMIN', 'API'], visibility: 'INTERNAL', isActive: true, tags: ['it', 'email', 'infosec', 'basic-ticket'] });
    addCatalogTemplate({ id: templateId, workflowDefinitionId: definitionId, publishedWorkflowVersion: 1, title: 'Mail gəlməyib', purpose: 'Müraciət birbaşa InfoSec növbəsinə gedir.', domain: 'INFORMATION_SECURITY', category: 'IT', scope: 'COMPANY', ownerId: SYSTEM_OWNER_ID, maintainerIds: [], tags: ['it', 'email', 'infosec', 'basic-ticket'], iconName: 'MailWarning', estimatedDurationMinutes: 480, stageCount: 1, departmentCount: 1, approvalCount: 0, automationCount: 0, runCount: 0, successRate: 0, favoriteUserIds: [], lifecycle: 'PUBLISHED', changeLog: 'ServiceDesk ESD email route.', kind: 'BASIC_TICKET', catalogGroup: 'IT · ESD (SED)', requestTypeId });
    return true;
  }

  private static ensureNetworkSoftwareInstallation(): boolean {
    const definitionId = 'wf-it-network-software-installation';
    const formId = 'form-it-network-software-installation';
    const requestTypeId = 'request-it-network-software-installation';
    const templateId = 'template-it-network-software-installation';
    const fields: FormFieldDefinition[] = [
      { id: 'software-name', key: 'softwareName', label: 'Proqram təminatının adı', type: 'TEXT' as const, required: true },
      { id: 'software-purpose', key: 'businessJustification', label: 'Nə üçün lazımdır?', type: 'TEXTAREA' as const, required: true, validation: { min: 10, max: 4000 } },
      { id: 'software-requester', key: 'requesterId', label: 'Müraciət edən', type: 'USER' as const, required: true },
      { id: 'software-department', key: 'departmentId', label: 'Şöbə / filial', type: 'DEPARTMENT' as const, required: true },
    ];
    addForm(formId, 'Şəbəkə proqram təminatının yüklənməsi', 'Proqram təminatının quraşdırılması üçün sadə, ardıcıl approval axını.', [{ id: 'software-summary', key: 'summary', label: 'Müraciət başlığı', type: 'TEXT', required: true, validation: { min: 3, max: 160 } }, ...fields]);
    if (!db.data.workflowDefinitions.some((item) => item.id === definitionId)) db.data.workflowDefinitions.push(taskWorkflow(definitionId, formId, 'Şəbəkə proqram təminatının yüklənməsi', 'IT_ADMIN', 'Manager → InfoSec → Help Desk approval axını.'));
    if (!db.data.workflowVersions.some((item) => item.workflowDefinitionId === definitionId && item.version === 1)) {
      const payload: Omit<WorkflowVersion, 'checksum'> = {
        id: `${definitionId}-v1`, workflowDefinitionId: definitionId, version: 1, status: 'PUBLISHED', variables: [{ key: 'summary', type: 'STRING', required: true }, { key: 'softwareName', type: 'STRING', required: true }, { key: 'businessJustification', type: 'STRING', required: true }, { key: 'requesterId', type: 'USER_REF', required: true }, { key: 'requesterIsDepartmentManager', type: 'BOOLEAN', required: true }], triggers: [{ id: `${definitionId}-manual`, type: 'MANUAL', enabled: true }],
        stages: [
          { id: `${definitionId}-submission`, key: 'submission', title: 'Müraciət', order: 1, trigger: 'IMMEDIATE', nodeIds: ['start', 'input', 'manager-check'] },
          { id: `${definitionId}-manager`, key: 'manager', title: 'Müdir təsdiqi', order: 2, trigger: 'AFTER_PREVIOUS', nodeIds: ['manager-approval'] },
          { id: `${definitionId}-infosec`, key: 'infosec', title: 'InfoSec təsdiqi', order: 3, trigger: 'AFTER_PREVIOUS', nodeIds: ['infosec-approval'] },
          { id: `${definitionId}-helpdesk`, key: 'helpdesk', title: 'Help Desk icrası', order: 4, trigger: 'AFTER_PREVIOUS', nodeIds: ['helpdesk-task', 'complete', 'rejected'] },
        ],
        nodes: [
          { id: 'start', key: 'start', type: 'START', title: 'Müraciət yaradıldı', position: { x: 80, y: 220 } },
          { id: 'input', key: 'input', type: 'INPUT', title: 'Proqram təminatı detalları', position: { x: 300, y: 220 }, inputConfig: { fields } },
          { id: 'manager-check', key: 'manager-check', type: 'CONDITION', title: 'Müraciət edən müdiridir?', position: { x: 540, y: 220 }, condition: { combinator: 'ALL', clauses: [{ left: { source: 'CONTEXT', path: 'requesterIsDepartmentManager' }, operator: 'EQUALS', right: { source: 'LITERAL', value: true } }] } },
          { id: 'manager-approval', key: 'manager-approval', type: 'APPROVAL', title: 'Müdir təsdiqi', position: { x: 790, y: 360 }, approval: { approverSource: 'REQUESTER_MANAGER', approvalMode: 'ANY_ONE', timeoutMinutes: 480, reminderMinutes: 120, commentsMandatoryOnReject: true, preventSelfApproval: true } },
          { id: 'infosec-approval', key: 'infosec-approval', type: 'APPROVAL', title: 'InfoSec təsdiqi', position: { x: 1040, y: 220 }, approval: { approverSource: 'ROLE', role: 'SECURITY_ANALYST', approvalMode: 'ANY_ONE', timeoutMinutes: 480, reminderMinutes: 120, commentsMandatoryOnReject: true, preventSelfApproval: true } },
          { id: 'helpdesk-task', key: 'helpdesk-task', type: 'TASK', title: 'Help Desk proqram quraşdırılması', description: 'Təsdiqlənmiş proqramı quraşdırın və sübutu qeyd edin.', instructions: 'Müdir və InfoSec təsdiqlərini yoxlayın, quraşdırmanı icra edin, nəticəni qeyd edin.', assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', role: 'IT_ADMIN' }, position: { x: 1290, y: 220 }, timeoutMinutes: 480 },
          { id: 'complete', key: 'complete', type: 'SUCCESS_END', title: 'Quraşdırma tamamlandı', position: { x: 1540, y: 180 } },
          { id: 'rejected', key: 'rejected', type: 'REJECTED_END', title: 'Müraciət rədd edildi', position: { x: 1290, y: 420 } },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', destinationNodeId: 'input' }, { id: 'e2', sourceNodeId: 'input', destinationNodeId: 'manager-check' },
          { id: 'e3', sourceNodeId: 'manager-check', destinationNodeId: 'infosec-approval', outcome: 'TRUE', branchLabel: 'Müdir özü — manager approval keçilir' },
          { id: 'e4', sourceNodeId: 'manager-check', destinationNodeId: 'manager-approval', outcome: 'FALSE', branchLabel: 'Müdir təsdiqi tələb olunur' },
          { id: 'e5', sourceNodeId: 'manager-approval', destinationNodeId: 'infosec-approval', outcome: 'APPROVED', branchLabel: 'Təsdiqləndi' }, { id: 'e6', sourceNodeId: 'manager-approval', destinationNodeId: 'rejected', outcome: 'REJECTED', branchLabel: 'Rədd edildi' },
          { id: 'e7', sourceNodeId: 'infosec-approval', destinationNodeId: 'helpdesk-task', outcome: 'APPROVED', branchLabel: 'Təsdiqləndi' }, { id: 'e8', sourceNodeId: 'infosec-approval', destinationNodeId: 'rejected', outcome: 'REJECTED', branchLabel: 'Rədd edildi' }, { id: 'e9', sourceNodeId: 'helpdesk-task', destinationNodeId: 'complete' },
        ], policySetId: 'policy-general-v1', policySetVersion: 1, formDefinitionId: formId, formVersion: 1, changeLog: 'Network software installation: manager → InfoSec → Help Desk.', createdByUserId: SYSTEM_OWNER_ID, createdAt: INSTALLED_AT, publishedAt: INSTALLED_AT,
      };
      db.data.workflowVersions.push({ ...payload, checksum: checksum(payload) });
    }
    addRequestType({ id: requestTypeId, key: requestTypeId, name: 'Şəbəkə proqram təminatının yüklənməsi', description: 'Müdir → InfoSec → Help Desk approval axını.', domain: 'ITSM', workType: 'SERVICE_REQUEST', category: 'IT_SUPPORT', iconName: 'DownloadCloud', formDefinitionId: formId, formVersion: 1, workflowDefinitionId: definitionId, workflowVersion: 1, policySetId: 'policy-general-v1', supportedChannels: ['EMPLOYEE_PORTAL', 'MANAGER', 'ADMIN', 'API'], visibility: 'INTERNAL', isActive: true, tags: ['it', 'software', 'approval', 'helpdesk'] });
    addCatalogTemplate({ id: templateId, workflowDefinitionId: definitionId, publishedWorkflowVersion: 1, title: 'Şəbəkə proqram təminatının yüklənməsi', purpose: 'Müdir → InfoSec → Help Desk.', domain: 'ITSM', category: 'IT', scope: 'COMPANY', ownerId: SYSTEM_OWNER_ID, maintainerIds: [], tags: ['it', 'software', 'approval', 'helpdesk'], iconName: 'DownloadCloud', estimatedDurationMinutes: 1440, stageCount: 4, departmentCount: 3, approvalCount: 2, automationCount: 0, runCount: 0, successRate: 0, favoriteUserIds: [], lifecycle: 'PUBLISHED', changeLog: 'ServiceDesk 05.Program təminatı route.', kind: 'WORKFLOW', catalogGroup: 'IT · Bank Program Təminatı', requestTypeId });
    return true;
  }
}

export const serviceDeskTaskCount = SERVICE_DESK_TASKS.length;
