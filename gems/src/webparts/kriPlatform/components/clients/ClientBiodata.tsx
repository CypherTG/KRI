import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  Autocomplete,
} from '@mui/material';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import {
  getClientBiodataRecord,
  saveClientBiodataRecord,
  BiodataRecord,
  getCompanyLookupOptions,
  getJobTitleLookupOptions,
} from '../../services/sharepointProvisioning';
import { updateClient } from '../../services/graphApi';
import { IClient } from '../../services/graphApi';
import {
  COUNTRY_OPTIONS,
  ETHNICITY_OPTIONS,
  getCitiesForCountry,
  getCitiesForState,
  getStatesForCountry,
  LANGUAGE_OPTIONS,
  RELIGION_OPTIONS,
  StateOption,
  CityOption,
  CountryOption,
} from '../../utils/biodataLookups';

interface Props {
  context: WebPartContext;
  client: IClient;
  onSaved?: () => void;
}

const SALUTATIONS = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Engr', 'Barrister', 'Hon', 'Chief', 'Alhaji', 'Alhaja'];
const GENDERS = ['Male', 'Female', 'Prefer not to say'];
const RECORD_STATUSES = ['Active', 'Inactive', 'Archived'];
const CONTACT_TIMES = ['Morning', 'Midday', 'Afternoon', 'Evening', 'Flexible'];
const MEETING_FORMATS = ['In-Person', 'Video', 'Phone', 'Flexible'];
const FORMALITY = ['Formal', 'Semi-Formal', 'Casual'];
const DECISION_STYLES = ['Consultative', 'Autonomous', 'Consensus', 'Data-first'];

const EMPTY: BiodataRecord = {
  ID: '',
  Title: '',
  contact_id: '',
  full_name: '',
  preferred_name: '',
  salutation: '',
  gender: '',
  date_of_birth: '',
  profile_photo_url: '',
  record_status: 'Active',
  record_owner: null as any,
  nationality: '',
  birth_country: '',
  birth_state: '',
  hometown: '',
  ethnicity: '',
  religion: '',
  languages_spoken: '',
  education: '',
  certifications: '',
  work_history: '',
  board_positions: '',
  preferred_channels: '',
  preferred_contact_time: '',
  preferred_meeting_format: '',
  communication_formality: '',
  gatekeeper_name: '',
  gatekeeper_phone: '',
  comms_notes: '',
  personal_interests: '',
  motivators: '',
  decision_making_style: '',
  referral_source: '',
  known_associates: '',
  sensitivity_flags: '',
  account_notes: '',
  consent_email: false,
  consent_sms: false,
  consent_date: '',
  data_source: 'Manual',
  created_date: '',
  last_modified_date: '',
  deletion_requested: false,
};

function normalizeText(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function readListValues(raw: string): string[] {
  const text = normalizeText(raw);
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((entry) => normalizeText(entry)).filter(Boolean);
    } catch {
      // fall through
    }
  }
  return text.split(',').map((entry) => normalizeText(entry)).filter(Boolean);
}

function writeListValues(values: string[]): string {
  return JSON.stringify(Array.from(new Set(values.map((entry) => normalizeText(entry)).filter(Boolean))));
}

function findCountryOption(value: string): CountryOption | null {
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  return COUNTRY_OPTIONS.find((option) => option.label.toLowerCase() === text || option.code.toLowerCase() === text) || null;
}

function findStateOption(value: string, countryCode: string): StateOption | null {
  const text = normalizeText(value).toLowerCase();
  if (!text || !countryCode) return null;
  return getStatesForCountry(countryCode).find((option) => option.label.toLowerCase() === text || option.code.toLowerCase() === text) || null;
}

function findCityOption(value: string, countryCode: string, stateCode: string): CityOption | null {
  const text = normalizeText(value).toLowerCase();
  if (!text || !countryCode) return null;
  const fromState = stateCode ? getCitiesForState(countryCode, stateCode) : [];
  const fromCountry = fromState.length > 0 ? fromState : getCitiesForCountry(countryCode);
  return fromCountry.find((option) => option.label.toLowerCase() === text || option.code.toLowerCase() === text) || null;
}

