import React, { useId, useState } from 'react';
import { useI18n } from '../../context/I18nContext.js';
import type { ThreatModelDetail } from './ThreatModelDetailPanel.js';

const componentTypeLabels: Record<string, string> = {
  PROCESS: 'Process', SERVICE: 'Service', API: 'API', DATABASE: 'Database', DATASTORE: 'Datastore', QUEUE: 'Queue',
  EXTERNAL_SYSTEM: 'External system', USER: 'User', ADMIN: 'Admin', THIRD_PARTY: 'Third party', NETWORK_ZONE: 'Network zone',
  CLOUD_SERVICE: 'Cloud service', DEVICE: 'Device', OTHER: 'Other', CLIENT: 'Client', MOBILE_APP: 'Mobile app', WEB_APP: 'Web app',
  MICROSERVICE: 'Microservice', API_GATEWAY: 'API gateway', CACHE: 'Cache', FILE_STORE: 'File store', OBJECT_STORAGE: 'Object storage',
  HSM_KMS: 'HSM / KMS', IDENTITY_PROVIDER: 'Identity provider',
};

/** Deterministic DFD projected from persisted components, zones, boundaries and flows. */
export function ThreatArchitectureDiagram({ detail, onSelect }: { detail: ThreatModelDetail; onSelect: (kind: 'component' | 'flow', id: string) => void }) {
  const { t } = useI18n();
  const marker = useId().replaceAll(':', ''); const [selected, setSelected] = useState('');
  const zones = [...new Set(detail.components.map((node) => String(node.securityZone || 'UNASSESSED')))].sort();
  const width = Math.max(720, zones.length * 310 + 40); const height = Math.max(260, ...zones.map((zone) => detail.components.filter((node) => (node.securityZone || 'UNASSESSED') === zone).length * 140 + 100));
  const positions = new Map<string, { x: number; y: number }>();
  for (const [column, zone] of zones.entries()) detail.components.filter((node) => (node.securityZone || 'UNASSESSED') === zone).sort((a, b) => a.id.localeCompare(b.id)).forEach((node, index) => positions.set(node.id, { x: column * 310 + 55, y: index * 140 + 80 }));
  const choose = (kind: 'component' | 'flow', id: string) => { setSelected(id); onSelect(kind, id); };
  const typeLabel = (value: string) => t(componentTypeLabels[value] ?? value);
  return <details open className="bg-semantic-jira-surface/50 border border-semantic-jira-border rounded-xl p-3.5"><summary className="font-semibold text-semantic-jira-primary cursor-pointer text-xs">{t('Data-flow diagram')}</summary>{!detail.components.length ? <p className="text-xs text-semantic-jira-muted mt-2">{t('Add a component to start the diagram.')}</p> : <div className="overflow-auto max-h-[650px] custom-scrollbar mt-2"><svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="group" aria-label="Threat model architecture data-flow diagram" className="text-semantic-jira-primary">
    <defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" fill="currentColor"/></marker></defs>
    {zones.map((zone, index) => <g key={zone}><rect x={index * 310 + 20} y={25} width={280} height={height - 40} rx={12} fill="none" stroke="currentColor" strokeOpacity=".35" strokeDasharray="6 5"/><text x={index * 310 + 35} y={50} fill="currentColor" fontSize="13">{zone}</text></g>)}
    {detail.dataFlows.map((flow, index) => { const a = positions.get(flow.sourceComponentId), b = positions.get(flow.destinationComponentId); if (!a || !b) return null; const x1 = a.x + 100, y1 = a.y + 78, x2 = b.x + 100, y2 = b.y; const offset = 45 + (index % 4) * 16; const path = flow.sourceComponentId === flow.destinationComponentId ? `M ${a.x + 200} ${a.y + 20} C ${a.x + 270} ${a.y - 40} ${a.x + 270} ${a.y + 110} ${a.x + 200} ${a.y + 60}` : `M ${x1} ${y1} C ${x1 + offset} ${y1 + offset} ${x2 + offset} ${y2 - offset} ${x2} ${y2}`; const boundary = detail.trustBoundaries.find((row) => row.id === flow.trustBoundaryId); return <g key={flow.id} tabIndex={0} role="button" aria-label={`Flow ${flow.name}; ${boundary?.name || 'no explicit boundary'}; encryption ${flow.encryptionInTransit === true ? 'enabled' : flow.encryptionInTransit === false ? 'absent' : 'unknown'}`} onClick={() => choose('flow', flow.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose('flow', flow.id); } }} style={{ cursor: 'pointer' }}>
      <path d={path} fill="none" stroke="transparent" strokeWidth="16"/><path d={path} fill="none" stroke="currentColor" strokeWidth={selected === flow.id ? 4 : 2} strokeDasharray={flow.crossesTrustBoundary ? '5 3' : undefined} markerEnd={`url(#${marker})`} markerStart={flow.direction === 'BIDIRECTIONAL' ? `url(#${marker})` : undefined}/><title>{flow.name} · {flow.protocol || t('Protocol unknown')} · {boundary?.name || t('No explicit boundary')} · {t(flow.dataClassification)}</title><text x={(x1 + x2) / 2 + 12} y={(y1 + y2) / 2 + (index % 3) * 13} fill="currentColor" fontSize="10">{String(flow.name).slice(0, 28)}</text>
    </g>; })}
    {detail.components.map((node) => { const p = positions.get(node.id)!; return <g key={node.id} tabIndex={0} role="button" aria-label={`Component ${node.name}, ${node.type}, ${node.securityZone}`} onClick={() => choose('component', node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose('component', node.id); } }} style={{ cursor: 'pointer' }}>
      <rect x={p.x} y={p.y} width={200} height={78} rx={node.type === 'DATABASE' ? 24 : 8} className="fill-semantic-panel" stroke="currentColor" strokeWidth={selected === node.id ? 3 : 1}/><text x={p.x + 10} y={p.y + 22} fill="currentColor" fontSize="12">{String(node.name).slice(0, 25)}</text><text x={p.x + 10} y={p.y + 42} fill="currentColor" fontSize="10">{typeLabel(node.type)}</text><text x={p.x + 10} y={p.y + 61} fill="currentColor" fontSize="10">{[node.exposure, node.environment].filter((value) => value && value !== 'UNKNOWN').map((value) => t(String(value).toLowerCase().replaceAll('_', ' '))).join(' · ') || t('Not assessed')}</text><title>{node.name} · {node.id}</title>
    </g>; })}
  </svg></div>}</details>;
}
