import { Ticket } from '../../shared/types/ticket.js';
import { BankUser } from '../../shared/types/auth.js';
import { AuthService } from './auth.service.js';

export class SearchService {
  /**
   * Advanced JQL and multi-parameter search evaluator.
   * Supports clauses like:
   * - project = APPSEC
   * - severity IN (CRITICAL, HIGH)
   * - status != CLOSED
   * - assignee = currentUser()
   * - text ~ "injection"
   */
  public static query(tickets: Ticket[], jqlQuery: string, user: BankUser): Ticket[] {
    // 1. First apply strict ABAC filtering
    const authorizedTickets = AuthService.filterAuthorizedTickets(tickets, user);

    if (!jqlQuery || jqlQuery.trim() === '') {
      return authorizedTickets;
    }

    const query = jqlQuery.trim();

    // Fast text search if no JQL operators
    if (!/[=~<>]|\b(?:IN|NOT|AND|OR)\b/i.test(query)) {
      const lower = query.toLowerCase();
      return authorizedTickets.filter((t) => {
        return (
          t.key.toLowerCase().includes(lower) ||
          t.title.toLowerCase().includes(lower) ||
          t.description.toLowerCase().includes(lower) ||
          t.tags.some((tag) => tag.toLowerCase().includes(lower)) ||
          t.findingDetails?.cveId?.toLowerCase().includes(lower) ||
          t.findingDetails?.cweId?.toLowerCase().includes(lower)
        );
      });
    }

    return authorizedTickets.filter((ticket) => {
      return query.split(/\s+OR\s+/i).some((group) =>
        group.split(/\s+AND\s+/i).every((clause) => SearchService.evaluateClause(ticket, clause.trim(), user))
      );
    });
  }

  private static evaluateClause(ticket: Ticket, clause: string, user: BankUser): boolean {
    const containsMatch = clause.match(/^(\w+)\s*~\s*(.+)$/i);
    if (containsMatch) {
      const field = containsMatch[1].toLowerCase();
      const expected = containsMatch[2].trim().replace(/^['"]|['"]$/g, '').toLowerCase();
      if (field === 'text') {
        return [ticket.key, ticket.title, ticket.description, ...ticket.tags].some((value) => value.toLowerCase().includes(expected));
      }
      return String(SearchService.getFieldValue(ticket, field, user) || '').toLowerCase().includes(expected);
    }

    // Check IN operator: field IN (val1, val2, ...)
    const inMatch = clause.match(/^(\w+)\s+IN\s+\(([^)]+)\)$/i);
    if (inMatch) {
      const field = inMatch[1].toLowerCase();
      const values = inMatch[2].split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, '').toLowerCase());
      const ticketVal = SearchService.getFieldValue(ticket, field, user)?.toLowerCase();
      return ticketVal ? values.includes(ticketVal) : false;
    }

    // Check NOT IN operator: field NOT IN (val1, val2, ...)
    const notInMatch = clause.match(/^(\w+)\s+NOT\s+IN\s+\(([^)]+)\)$/i);
    if (notInMatch) {
      const field = notInMatch[1].toLowerCase();
      const values = notInMatch[2].split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, '').toLowerCase());
      const ticketVal = SearchService.getFieldValue(ticket, field, user)?.toLowerCase();
      return ticketVal ? !values.includes(ticketVal) : true;
    }

    // Check != operator: field != value
    const neqMatch = clause.match(/^(\w+)\s*!=\s*(.+)$/i);
    if (neqMatch) {
      const field = neqMatch[1].toLowerCase();
      const value = neqMatch[2].trim().replace(/^['"]|['"]$/g, '');
      const resolvedTarget = value === 'currentUser()' ? user.id : value.toLowerCase();
      const ticketVal = SearchService.getFieldValue(ticket, field, user)?.toLowerCase();
      return ticketVal !== resolvedTarget;
    }

    const comparisonMatch = clause.match(/^(\w+)\s*(>=|<=|>|<)\s*(.+)$/i);
    if (comparisonMatch) {
      const actual = SearchService.getFieldValue(ticket, comparisonMatch[1].toLowerCase(), user);
      const expectedRaw = comparisonMatch[3].trim().replace(/^['"]|['"]$/g, '');
      if (actual === undefined) return false;
      const actualDate = Date.parse(actual);
      const expectedDate = Date.parse(expectedRaw);
      const [left, right] = Number.isNaN(actualDate) || Number.isNaN(expectedDate)
        ? [Number(actual), Number(expectedRaw)]
        : [actualDate, expectedDate];
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      if (comparisonMatch[2] === '>=') return left >= right;
      if (comparisonMatch[2] === '<=') return left <= right;
      if (comparisonMatch[2] === '>') return left > right;
      return left < right;
    }

    // Check = operator: field = value
    const eqMatch = clause.match(/^(\w+)\s*=\s*(.+)$/i);
    if (eqMatch) {
      const field = eqMatch[1].toLowerCase();
      const value = eqMatch[2].trim().replace(/^['"]|['"]$/g, '');
      const resolvedTarget = value === 'currentUser()' ? user.id : value.toLowerCase();
      const ticketVal = SearchService.getFieldValue(ticket, field, user)?.toLowerCase();
      return ticketVal === resolvedTarget;
    }

    // Fallback text match
    const lowerClause = clause.toLowerCase();
    return (
      ticket.key.toLowerCase().includes(lowerClause) ||
      ticket.title.toLowerCase().includes(lowerClause) ||
      ticket.description.toLowerCase().includes(lowerClause)
    );
  }

  private static getFieldValue(ticket: Ticket, field: string, user: BankUser): string | undefined {
    switch (field) {
      case 'project':
      case 'projectcode':
        return ticket.projectCode;
      case 'key':
        return ticket.key;
      case 'severity':
      case 'technicalseverity':
        return ticket.technicalSeverity;
      case 'priority':
      case 'businesspriority':
        return ticket.businessPriority;
      case 'status':
      case 'statusid':
        return ticket.statusId;
      case 'statuscategory':
        return ticket.statusCategory;
      case 'category':
        return ticket.category;
      case 'domain':
      case 'securitydomain':
        return ticket.securityDomain;
      case 'assignee':
      case 'assigneeid':
        return ticket.assigneeId;
      case 'reporter':
      case 'reporterid':
        return ticket.reporterId;
      case 'team':
      case 'teamid':
        return ticket.teamId;
      case 'app':
      case 'application':
      case 'applicationid':
        return ticket.applicationId;
      case 'asset':
      case 'assetid':
        return ticket.assetId;
      case 'slastate':
        return ticket.slaState;
      case 'created':
      case 'createdat':
        return ticket.createdAt;
      case 'updated':
      case 'updatedat':
        return ticket.updatedAt;
      case 'due':
      case 'duedate':
        return ticket.dueDate;
      case 'resolution':
      case 'resolutioncode':
        return ticket.resolutionCode;
      case 'requester':
      case 'requesterid':
        return ticket.requesterId || ticket.reporterId;
      case 'cve':
        return ticket.findingDetails?.cveId;
      case 'cwe':
        return ticket.findingDetails?.cweId;
      default:
        const value = (ticket as any)[field];
        return value === undefined || value === null ? undefined : String(value);
    }
  }
}