function SingleLookupField<T>({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: T[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [draftValue, setDraftValue] = useState(value || '');

  useEffect(() => {
    setDraftValue(value || '');
  }, [value]);

  return (
    <Autocomplete
      freeSolo
      options={options}
      value={value || null}
      inputValue={draftValue}
      onChange={(_, newValue) => {
        let next = '';
        if (typeof newValue === 'string') next = normalizeText(newValue);
        else if (newValue && typeof newValue === 'object' && 'label' in newValue) next = normalizeText((newValue as any).label);
        setDraftValue(next);
        onChange(next);
      }}
      onInputChange={(_, newInputValue, reason) => {
        if (reason === 'input' || reason === 'clear' || reason === 'reset') {
          setDraftValue(newInputValue);
        }
      }}
      onBlur={() => {
        const next = normalizeText(draftValue);
        if (next !== value) {
          onChange(next);
        }
      }}
      getOptionLabel={(option) => {
        if (typeof option === 'string') return option;
        return normalizeText((option as any).label || '');
      }}
      renderInput={(params) => <TextField {...params} label={label} size="small" fullWidth placeholder={placeholder} />}
    />
  );
}

function MultiLookupField<T>({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  options: T[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const [draftValue, setDraftValue] = useState('');

  useEffect(() => {
    setDraftValue('');
  }, [value]);

  return (
    <Autocomplete
      multiple
      freeSolo
      options={options}
      value={value}
      inputValue={draftValue}
      onChange={(_, newValue) => {
        const next = (newValue as Array<string | any>).map((entry) => {
          if (typeof entry === 'string') return normalizeText(entry);
          if (entry && typeof entry === 'object' && 'label' in entry) return normalizeText((entry as any).label);
          return '';
        }).filter(Boolean);
        setDraftValue('');
        onChange(Array.from(new Set(next)));
      }}
      onInputChange={(_, newInputValue, reason) => {
        if (reason === 'input' || reason === 'clear' || reason === 'reset') {
          setDraftValue(newInputValue);
        }
      }}
      onBlur={() => {
        const nextEntry = normalizeText(draftValue);
        if (!nextEntry) return;
        const next = Array.from(new Set([...value, nextEntry].map((entry) => normalizeText(entry)).filter(Boolean)));
        const current = Array.from(new Set(value.map((entry) => normalizeText(entry)).filter(Boolean)));
        if (next.join('\u0000') !== current.join('\u0000')) {
          onChange(next);
        }
        setDraftValue('');
      }}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Chip
            variant="outlined"
            label={option}
            {...getTagProps({ index })}
            key={`${option}-${index}`}
            sx={{ fontWeight: 700 }}
          />
        ))
      }
      renderInput={(params) => <TextField {...params} label={label} size="small" fullWidth placeholder={placeholder} />}
    />
  );
}

function ListField({
  label,
  value,
  onChange,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
}) {
  return (
    <TextField
      label={label}
      size="small"
      fullWidth
      multiline
      minRows={3}
      value={value}
      helperText={helperText}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function splitFullName(value: string): { first: string; last: string } {
  const normalized = normalizeText(value);
  if (!normalized) return { first: '', last: '' };
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  const last = parts.pop() || '';
  return {
    first: parts.join(' '),
    last,
  };
}

export default function ClientBiodata({ context, client, onSaved }: Props) {
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [jobTitleOptions, setJobTitleOptions] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [record, setRecord] = useState<BiodataRecord>({
    ...EMPTY,
    contact_id: client.ID,
    full_name: `${client.FirstName || ''} ${client.LastName || ''}`.trim(),
    current_company: client.CompanyName || '',
    job_title: client.JobTitle || '',
  });
  const title = useMemo(() => `${client.FirstName || ''} ${client.LastName || ''}`.trim() || client.CompanyName || 'Contact', [client]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getClientBiodataRecord(context, client.ID)
      .then((existing) => {
        if (cancelled) return;
        if (existing) {
          setRecord({ ...EMPTY, ...existing, contact_id: client.ID, full_name: existing.full_name || title });
          setPhotoPreview(existing.profile_photo_url || '');
        } else {
          setRecord((current) => ({ ...EMPTY, ...current, contact_id: client.ID, full_name: title }));
          setPhotoPreview('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecord((current) => ({ ...EMPTY, ...current, contact_id: client.ID, full_name: title }));
          setPhotoPreview('');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [context, client.ID, title]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getCompanyLookupOptions(context).catch(() => [] as string[]),
      getJobTitleLookupOptions(context).catch(() => [] as string[]),
    ]).then(([companies, jobTitles]) => {
      if (cancelled) return;
      setCompanyOptions(companies || []);
      setJobTitleOptions(jobTitles || []);
    });
    return () => {
      cancelled = true;
    };
  }, [context]);

  useEffect(() => {
    if (!photoFile && record.profile_photo_url) {
      setPhotoPreview(record.profile_photo_url);
    }
  }, [photoFile, record.profile_photo_url]);

  useEffect(() => {
    return () => {
      if (photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const setField = <K extends keyof BiodataRecord>(key: K, value: BiodataRecord[K]) => {
    setRecord((current) => ({ ...current, [key]: value }));
  };

  const handlePhotoPick = () => {
    photoInputRef.current?.click();
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveClientBiodataRecord(
        context,
        client.ID,
        {
          ...record,
          contact_id: client.ID,
          full_name: record.full_name || title,
          languages_spoken: writeListValues(readListValues(record.languages_spoken)),
          education: writeListValues(readListValues(record.education)),
          certifications: writeListValues(readListValues(record.certifications)),
          work_history: writeListValues(readListValues(record.work_history)),
          board_positions: writeListValues(readListValues(record.board_positions)),
          preferred_channels: writeListValues(readListValues(record.preferred_channels)),
          personal_interests: writeListValues(readListValues(record.personal_interests)),
          motivators: writeListValues(readListValues(record.motivators)),
          known_associates: writeListValues(readListValues(record.known_associates)),
          sensitivity_flags: writeListValues(readListValues(record.sensitivity_flags)),
        },
        photoFile
      );
      setRecord(saved);
      setPhotoFile(null);
      setPhotoPreview(saved.profile_photo_url || '');
      const { first, last } = splitFullName(saved.full_name || title);
      await updateClient(context, client.ID, {
        FirstName: first || saved.preferred_name || client.FirstName || '',
        LastName: last || saved.preferred_name || client.LastName || first || '',
        Gender: saved.gender || client.Gender || '',
        CompanyName: saved.current_company || client.CompanyName || '',
        JobTitle: saved.job_title || client.JobTitle || '',
      });
      onSaved?.();
    } catch (error) {
      console.error('[ClientBiodata] Save failed:', error);
      alert(`Biodata save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const nationalityOption = findCountryOption(record.nationality);
  const birthCountryOption = findCountryOption(record.birth_country);
  const birthCountryCode = birthCountryOption?.code || nationalityOption?.code || '';
  const birthStateOption = findStateOption(record.birth_state, birthCountryCode);
  const stateOptions = useMemo(() => getStatesForCountry(birthCountryCode), [birthCountryCode]);
  const cityOptions = useMemo(() => {
    if (!birthCountryCode) return [];
    if (birthStateOption?.code) {
      const stateCities = getCitiesForState(birthCountryCode, birthStateOption.code);
      if (stateCities.length > 0) return stateCities;
    }
    return getCitiesForCountry(birthCountryCode);
  }, [birthCountryCode, birthStateOption?.code]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
        <CircularProgress sx={{ color: '#477BFF' }} />
      </Box>
    );
  }

  return (
    <Paper sx={{ p: 3, borderRadius: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 2.5, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontWeight: 900, fontSize: '1.05rem', color: '#1A1D23' }}>Client Biodata</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: '#7B8FA6' }}>
            Detailed profile fields for {title}
          </Typography>
        </Box>
        <Button variant="contained" onClick={() => { void handleSave(); }} disabled={saving} sx={{ borderRadius: 2, fontWeight: 800 }}>
          {saving ? 'Saving...' : 'Save Biodata'}
        </Button>
      </Box>

      <Stack spacing={3}>
        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#7B8FA6', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1 }}>
            Identity
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}><TextField label="Contact Id" size="small" fullWidth value={record.contact_id} disabled /></Grid>
            <Grid item xs={12} md={6}><TextField label="Full Name" size="small" fullWidth value={record.full_name} onChange={(e) => setField('full_name', e.target.value)} /></Grid>
            <Grid item xs={12} md={4}><TextField label="Preferred Name" size="small" fullWidth value={record.preferred_name} onChange={(e) => setField('preferred_name', e.target.value)} /></Grid>
            <Grid item xs={12} md={4}>
              <SingleLookupField<string>
                label="Current Company"
                value={record.current_company || ''}
                options={companyOptions}
                placeholder="Search companies"
                onChange={(value) => setField('current_company', value)}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <SingleLookupField<string>
                label="Job Title"
                value={record.job_title || ''}
                options={jobTitleOptions}
                placeholder="Search job titles"
                onChange={(value) => setField('job_title', value)}
              />
            </Grid>
            <Grid item xs={12} md={4}><TextField select label="Salutation" size="small" fullWidth value={record.salutation} onChange={(e) => setField('salutation', e.target.value)}>{SALUTATIONS.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} md={4}><TextField select label="Gender" size="small" fullWidth value={record.gender} onChange={(e) => setField('gender', e.target.value)}>{GENDERS.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} md={4}><TextField label="Date of Birth" size="small" type="date" InputLabelProps={{ shrink: true }} fullWidth value={record.date_of_birth} onChange={(e) => setField('date_of_birth', e.target.value)} /></Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, borderRadius: 2, border: '1px solid #E8ECF0', minHeight: 56 }}>
                <Avatar
                  src={photoPreview || record.profile_photo_url || undefined}
                  onClick={handlePhotoPick}
                  sx={{
                    width: 42,
                    height: 42,
                    cursor: 'pointer',
                    bgcolor: '#E8ECF0',
                    color: '#7B8FA6',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {title ? title.slice(0, 2).toUpperCase() : 'PH'}
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: 700, color: '#1A1D23' }}>Profile Photo</Typography>
                  <Typography sx={{ fontSize: '0.68rem', color: '#7B8FA6' }}>
                    Click to upload or replace the photo.
                  </Typography>
                </Box>
                <Button size="small" onClick={handlePhotoPick} sx={{ fontWeight: 700 }}>
                  Upload
                </Button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handlePhotoChange}
                />
              </Box>
            </Grid>
            <Grid item xs={12} md={4}><TextField select label="Record Status" size="small" fullWidth value={record.record_status} onChange={(e) => setField('record_status', e.target.value)}>{RECORD_STATUSES.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField></Grid>
          </Grid>
        </Box>

        <Divider />

        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#7B8FA6', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1 }}>
            Personal Origin
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <SingleLookupField<CountryOption>
                label="Nationality"
                value={record.nationality}
                options={COUNTRY_OPTIONS}
                placeholder="Search countries"
                onChange={(value) => setField('nationality', value)}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <SingleLookupField<CountryOption>
                label="Birth Country"
                value={record.birth_country}
                options={COUNTRY_OPTIONS}
                placeholder="Search countries"
                onChange={(value) => {
                  setField('birth_country', value);
                  setField('birth_state', '');
                  setField('hometown', '');
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <SingleLookupField<StateOption>
                label="Birth State"
                value={record.birth_state}
                options={stateOptions}
                placeholder={birthCountryCode ? 'Search states' : 'Select a country first'}
                onChange={(value) => {
                  setField('birth_state', value);
                  setField('hometown', '');
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <SingleLookupField<CityOption>
                label="Hometown"
                value={record.hometown}
                options={cityOptions}
                placeholder={birthCountryCode ? 'Search cities or type one' : 'Select country/state first'}
                onChange={(value) => setField('hometown', value)}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <SingleLookupField<string>
                label="Ethnicity"
                value={record.ethnicity}
                options={ETHNICITY_OPTIONS}
                placeholder="Search ethnicity"
                onChange={(value) => setField('ethnicity', value)}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <SingleLookupField<string>
                label="Religion"
                value={record.religion}
                options={RELIGION_OPTIONS}
                placeholder="Search religion"
                onChange={(value) => setField('religion', value)}
              />
            </Grid>
            <Grid item xs={12}>
              <MultiLookupField<string>
                label="Languages Spoken"
                value={readListValues(record.languages_spoken)}
                options={LANGUAGE_OPTIONS}
                placeholder='English, French, Igbo, Yoruba, Hausa'
                onChange={(values) => setField('languages_spoken', writeListValues(values))}
              />
              <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6', mt: 0.75 }}>
                Searchable and multi-select. Examples: English, French, Igbo, Yoruba, Hausa.
              </Typography>
            </Grid>
          </Grid>
        </Box>

        <Divider />

        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#7B8FA6', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1 }}>
            Education & Career
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}><ListField label="Education" value={record.education} onChange={(value) => setField('education', value)} helperText="Enter one education entry per line, or separate entries with commas." /></Grid>
            <Grid item xs={12}><ListField label="Certifications" value={record.certifications} onChange={(value) => setField('certifications', value)} helperText="Enter one certification per line, or separate entries with commas." /></Grid>
            <Grid item xs={12}><ListField label="Work History" value={record.work_history} onChange={(value) => setField('work_history', value)} helperText="Enter one work history entry per line, or separate entries with commas." /></Grid>
            <Grid item xs={12}><ListField label="Board Positions" value={record.board_positions} onChange={(value) => setField('board_positions', value)} helperText="Enter one board position per line, or separate entries with commas." /></Grid>
          </Grid>
        </Box>

        <Divider />

        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#7B8FA6', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1 }}>
            Communication
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}><ListField label="Preferred Channels" value={record.preferred_channels} onChange={(value) => setField('preferred_channels', value)} helperText='Enter preferred channels in order, e.g. WhatsApp, Email, Phone.' /></Grid>
            <Grid item xs={12} md={4}><TextField select label="Preferred Contact Time" size="small" fullWidth value={record.preferred_contact_time} onChange={(e) => setField('preferred_contact_time', e.target.value)}>{CONTACT_TIMES.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} md={4}><TextField select label="Meeting Format" size="small" fullWidth value={record.preferred_meeting_format} onChange={(e) => setField('preferred_meeting_format', e.target.value)}>{MEETING_FORMATS.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} md={4}><TextField select label="Formality" size="small" fullWidth value={record.communication_formality} onChange={(e) => setField('communication_formality', e.target.value)}>{FORMALITY.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} md={6}><TextField label="Gatekeeper Name" size="small" fullWidth value={record.gatekeeper_name} onChange={(e) => setField('gatekeeper_name', e.target.value)} /></Grid>
            <Grid item xs={12} md={6}><TextField label="Gatekeeper Phone" size="small" fullWidth value={record.gatekeeper_phone} onChange={(e) => setField('gatekeeper_phone', e.target.value)} /></Grid>
            <Grid item xs={12}><TextField label="Comms Notes" size="small" fullWidth multiline minRows={3} value={record.comms_notes} onChange={(e) => setField('comms_notes', e.target.value)} /></Grid>
          </Grid>
        </Box>

        <Divider />

        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#7B8FA6', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1 }}>
            Intelligence
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}><ListField label="Personal Interests" value={record.personal_interests} onChange={(value) => setField('personal_interests', value)} helperText="Enter one interest per line, or separate entries with commas." /></Grid>
            <Grid item xs={12}><ListField label="Motivators" value={record.motivators} onChange={(value) => setField('motivators', value)} helperText="Enter one motivator per line, or separate entries with commas." /></Grid>
            <Grid item xs={12} md={6}><TextField select label="Decision Style" size="small" fullWidth value={record.decision_making_style} onChange={(e) => setField('decision_making_style', e.target.value)}>{DECISION_STYLES.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} md={6}><TextField label="Referral Source" size="small" fullWidth value={record.referral_source} onChange={(e) => setField('referral_source', e.target.value)} /></Grid>
            <Grid item xs={12}><ListField label="Known Associates" value={record.known_associates} onChange={(value) => setField('known_associates', value)} helperText="Enter one known associate per line, or separate entries with commas." /></Grid>
            <Grid item xs={12}><ListField label="Sensitivity Flags" value={record.sensitivity_flags} onChange={(value) => setField('sensitivity_flags', value)} helperText="Enter one sensitivity flag per line, or separate entries with commas." /></Grid>
            <Grid item xs={12}><TextField label="Account Notes" size="small" fullWidth multiline minRows={4} value={record.account_notes} onChange={(e) => setField('account_notes', e.target.value)} /></Grid>
          </Grid>
        </Box>

        <Divider />

        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#7B8FA6', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1 }}>
            Consent & Audit
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}><FormControlLabel control={<Checkbox checked={record.consent_email} onChange={(e) => setField('consent_email', e.target.checked)} />} label="Consent Email" /></Grid>
            <Grid item xs={12} md={4}><FormControlLabel control={<Checkbox checked={record.consent_sms} onChange={(e) => setField('consent_sms', e.target.checked)} />} label="Consent SMS" /></Grid>
            <Grid item xs={12} md={4}><FormControlLabel control={<Checkbox checked={record.deletion_requested} onChange={(e) => setField('deletion_requested', e.target.checked)} />} label="Deletion Requested" /></Grid>
            <Grid item xs={12} md={4}><TextField label="Consent Date" size="small" type="date" InputLabelProps={{ shrink: true }} fullWidth value={record.consent_date} onChange={(e) => setField('consent_date', e.target.value)} /></Grid>
            <Grid item xs={12} md={4}><TextField label="Data Source" size="small" fullWidth value={record.data_source} onChange={(e) => setField('data_source', e.target.value)} /></Grid>
            <Grid item xs={12} md={4}><TextField label="Created Date" size="small" type="datetime-local" InputLabelProps={{ shrink: true }} fullWidth value={record.created_date} onChange={(e) => setField('created_date', e.target.value)} /></Grid>
            <Grid item xs={12} md={4}><TextField label="Last Modified Date" size="small" type="datetime-local" InputLabelProps={{ shrink: true }} fullWidth value={record.last_modified_date} onChange={(e) => setField('last_modified_date', e.target.value)} /></Grid>
          </Grid>
        </Box>
      </Stack>
    </Paper>
  );
}

