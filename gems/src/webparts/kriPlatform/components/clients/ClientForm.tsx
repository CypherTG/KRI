import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { createClient, getClients, getKRIUsers, IClient, IKRIUser, isManagementAdminUser } from '../../services/graphApi';
import { useStore } from '../../store/useStore';
import { dedupeSortedLookupValues, normalizeLookupText, sortUsersByDisplayName, userDisplayName } from '../../utils/lookupHelpers';
import { PHONE_DIAL_CODES } from '../../constants/phoneDialCodes';

interface Props {
  context: WebPartContext;
  onClose: () => void;
  onSaved: (client: IClient) => void;
  initialValues?: Partial<IClient>;
}

const STEPS = ['Identity', 'Relationship', 'Contact', 'Review'];
const GENDER_OPTIONS = ['Female', 'Male', 'Other', 'Prefer not to say'];
const STAGE_OPTIONS = ['Knowledge', 'Rapport', 'Intimacy'];
const BUSINESS_ARM_OPTIONS = ['INTERKONSTRUCT', 'KCC', 'PMT7'].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

function parsePhone(value?: string | null) {
  const raw = normalizeLookupText(value);
  if (!raw) {
    return { code: '+234', number: '' };
  }
  const exact = PHONE_DIAL_CODES.find((option) => raw.startsWith(option.code));
  if (exact) {
    return {
      code: exact.code,
      number: normalizeLookupText(raw.slice(exact.code.length)),
    };
  }
  const codeMatch = raw.match(/^\+\d{1,4}/);
  if (codeMatch) {
    return {
      code: codeMatch[0],
      number: normalizeLookupText(raw.slice(codeMatch[0].length)),
    };
  }
  return { code: '+234', number: raw };
}

function LookupField({
  label,
  value,
  onChange,
  options,
  helperText,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  helperText?: string;
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
        const next = normalizeLookupText(typeof newValue === 'string' ? newValue : newValue || '');
        setDraftValue(next);
        onChange(next);
      }}
      onInputChange={(_, newInputValue, reason) => {
        if (reason === 'input' || reason === 'clear' || reason === 'reset') {
          setDraftValue(newInputValue);
        }
      }}
      onBlur={() => {
        const next = normalizeLookupText(draftValue);
        if (next !== value) {
          onChange(next);
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          helperText={helperText}
          size="small"
          fullWidth
        />
      )}
    />
  );
}

function MultiLookupField({
  label,
  value,
  onChange,
  options,
  helperText,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: string[];
  helperText?: string;
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
        const normalized = (newValue as string[]).map((entry) => normalizeLookupText(entry)).filter(Boolean);
        const next = Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        setDraftValue('');
        onChange(next);
      }}
      onInputChange={(_, newInputValue, reason) => {
        if (reason === 'input' || reason === 'clear' || reason === 'reset') {
          setDraftValue(newInputValue);
        }
      }}
      onBlur={() => {
        const normalized = normalizeLookupText(draftValue);
        if (!normalized) return;
        const next = Array.from(
          new Set([...value, normalized].map((entry) => normalizeLookupText(entry)).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        const current = Array.from(
          new Set(value.map((entry) => normalizeLookupText(entry)).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        if (next.join('\u0000') !== current.join('\u0000')) {
          onChange(next);
        }
        setDraftValue('');
      }}
      renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (
        <Chip
          {...getTagProps({ index })}
          key={`${option}-${index}`}
          label={option}
          size="small"
          sx={{ fontWeight: 700 }}
        />
      ))}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          helperText={helperText}
          size="small"
          fullWidth
        />
      )}
    />
  );
}

function UserLookupField({
  label,
  value,
  onChange,
  options,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: IKRIUser[];
  helperText?: string;
}) {
  const selected = options.find((user) => String(user.ID) === String(value)) || null;

  return (
    <Autocomplete
      options={options}
      value={selected}
      onChange={(_, newValue) => onChange(newValue ? String(newValue.ID) : '')}
      isOptionEqualToValue={(option, optionValue) => String(option.ID) === String(optionValue.ID)}
      getOptionLabel={(option) => userDisplayName(option)}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          helperText={helperText}
          size="small"
          fullWidth
        />
      )}
    />
  );
}

