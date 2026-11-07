/**
 * GEMS mappers.
 *
 * Emit the PascalCase shapes the original SPFx components expect, so the ported
 * React tree is a faithful copy rather than a rewrite. Same convention as the
 * KAIROS mappers, and for the same reason: the UI code keeps working unchanged.
 */

export const GEMS_CATEGORIES = ['Crown Jewel', 'Pearl', 'Coral', 'Ruby'] as const;

/**
 * Points per category.
 *
 * Ruby and Crown Jewel are both 1 in the original, which looks like a typo but
 * is preserved deliberately: changing it would silently alter every score ever
 * reported to management.
 */
export const CATEGORY_POINTS: Record<string, number> = {
  'Crown Jewel': 1,
  Pearl: 5,
  Coral: 3,
  Ruby: 1,
};

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function bool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Monday of the week an interaction falls in — the reporting grain. */
function weekStartOf(date: Date): string {
  const monday = new Date(date);
  const day = monday.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  monday.setUTCDate(monday.getUTCDate() - offset);
  return monday.toISOString().slice(0, 10);
}

export function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function mapGemsInteraction(row: any) {
  if (!row) return null;
  const loggedAt = row.logged_at ? new Date(row.logged_at) : new Date();
  return {
    ID: text(row.id),
    Title: text(row.client_name),
    ClientID: text(row.client_id),
    ClientName: text(row.client_name),
    CompanyKey: text(row.company_key),
    CompanyName: text(row.company_name),
    Agency: text(row.agency),
    BusinessArm: text(row.business_arm),
    InteractionType: text(row.interaction_type),
    Category: text(row.category),
    FinalClassification: text(row.final_classification),
    InfluencePercent: number(row.influence_percent),
    Points: number(row.points),
    Notes: text(row.notes),
    Justification: text(row.justification),
    ReviewStatus: text(row.review_status) || 'Submitted',
    WeekStart: text(row.week_start) || weekStartOf(loggedAt),
    ReportingMonth: text(row.reporting_month) || monthOf(loggedAt),
    LoggedBy: text(row.logged_by),
    LoggedAt: loggedAt.toISOString(),
    TargetUser: text(row.target_user),
    TargetUserId: text(row.target_user_id),
    KRIClassification: text(row.kri_classification),
    ExecutiveInvolvementRequested: bool(row.executive_involvement_requested),
    ExecutiveMonthlyPointsAtLog: number(row.executive_monthly_points_at_log),
    FollowUpRequired: bool(row.follow_up_required),
    FollowUpDate: text(row.follow_up_date),
    ScheduledDate: row.scheduled_date ? new Date(row.scheduled_date).toISOString() : '',
  };
}

export function mapGemsCompliance(row: any) {
  if (!row) return null;
  const title = text(row.entity_name) || text(row.governing_body) || text(row.compliance_type);
  return {
    ID: text(row.id),
    Title: title,
    EntityType: text(row.entity_type),
    EntityId: text(row.entity_id),
    EntityName: text(row.entity_name) || title,
    ComplianceType: text(row.compliance_type),
    Status: text(row.status) || 'Active',
    IssueDate: text(row.issue_date),
    ExpiryDate: text(row.expiry_date),
    RenewalDate: text(row.renewal_date),
    GoverningBody: text(row.governing_body),
    ReferenceNumber: text(row.reference_number),
    Description: text(row.description),
    Notes: text(row.notes),
    AssignedTo: text(row.assigned_to),
    DocumentsJson: text(row.documents_json),
    LastCheckedDate: text(row.last_checked_date),
    AlertSent: bool(row.alert_sent),
  };
}

export function mapGemsAction(row: any) {
  if (!row) return null;
  const title = text(row.entity_name) || text(row.description) || text(row.action_type);
  return {
    ID: text(row.id),
    Title: title,
    EntityType: text(row.entity_type),
    EntityId: text(row.entity_id),
    EntityName: text(row.entity_name) || title,
    ActionType: text(row.action_type),
    Priority: text(row.priority) || 'Medium',
    Status: text(row.status) || 'Open',
    DueDate: text(row.due_date),
    CompletedDate: text(row.completed_date),
    AssignedTo: text(row.assigned_to),
    Description: text(row.description),
    Source: text(row.source),
    SourceId: text(row.source_id),
    Outcome: text(row.outcome),
    CreatedBy: text(row.created_by),
    CreatedAt: row.created_at ? new Date(row.created_at).toISOString() : '',
  };
}

export function mapGemsAudit(row: any) {
  if (!row) return null;
  return {
    ID: text(row.id),
    Title: text(row.entity_id),
    EntityType: text(row.entity_type),
    EntityId: text(row.entity_id),
    Action: text(row.action),
    FieldName: text(row.field_name),
    OldValue: text(row.old_value),
    NewValue: text(row.new_value),
    UserName: text(row.user_name),
    UserEmail: text(row.user_email),
    Timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : '',
    Source: text(row.source),
    Details: text(row.details),
  };
}
