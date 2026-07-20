# KRI Biodata Schema — Essentials
**Version:** 2.0.0  
**Status:** Draft  
**Principle:** Every field must justify its existence. If a team member wouldn't realistically fill it in or act on it, it doesn't exist.

---

## Module 1 — Identity

| Field | SP Column Type | Required | Notes |
|---|---|---|---|
| `contact_id` | Single line | ✅ | System UUID |
| `full_name` | Single line | ✅ | Legal name |
| `preferred_name` | Single line | — | Goes-by name |
| `salutation` | Choice | — | Mr / Mrs / Ms / Dr / Prof / Engr / Barrister / Hon / Chief / Alhaji / Alhaja |
| `gender` | Choice | — | Male / Female / Prefer not to say |
| `date_of_birth` | Date | — | ISO 8601 |
| `profile_photo_url` | Hyperlink | — | SP document library reference |
| `record_status` | Choice | ✅ | Active / Inactive / Archived |
| `record_owner` | Person | ✅ | Primary relationship manager |

---

## Module 2 — Personal Origin

| Field | SP Column Type | Required | Notes |
|---|---|---|---|
| `nationality` | Single line | — | Primary nationality; ISO country code |
| `birth_country` | Single line | — | ISO country code |
| `birth_state` | Single line | — | State or region |
| `hometown` | Single line | — | Cultural/ancestral home |
| `ethnicity` | Single line | — | Self-declared; from canonical lookup |
| `religion` | Choice | — | Christianity / Islam / Traditional / Other / Prefer not to say |
| `languages_spoken` | Multi-line (JSON) | — | Array of language tags e.g. `["en", "yo", "ha"]` |

---

## Module 3 — Education

Each row in the array captures one institution. Two arrays: formal degrees + professional certifications.

**`education[]` — one object per institution:**
```json
{
  "institution": "string",
  "degree_level": "OND | HND | BSc | BA | BEng | LLB | MBBS | MSc | MBA | LLM | PhD | Other",
  "field_of_study": "string",
  "year_graduated": "YYYY",
  "degree_class": "First Class | 2:1 | 2:2 | Third | Pass | Distinction | Merit | N/A"
}
```

**`certifications[]` — one object per certification:**
```json
{
  "name": "string",
  "issuing_body": "string",
  "year": "YYYY",
  "is_active": "boolean"
}
```

Both stored as Multi-line (JSON) SP columns.

---

## Module 4 — Career

Current role is captured in the core CRM contact fields (`job_title`, `company`). This module adds work history and board positions only.

**`work_history[]` — ordered most-recent-first:**
```json
{
  "company_name": "string",
  "job_title": "string",
  "seniority_level": "C-Suite | VP/Director | Manager | Senior | Mid | Junior | Board | Advisor",
  "employment_type": "Full-time | Contract | Consulting | Board | Volunteer",
  "start_date": "YYYY-MM",
  "end_date": "YYYY-MM | null",
  "is_current": "boolean"
}
```

**`board_positions[]`:**
```json
{
  "organisation": "string",
  "role": "string",
  "is_active": "boolean"
}
```

Both stored as Multi-line (JSON) SP columns.

---

## Module 5 — Communication Preferences

| Field | SP Column Type | Required | Notes |
|---|---|---|---|
| `preferred_channels` | Multi-line (JSON) | — | Ordered array: `["WhatsApp", "Email", "Phone", "LinkedIn"]` |
| `preferred_contact_time` | Choice | — | Morning / Midday / Afternoon / Evening / Flexible |
| `preferred_meeting_format` | Choice | — | In-Person / Video / Phone / Flexible |
| `communication_formality` | Choice | — | Formal / Semi-Formal / Casual |
| `gatekeeper_name` | Single line | — | PA or Chief of Staff name |
| `gatekeeper_phone` | Single line | — | E.164 format |
| `comms_notes` | Multi-line | — | Free text; e.g. "Never call before 10am" |

---

## Module 6 — Profile Intelligence

Kept lean. Qualitative fields that a relationship manager can realistically fill in and use.

| Field | SP Column Type | Required | Notes |
|---|---|---|---|
| `personal_interests` | Multi-line (JSON) | — | Array of tags e.g. `["Golf", "Art", "Football"]` |
| `motivators` | Multi-line (JSON) | — | Array e.g. `["Legacy", "Wealth", "Social Impact", "Status"]` |
| `decision_making_style` | Choice | — | Consultative / Autonomous / Consensus / Data-first |
| `referral_source` | Single line | — | How this contact entered the pipeline |
| `known_associates` | Multi-line (JSON) | — | Array of `{contact_id, name, relationship_type}` |
| `sensitivity_flags` | Multi-line (JSON) | — | Array e.g. `["PEP", "High Profile", "Media Sensitive"]` |
| `account_notes` | Multi-line | — | Running strategic brief; free text |

---

## Module 7 — Consent & Audit

| Field | SP Column Type | Required | Notes |
|---|---|---|---|
| `consent_email` | Yes/No | ✅ | Marketing email opt-in |
| `consent_sms` | Yes/No | ✅ | SMS opt-in |
| `consent_date` | Date | — | ISO 8601 |
| `data_source` | Single line | — | Import / Manual / Event / Webform |
| `created_date` | Date | ✅ | System timestamp |
| `last_modified_date` | Date | ✅ | System timestamp |
| `record_owner` | Person | ✅ | Already in Module 1; enforced here for audit |
| `deletion_requested` | Yes/No | ✅ | NDPR right-to-erasure flag |

---

## Field Count Summary

| Module | Fields |
|---|---|
| Identity | 9 |
| Personal Origin | 7 |
| Education | 2 JSON columns |
| Career | 2 JSON columns |
| Communication | 7 |
| Profile Intelligence | 7 |
| Consent & Audit | 8 |
| **Total** | **~42** |

---

## Extension Contract

When a new field is genuinely needed later (e.g. biodata list columns):

1. Add it to the relevant module here first — one PR per field group.
2. New SP column only; never repurpose an existing one.
3. All new fields are optional until proven otherwise.
4. JSON arrays extend their object schema in this doc before any code changes.