function PhoneField({
  code,
  number,
  onCodeChange,
  onNumberChange,
}: {
  code: string;
  number: string;
  onCodeChange: (value: string) => void;
  onNumberChange: (value: string) => void;
}) {
  const selectedCode = PHONE_DIAL_CODES.find((option) => option.code === code) || null;

  return (
    <Grid container spacing={1.5}>
      <Grid item xs={12} sm={4}>
        <Autocomplete
          freeSolo
          options={PHONE_DIAL_CODES}
          value={selectedCode}
          inputValue={code}
          getOptionLabel={(option) => (typeof option === 'string' ? option : option.code)}
          isOptionEqualToValue={(option, optionValue) => option.code === optionValue.code}
          renderOption={(props, option) => (
            <li {...props} key={option.code}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Typography sx={{ fontWeight: 700, color: '#1A1D23' }}>{option.code}</Typography>
                <Typography sx={{ fontSize: '0.76rem', color: '#7B8FA6', ml: 2 }}>{option.country}</Typography>
              </Box>
            </li>
          )}
          onChange={(_, newValue) => {
            if (typeof newValue === 'string') {
              onCodeChange(normalizeLookupText(newValue));
              return;
            }
            onCodeChange(newValue?.code || '');
          }}
          onInputChange={(_, newInputValue, reason) => {
            if (reason === 'input' || reason === 'clear' || reason === 'reset') {
              onCodeChange(normalizeLookupText(newInputValue));
            }
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Country Code"
              size="small"
              placeholder="+234"
              fullWidth
            />
          )}
        />
      </Grid>
      <Grid item xs={12} sm={8}>
        <TextField
          label="Phone Number"
          size="small"
          fullWidth
          value={number}
          onChange={(event) => onNumberChange(event.target.value)}
        />
      </Grid>
    </Grid>
  );
}

