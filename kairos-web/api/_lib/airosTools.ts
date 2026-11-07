import type { SessionUser } from './auth.js';
import { raw } from './db.js';
import { scopeSql, ownsSql, canSeeEverything, CLIENT_OWNERS } from './scope.js';

/**
 * AIROS tool executor.
 *
 * Every query is built with the SAME scope predicates used by the REST
 * routes, so the assistant can never become a way around them. The fields
 * returned here are the ones the tool declarations describe.
 */

const CLIENT_SELECT = `
  SELECT c.id, c.first_name, c.last_name, c.company_name, c.job_title, c.email, c.phone,
         c.gender, c.kri_stage, c.linkedin_url, c.instagram_handle, c.project_name, c.notes,
         c.birthday_date, c.date_registered, c.last_contact_date, c.photo_url,
         COALESCE(pu.display_name, '') AS owner_name
    FROM clients c
    LEFT JOIN users pu ON pu.id = c.primary_contact_id
`;

const like = (value: unknown): string => `%${String(value ?? '').toLowerCase()}%`;

export async function executeTool(
  name: string,
  args: Record<string, any>,
  user: SessionUser,
): Promise<any> {
  switch (name) {
    case 'search_contacts': {
      const params: any[] = [];
      const filters: string[] = [scopeSql(user, 'c', CLIENT_OWNERS, 1, params)];
      const push = (condition: (placeholder: string) => string, value: unknown) => {
        if (value === undefined || value === null || String(value).trim() === '') return;
        params.push(like(value));
        filters.push(condition(`$${params.length}`));
      };
      push((p) => `(lower(c.first_name || ' ' || c.last_name) LIKE ${p})`, args.name);
      push((p) => `lower(c.email) LIKE ${p}`, args.email);
      push((p) => `lower(c.company_name) LIKE ${p}`, args.company);
      push((p) => `lower(c.kri_stage) LIKE ${p}`, args.stage);
      push((p) => `lower(COALESCE(pu.display_name,'')) LIKE ${p}`, args.owner);

      const rows = await raw<any>(
        `${CLIENT_SELECT} WHERE ${filters.join(' AND ')} ORDER BY c.date_registered DESC NULLS LAST LIMIT 60`,
        params,
      );
      return {
        total_found: rows.length,
        contacts: rows.map((row) => ({
          name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
          company: row.company_name,
          job_title: row.job_title,
          email: row.email,
          phone: row.phone,
          gender: row.gender,
          stage: row.kri_stage,
          owner: row.owner_name,
          linkedin: row.linkedin_url,
          instagram: row.instagram_handle,
          project: row.project_name,
          birthday: row.birthday_date ? String(row.birthday_date).slice(0, 10) : '',
          last_contact: row.last_contact_date || '',
          notes: row.notes,
        })),
      };
    }

    case 'search_deals': {
      const params: any[] = [];
      const filters: string[] = [scopeSql(user, 'c', CLIENT_OWNERS, 1, params)];
      const push = (condition: (placeholder: string) => string, value: unknown) => {
        if (value === undefined || value === null || String(value).trim() === '') return;
        params.push(like(value));
        filters.push(condition(`$${params.length}`));
      };
      push((p) => `lower(e.title) LIKE ${p}`, args.title);
      push((p) => `lower(e.status) LIKE ${p}`, args.status);
      push((p) => `lower(e.status) LIKE ${p}`, args.stage);
      push((p) => `lower(COALESCE(ou.display_name, e.owned_by_label, '')) LIKE ${p}`, args.owner);
      push((p) => `(lower(c.first_name || ' ' || c.last_name) LIKE ${p} OR lower(COALESCE(c.company_name,'')) LIKE ${p})`, args.contact_name);

      const rows = await raw<any>(
        `SELECT e.id, e.title, e.status, e.estimated_value, e.actual_value, e.submitted_date,
                e.expected_close_date, e.closed_date, e.engagement_type, e.notes, e.created_at,
                c.id AS client_id, c.first_name, c.last_name, c.company_name,
                COALESCE(ou.display_name, e.owned_by_label, '') AS owner_name
           FROM engagements e
           JOIN clients c ON c.id = e.client_id
           LEFT JOIN users ou ON ou.id = e.owned_by_id
          WHERE ${filters.join(' AND ')}
          ORDER BY COALESCE(e.expected_close_date, e.created_at) DESC
          LIMIT 40`,
        params,
      );

      const ids = rows.map((row) => row.client_id);
      const commCounts = new Map<string, { count: number; latest: string; subject: string; type: string }>();
      if (ids.length) {
        const comms = await raw<any>(
          `SELECT client_id, subject, communication_type, communication_date,
                  count(*) OVER (PARTITION BY client_id) AS total
             FROM communications
            WHERE client_id = ANY($1::text[])
            ORDER BY communication_date DESC`,
          [ids],
        );
        for (const comm of comms) {
          if (commCounts.has(comm.client_id)) continue;
          commCounts.set(comm.client_id, {
            count: Number(comm.total || 0),
            latest: comm.communication_date || '',
            subject: comm.subject || '',
            type: comm.communication_type || '',
          });
        }
      }

      return {
        total_found: rows.length,
        deals: rows.map((row) => {
          const comm = commCounts.get(row.client_id);
          return {
            title: row.title,
            contact: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.company_name || '',
            stage: row.status,
            status: row.status,
            type: row.engagement_type,
            estimated_value: row.estimated_value,
            actual_value: row.actual_value,
            owner: row.owner_name,
            close_date: row.expected_close_date || row.closed_date || '',
            created_at: row.created_at,
            last_communication_at: comm?.latest || '',
            last_communication_type: comm?.type || '',
            last_communication_subject: comm?.subject || '',
            communication_count: comm?.count ?? 0,
            notes: row.notes,
          };
        }),
      };
    }

    case 'search_communications': {
      const params: any[] = [];
      const filters: string[] = [scopeSql(user, 'c', CLIENT_OWNERS, 1, params)];
      const push = (condition: (placeholder: string) => string, value: unknown) => {
        if (value === undefined || value === null || String(value).trim() === '') return;
        params.push(like(value));
        filters.push(condition(`$${params.length}`));
      };
      push((p) => `(lower(c.first_name || ' ' || c.last_name) LIKE ${p} OR lower(COALESCE(c.company_name,'')) LIKE ${p})`, args.contact_name);
      push((p) => `lower(cm.communication_type) LIKE ${p}`, args.type);
      push((p) => `lower(COALESCE(lu.display_name, cm.logged_by_label, '')) LIKE ${p}`, args.logged_by);

      const rows = await raw<any>(
        `SELECT cm.subject, cm.communication_type, cm.notes, cm.communication_date,
                cm.follow_up_required, cm.follow_up_date,
                COALESCE(lu.display_name, cm.logged_by_label, '') AS logged_by,
                c.first_name, c.last_name, c.company_name
           FROM communications cm
           JOIN clients c ON c.id = cm.client_id
           LEFT JOIN users lu ON lu.id = cm.logged_by_id
          WHERE ${filters.join(' AND ')}
          ORDER BY cm.communication_date DESC
          LIMIT 40`,
        params,
      );
      return {
        total_found: rows.length,
        communications: rows.map((row) => ({
          subject: row.subject,
          type: row.communication_type,
          contact: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.company_name || '',
          date: row.communication_date,
          logged_by: row.logged_by,
          notes: row.notes,
          follow_up_date: row.follow_up_date,
          follow_up_needed: row.follow_up_required,
        })),
      };
    }

    case 'get_team_members': {
      const rows = await raw<any>(
        `SELECT display_name, title, job_title, department, email
           FROM users WHERE is_active = TRUE
          ORDER BY lower(COALESCE(display_name, title, email)) ASC`,
      );
      return {
        total_members: rows.length,
        members: rows.map((row) => ({
          name: row.display_name || row.title,
          job_title: row.job_title,
          department: row.department,
          email: row.email,
        })),
      };
    }

    case 'get_workspace_stats': {
      const params: any[] = [];
      const predicate = scopeSql(user, 'c', CLIENT_OWNERS, 1, params);
      const [stageRows, dealRows, valueRows] = await Promise.all([
        raw<any>(`SELECT c.kri_stage, count(*)::int AS total FROM clients c WHERE ${predicate} GROUP BY c.kri_stage`, params),
        raw<any>(
          `SELECT e.status, count(*)::int AS total FROM engagements e
             JOIN clients c ON c.id = e.client_id
            WHERE ${predicate} GROUP BY e.status`,
          params,
        ),
        raw<any>(
          `SELECT
              COALESCE(SUM(CASE WHEN e.status NOT IN ('Won','Lost') THEN e.estimated_value ELSE 0 END),0) AS pipeline,
              COALESCE(SUM(CASE WHEN e.status = 'Won' THEN COALESCE(e.actual_value, e.estimated_value, 0) ELSE 0 END),0) AS won
             FROM engagements e JOIN clients c ON c.id = e.client_id WHERE ${predicate}`,
          params,
        ),
      ]);

      const byStage = (stage: string) => stageRows.find((row) => row.kri_stage === stage)?.total ?? 0;
      const byStatus = (status: string) => dealRows.find((row) => row.status === status)?.total ?? 0;
      const active = dealRows.filter((row) => !['Won', 'Lost'].includes(String(row.status))).reduce((sum, row) => sum + Number(row.total || 0), 0);

      return {
        contacts: {
          total: stageRows.reduce((sum, row) => sum + Number(row.total || 0), 0),
          knowledge: byStage('Knowledge'),
          rapport: byStage('Rapport'),
          intimacy: byStage('Intimacy'),
        },
        deals: {
          active,
          won: byStatus('Won'),
          total: dealRows.reduce((sum, row) => sum + Number(row.total || 0), 0),
        },
        pipeline_value: Number(valueRows[0]?.pipeline || 0),
        won_value: Number(valueRows[0]?.won || 0),
        scope: canSeeEverything(user) ? 'organisation' : 'personal',
      };
    }

    case 'search_stage_history': {
      const params: any[] = [];
      const filters: string[] = [scopeSql(user, 'c', CLIENT_OWNERS, 1, params)];
      const push = (condition: (placeholder: string) => string, value: unknown) => {
        if (value === undefined || value === null || String(value).trim() === '') return;
        params.push(like(value));
        filters.push(condition(`$${params.length}`));
      };
      push((p) => `(lower(c.first_name || ' ' || c.last_name) LIKE ${p})`, args.contact_name);
      push((p) => `lower(sh.previous_stage) LIKE ${p}`, args.from_stage);
      push((p) => `lower(sh.new_stage) LIKE ${p}`, args.to_stage);
      push((p) => `lower(COALESCE(cu.display_name, sh.changed_by_label, '')) LIKE ${p}`, args.changed_by);

      const rows = await raw<any>(
        `SELECT sh.previous_stage, sh.new_stage, sh.changed_date, sh.notes,
                COALESCE(cu.display_name, sh.changed_by_label, '') AS changed_by,
                c.first_name, c.last_name
           FROM stage_history sh
           JOIN clients c ON c.id = sh.client_id
           LEFT JOIN users cu ON cu.id = sh.changed_by_id
          WHERE ${filters.join(' AND ')}
          ORDER BY sh.changed_date DESC
          LIMIT 50`,
        params,
      );
      return {
        total_found: rows.length,
        stage_changes: rows.map((row) => ({
          contact: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
          from_stage: row.previous_stage,
          to_stage: row.new_stage,
          changed_by: row.changed_by,
          changed_at: row.changed_date,
          notes: row.notes,
        })),
      };
    }

    case 'search_automations': {
      const params: any[] = [];
      const filters: string[] = [scopeSql(user, 'c', CLIENT_OWNERS, 1, params)];
      const push = (condition: (placeholder: string) => string, value: unknown) => {
        if (value === undefined || value === null || String(value).trim() === '') return;
        params.push(like(value));
        filters.push(condition(`$${params.length}`));
      };
      push((p) => `lower(a.automation_type) LIKE ${p}`, args.type);
      push((p) => `lower(case when a.is_enabled then 'active' else 'inactive' end) LIKE ${p}`, args.status);
      push((p) => `lower(COALESCE(au.display_name, '')) LIKE ${p}`, args.owner);

      const rows = await raw<any>(
        `SELECT a.title, a.automation_type, a.is_enabled, a.is_recurring, a.trigger_date,
                a.last_sent_date, a.message_template,
                COALESCE(au.display_name, '') AS assigned_to,
                c.first_name, c.last_name
           FROM automations a
           JOIN clients c ON c.id = a.client_id
           LEFT JOIN users au ON au.id = a.assigned_to_id
          WHERE ${filters.join(' AND ')}
          ORDER BY a.trigger_date NULLS LAST
          LIMIT 40`,
        params,
      );
      return {
        total_found: rows.length,
        automations: rows.map((row) => ({
          title: row.title,
          contact: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
          type: row.automation_type,
          status: row.is_enabled ? 'Active' : 'Inactive',
          recurring: row.is_recurring,
          trigger: row.trigger_date,
          last_sent: row.last_sent_date,
          assigned_to: row.assigned_to,
          message: row.message_template,
        })),
      };
    }

    case 'search_companies': {
      // Companies are only surfaced when the caller actually holds contacts
      // within them, so the assistant cannot reveal the whole directory.
      const params: any[] = [];
      const filters: string[] = [scopeSql(user, 'c', CLIENT_OWNERS, 1, params)];
      if (String(args.name ?? '').trim()) {
        params.push(like(args.name));
        filters.push(`lower(COALESCE(c.company_name,'')) LIKE $${params.length}`);
      }
      const rows = await raw<any>(
        `SELECT c.company_name, count(*)::int AS contacts,
                count(*) FILTER (WHERE c.kri_stage = 'Knowledge')::int AS knowledge,
                count(*) FILTER (WHERE c.kri_stage = 'Rapport')::int AS rapport,
                count(*) FILTER (WHERE c.kri_stage = 'Intimacy')::int AS intimacy,
                max(c.last_contact_date) AS latest_activity
           FROM clients c
          WHERE ${filters.join(' AND ')} AND COALESCE(c.company_name,'') <> ''
          GROUP BY c.company_name
          ORDER BY contacts DESC
          LIMIT 60`,
        params,
      );
      return {
        total_found: rows.length,
        companies: rows.map((row) => ({
          name: row.company_name,
          contacts: row.contacts,
          knowledge: row.knowledge,
          rapport: row.rapport,
          intimacy: row.intimacy,
          latest_activity: row.latest_activity,
        })),
      };
    }

    case 'search_biodata': {
      const params: any[] = [];
      const filters: string[] = [scopeSql(user, 'c', CLIENT_OWNERS, 1, params)];
      if (String(args.contact_name ?? '').trim()) {
        params.push(like(args.contact_name));
        filters.push(`(lower(c.first_name || ' ' || c.last_name) LIKE $${params.length} OR lower(COALESCE(b.full_name,'')) LIKE $${params.length})`);
      }
      const rows = await raw<any>(
        `SELECT b.*, c.first_name, c.last_name
           FROM biodata b
           JOIN clients c ON c.id = b.contact_id
          WHERE ${filters.join(' AND ')}
          ORDER BY b.last_modified_date DESC
          LIMIT 20`,
        params,
      );
      return {
        total_found: rows.length,
        biodata: rows.map((row) => ({
          contact: row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
          salutation: row.salutation,
          gender: row.gender,
          date_of_birth: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : '',
          nationality: row.nationality,
          birth_country: row.birth_country,
          birth_state: row.birth_state,
          hometown: row.hometown,
          ethnicity: row.ethnicity,
          religion: row.religion,
          languages: row.languages_spoken,
          education: row.education,
          certifications: row.certifications,
          work_history: row.work_history,
          board_positions: row.board_positions,
          preferred_channels: row.preferred_channels,
          preferred_contact_time: row.preferred_contact_time,
          preferred_meeting_format: row.preferred_meeting_format,
          communication_formality: row.communication_formality,
          gatekeeper_name: row.gatekeeper_name,
          gatekeeper_phone: row.gatekeeper_phone,
          comms_notes: row.comms_notes,
          personal_interests: row.personal_interests,
          motivators: row.motivators,
          decision_making_style: row.decision_making_style,
          referral_source: row.referral_source,
          known_associates: row.known_associates,
          sensitivity_flags: row.sensitivity_flags,
          account_notes: row.account_notes,
          consent_email: row.consent_email,
          consent_sms: row.consent_sms,
          data_source: row.data_source,
        })),
      };
    }

    case 'search_company_acumen': {
      const params: any[] = [user.id, user.email];
      const filters: string[] = [`lower(COALESCE(ca.company_name,'')) <> ''`];
      if (String(args.company_name ?? '').trim()) {
        params.push(like(args.company_name));
        filters.push(`lower(ca.company_name) LIKE $${params.length}`);
      }
      // Only documents for companies the caller holds a contact in.
      filters.push(`EXISTS (
        SELECT 1 FROM clients c
         WHERE lower(c.company_name) = lower(ca.company_name)
           AND (${scopeSql(user, 'c', CLIENT_OWNERS, 3, params)})
      )`);

      const rows = await raw<any>(
        `SELECT ca.company_name, ca.file_name, ca.file_url, ca.content_type, ca.uploaded_at,
                COALESCE(uu.display_name, ca.uploaded_by_label, '') AS uploaded_by
           FROM company_acumen ca
           LEFT JOIN users uu ON uu.id = ca.uploaded_by_id
          WHERE ${filters.join(' AND ')}
          ORDER BY ca.uploaded_at DESC
          LIMIT 40`,
        params,
      );
      return {
        total_found: rows.length,
        acumen_docs: rows.map((row) => ({
          company: row.company_name,
          file_name: row.file_name,
          document_url: row.file_url,
          uploaded_by: row.uploaded_by,
          uploaded_at: row.uploaded_at,
        })),
      };
    }

    case 'get_lookup_data': {
      const list = String(args.list ?? '').toLowerCase();
      if (list === 'projects') {
        const rows = await raw<any>('SELECT project_name FROM projects WHERE status = $1 ORDER BY lower(project_name)', ['Active']);
        return { projects: rows.map((row) => row.project_name) };
      }
      if (list === 'job_titles') {
        const rows = await raw<any>('SELECT job_title_name FROM job_titles WHERE status = $1 ORDER BY lower(job_title_name)', ['Active']);
        return { job_titles: rows.map((row) => row.job_title_name) };
      }
      return { error: 'Unknown lookup list. Use "projects" or "job_titles".' };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export { ownsSql, canSeeEverything };