export default function ClientForm({ context, onClose, onSaved, initialValues }: Props) {
  const {
    clients,
    setClients,
    users,
    setUsers,
    currentUserProfile,
  } = useStore();
  const canManageAssignments = isManagementAdminUser(currentUserProfile);
  const [activeStep, setActiveStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');
  const initialPhone = parsePhone(initialValues?.Phone);
  const [phoneCode, setPhoneCode] = useState(initialPhone.code);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone.number);
  const [formData, setFormData] = useState<Partial<IClient>>(() => ({
    FirstName: normalizeLookupText(initialValues?.FirstName),
    LastName: normalizeLookupText(initialValues?.LastName),
    Gender: normalizeLookupText(initialValues?.Gender),
    Email: normalizeLookupText(initialValues?.Email),
    CompanyName: normalizeLookupText(initialValues?.CompanyName),
    BusinessArm: Array.isArray(initialValues?.BusinessArm)
      ? initialValues.BusinessArm
      : initialValues?.BusinessArm
        ? [String(initialValues.BusinessArm)]
        : [],
    JobTitle: normalizeLookupText(initialValues?.JobTitle),
    ProjectName: normalizeLookupText(initialValues?.ProjectName),
    KRIStage: initialValues?.KRIStage || 'Knowledge',
    LinkedInURL: normalizeLookupText(initialValues?.LinkedInURL || initialValues?.LinkedInProfile),
    InstagramHandle: normalizeLookupText(initialValues?.InstagramHandle || initialValues?.InstagramAccount),
    KRISecondaryContact: initialValues?.KRISecondaryContact || null,
    BirthdayDate: normalizeLookupText(initialValues?.BirthdayDate),
    Notes: normalizeLookupText(initialValues?.Notes),
    KCCContactPerson: initialValues?.KCCContactPerson || null,
  }));

  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrateLookups() {
      const shouldLoadClients = clients.length === 0;
      const shouldLoadUsers = canManageAssignments && users.length === 0;

      if (!shouldLoadClients && !shouldLoadUsers) return;

      setLookupLoading(true);
      const messages: string[] = [];

      try {
        if (shouldLoadClients) {
          const latestClients = await getClients(context);
          if (!cancelled) setClients(latestClients);
          messages.push(`${latestClients.length} contacts loaded`);
        }
      } catch (error) {
        console.warn('[ClientForm] Failed to load contacts for lookups', error);
      }

      try {
        if (shouldLoadUsers) {
          const latestUsers = await getKRIUsers(context);
          if (!cancelled) setUsers(latestUsers);
          messages.push(`${latestUsers.length} users loaded`);
        }
      } catch (error) {
        console.warn('[ClientForm] Failed to load users for lookups', error);
      } finally {
        if (!cancelled) {
          setLookupLoading(false);
          setLookupMessage(messages.join(' · '));
        }
      }
    }

    void hydrateLookups();

    return () => {
      cancelled = true;
    };
  }, [context, canManageAssignments, clients.length, users.length, setClients, setUsers]);

  const companyOptions = useMemo(() => dedupeSortedLookupValues(clients.map((client) => client.CompanyName)), [clients]);
  const jobTitleOptions = useMemo(() => dedupeSortedLookupValues(clients.map((client) => client.JobTitle)), [clients]);
  const projectOptions = useMemo(() => dedupeSortedLookupValues(clients.map((client) => client.ProjectName)), [clients]);
  const assignableUsers = useMemo(() => sortUsersByDisplayName(users), [users]);
  const businessArms = useMemo(() => BUSINESS_ARM_OPTIONS.slice(), []);

  const fieldGrid = {
    display: 'grid',
    gap: 2,
    gridTemplateColumns: {
      xs: '1fr',
      md: 'repeat(2, minmax(0, 1fr))',
    },
  } as const;

  const setField = (key: keyof IClient, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const phone = normalizeLookupText([phoneCode, phoneNumber].filter(Boolean).join(' '));
      const saved = await createClient(context, {
        ...formData,
        Phone: phone,
        CompanyName: normalizeLookupText(formData.CompanyName),
        JobTitle: normalizeLookupText(formData.JobTitle),
        ProjectName: normalizeLookupText(formData.ProjectName),
        BusinessArm: (formData.BusinessArm || []).length
          ? (formData.BusinessArm || []).map((entry) => normalizeLookupText(entry)).filter(Boolean)
          : undefined,
        KCCContactPerson: formData.KCCContactPerson || undefined,
        KRISecondaryContact: formData.KRISecondaryContact || undefined,
      });
      onSaved(saved);
    } catch (error: any) {
      console.error('[ClientForm] Failed to save client', error);
      setSaveError(error?.message || 'Failed to save contact. Please check your network and SharePoint list permissions.');
    } finally {
      setSaving(false);
    }
  };

  const selectedBusinessArms = Array.isArray(formData.BusinessArm) ? formData.BusinessArm : [];

  return (
    <Dialog open fullWidth maxWidth="md" onClose={onClose} onKeyDown={(e) => e.stopPropagation()} scroll="paper">
      <DialogTitle sx={{ fontWeight: 800, fontSize: '1.15rem' }}>
        New Contact
      </DialogTitle>
      <DialogContent dividers sx={{ pb: 1 }}>
        <Stack spacing={2.5}>
          <Box>
            <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 2 }}>
              {STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
            {lookupLoading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#7B8FA6', mb: 1 }}>
                <CircularProgress size={14} />
                <Typography sx={{ fontSize: '0.78rem' }}>{lookupMessage || 'Loading lookup data...'}</Typography>
              </Box>
            )}
          </Box>

          {activeStep === 0 && (
            <Box sx={fieldGrid}>
              <TextField
                label="First Name"
                size="small"
                fullWidth
                value={formData.FirstName || ''}
                onChange={(event) => setField('FirstName', event.target.value)}
              />
              <TextField
                label="Last Name"
                size="small"
                fullWidth
                value={formData.LastName || ''}
                onChange={(event) => setField('LastName', event.target.value)}
              />
              <LookupField
                label="Company"
                value={normalizeLookupText(formData.CompanyName)}
                options={companyOptions}
                helperText="Search existing companies or enter a new company."
                onChange={(value) => setField('CompanyName', value)}
              />
              <TextField
                select
                label="Gender"
                size="small"
                fullWidth
                value={formData.Gender || ''}
                onChange={(event) => setField('Gender', event.target.value)}
              >
                <MenuItem value="">
                  <em>Unset</em>
                </MenuItem>
                {GENDER_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Birthday"
                size="small"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={formData.BirthdayDate || ''}
                onChange={(event) => setField('BirthdayDate', event.target.value)}
              />
            </Box>
          )}

          {activeStep === 1 && (
            <Box sx={fieldGrid}>
              <LookupField
                label="Company"
                value={normalizeLookupText(formData.CompanyName)}
                options={companyOptions}
                helperText="Associated company."
                onChange={(value) => setField('CompanyName', value)}
              />
              <MultiLookupField
                label="Business Arm(s)"
                value={selectedBusinessArms}
                options={businessArms}
                helperText="Pick one or more arms, or type a new one if needed."
                onChange={(value) => setField('BusinessArm', value)}
              />
              <LookupField
                label="Job Title"
                value={normalizeLookupText(formData.JobTitle)}
                options={jobTitleOptions}
                helperText="Search existing titles or type a new title."
                onChange={(value) => setField('JobTitle', value)}
              />
              <LookupField
                label="Project Name"
                value={normalizeLookupText(formData.ProjectName)}
                options={projectOptions}
                helperText="Search existing projects or type a new project."
                onChange={(value) => setField('ProjectName', value)}
              />
              {canManageAssignments && (
                <UserLookupField
                  label="Primary Owner"
                  value={String((formData.KCCContactPerson as any)?.ID || (formData.KCCContactPerson as any)?.Id || '')}
                  options={assignableUsers}
                  helperText="Assignable to management users."
                  onChange={(value) => {
                    const selected = assignableUsers.find((user) => String(user.ID) === String(value)) || null;
                    setField('KCCContactPerson', selected);
                  }}
                />
              )}
              {canManageAssignments && (
                <UserLookupField
                  label="Secondary Owner"
                  value={String((formData.KRISecondaryContact as any)?.ID || (formData.KRISecondaryContact as any)?.Id || '')}
                  options={assignableUsers}
                  helperText="Optional second owner."
                  onChange={(value) => {
                    const selected = assignableUsers.find((user) => String(user.ID) === String(value)) || null;
                    setField('KRISecondaryContact', selected);
                  }}
                />
              )}
            </Box>
          )}

          {activeStep === 2 && (
            <Box sx={fieldGrid}>
              <TextField
                label="Email"
                size="small"
                fullWidth
                value={formData.Email || ''}
                onChange={(event) => setField('Email', event.target.value)}
              />
              <PhoneField
                code={phoneCode}
                number={phoneNumber}
                onCodeChange={setPhoneCode}
                onNumberChange={setPhoneNumber}
              />
              <TextField
                label="LinkedIn URL"
                size="small"
                fullWidth
                value={formData.LinkedInURL || ''}
                onChange={(event) => setField('LinkedInURL', event.target.value)}
              />
              <TextField
                label="Instagram Handle"
                size="small"
                fullWidth
                value={formData.InstagramHandle || ''}
                onChange={(event) => setField('InstagramHandle', event.target.value)}
              />
            </Box>
          )}

          {activeStep === 3 && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              {saveError && (
                <Alert severity="error" sx={{ borderRadius: 2 }}>
                  {saveError}
                </Alert>
              )}
              <TextField
                select
                label="KRI Stage"
                size="small"
                fullWidth
                value={formData.KRIStage || 'Knowledge'}
                onChange={(event) => setField('KRIStage', event.target.value)}
              >
                {STAGE_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Notes"
                size="small"
                fullWidth
                multiline
                minRows={5}
                value={formData.Notes || ''}
                onChange={(event) => setField('Notes', event.target.value)}
              />
              <Box sx={{ p: 2, borderRadius: 2, border: '1px solid #E8ECF0', background: '#FAFBFC' }}>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#7B8FA6', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1 }}>
                  Review
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: '#6B7280', mb: 0.4 }}>
                  Company selected: <strong>{normalizeLookupText(formData.CompanyName) || 'Not selected'}</strong>
                </Typography>
                <Typography sx={{ fontSize: '0.85rem', color: '#1A1D23' }}>
                  {normalizeLookupText(formData.FirstName)} {normalizeLookupText(formData.LastName)}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>
                  {normalizeLookupText(formData.CompanyName) || 'No company'} {normalizeLookupText(formData.JobTitle) ? `• ${normalizeLookupText(formData.JobTitle)}` : ''}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>
                  {normalizeLookupText(formData.ProjectName) ? `Project: ${normalizeLookupText(formData.ProjectName)}` : 'No project set'}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>
                  Phone: {normalizeLookupText([phoneCode, phoneNumber].filter(Boolean).join(' ')) || 'Not set'}
                </Typography>
              </Box>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ borderRadius: 2, fontWeight: 700 }}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          disabled={activeStep === 0}
          onClick={() => setActiveStep((current) => Math.max(current - 1, 0))}
          sx={{ borderRadius: 2, fontWeight: 700 }}
        >
          Back
        </Button>
        {activeStep < STEPS.length - 1 ? (
          <Button
            variant="contained"
            onClick={() => setActiveStep((current) => Math.min(current + 1, STEPS.length - 1))}
            sx={{ borderRadius: 2, fontWeight: 700 }}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={() => { void handleSave(); }}
            disabled={saving}
            sx={{ borderRadius: 2, fontWeight: 700, minWidth: 140 }}
          >
            {saving ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} color="inherit" />
                <span>Saving...</span>
              </Box>
            ) : (
              'Save Contact'
            )}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
