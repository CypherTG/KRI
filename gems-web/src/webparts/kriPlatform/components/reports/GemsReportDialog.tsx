import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, Typography,
  Chip, Checkbox, ListItemText, OutlinedInput,
} from '@mui/material';
import { KriContext } from '../../../../types/kri';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { getGemsInteractions, GemsInteractionRecord } from '../../services/gemsApi';
import { getComplianceRecords, GemsComplianceRecord, getActionRecords, GemsActionRecord } from '../../services/gemsApi';

interface Props {
  context: KriContext;
  open: boolean;
  onClose: () => void;
}

type ReportModule = 'interactions' | 'compliance' | 'actions' | 'all';

const MODULES: { value: ReportModule; label: string }[] = [
  { value: 'interactions', label: 'Interactions' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'actions', label: 'Actions' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: { style: { maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP, width: 250 } },
};

function toCsv(data: string[][]): string {
  const escape = (val: string) => {
    const s = String(val || '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return data.map((row) => row.map(escape).join(',')).join('\r\n');
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function GemsReportDialog({ context, open, onClose }: Props) {
  const [interactions, setInteractions] = useState<GemsInteractionRecord[]>([]);
  const [compliance, setCompliance] = useState<GemsComplianceRecord[]>([]);
  const [actions, setActions] = useState<GemsActionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedModules, setSelectedModules] = useState<ReportModule[]>([ 'interactions' ]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    setSuccess('');
    Promise.all([
      getGemsInteractions(context).catch(() => [] as GemsInteractionRecord[]),
      getComplianceRecords(context).catch(() => [] as GemsComplianceRecord[]),
      getActionRecords(context).catch(() => [] as GemsActionRecord[]),
    ]).then(([i, c, a]) => {
      setInteractions(i);
      setCompliance(c);
      setActions(a);
    }).catch((err) => {
      setError(err?.message || 'Failed to load report data.');
    }).finally(() => setLoading(false));
  }, [context, open]);

  const modulesList = useMemo(() => {
    const unique = new Set(selectedModules);
    if (unique.has('all')) return ['interactions', 'compliance', 'actions'] as ReportModule[];
    return Array.from(unique).filter((m) => m !== 'all') as ReportModule[];
  }, [selectedModules]);

  const filteredInteractions = useMemo(() => {
    if (!selectedMonth && !selectedYear) return interactions;
    return interactions.filter((i) => {
      const monthStr = i.ReportingMonth || '';
      const yearMatch = !selectedYear || monthStr.includes(selectedYear);
      const monthMatch = !selectedMonth || monthStr.toLowerCase().includes(selectedMonth.toLowerCase());
      return yearMatch && monthMatch;
    });
  }, [interactions, selectedMonth, selectedYear]);

  const filteredCompliance = useMemo(() => {
    if (!selectedYear) return compliance;
    return compliance.filter((c) => {
      const date = c.ExpiryDate || c.RenewalDate || '';
      return !selectedYear || date.includes(selectedYear);
    });
  }, [compliance, selectedYear]);

  const filteredActions = useMemo(() => {
    if (!selectedMonth && !selectedYear) return actions;
    return actions.filter((a) => {
      const date = a.DueDate || '';
      const yearMatch = !selectedYear || date.includes(selectedYear);
      const monthMatch = !selectedMonth || date.toLowerCase().includes(`-${String(MONTHS.indexOf(selectedMonth) + 1).padStart(2, '0')}-`);
      return yearMatch && monthMatch;
    });
  }, [actions, selectedMonth, selectedYear]);

  const handleExport = () => {
    setExporting(true);
    setError('');
    setSuccess('');
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const monthLabel = selectedMonth || 'All';
      const yearLabel = selectedYear || 'All';

      if (modulesList.includes('interactions')) {
        const headers = ['ID', 'Title', 'Client Name', 'Company', 'Agency', 'Business Arm', 'Interaction Type', 'Category', 'Final Classification', 'Points', 'Review Status', 'Reporting Month', 'Logged By', 'Logged At', 'Target User', 'KRI Stage', 'Follow Up Required', 'Follow Up Date'];
        const rows = filteredInteractions.map((i) => [
          i.ID, i.Title, i.ClientName, i.CompanyName, i.Agency, i.BusinessArm,
          i.InteractionType, i.Category, i.FinalClassification, String(i.Points),
          i.ReviewStatus, i.ReportingMonth, i.LoggedBy, i.LoggedAt, i.TargetUser,
          i.KRIClassification, String(i.FollowUpRequired), i.FollowUpDate,
        ]);
        downloadFile(toCsv([headers, ...rows]), `GEMS_Interactions_${monthLabel}_${yearLabel}_${dateStr}.csv`, 'text/csv');
      }

      if (modulesList.includes('compliance')) {
        const headers = ['ID', 'Title', 'Compliance Type', 'Governing Body', 'Entity Name', 'Status', 'Expiry Date', 'Renewal Date', 'Issue Date', 'Reference Number'];
        const rows = filteredCompliance.map((c) => [
          c.ID, c.Title, c.ComplianceType, c.GoverningBody, c.EntityName, c.Status,
          c.ExpiryDate, c.RenewalDate, c.IssueDate, c.ReferenceNumber || '',
        ]);
        downloadFile(toCsv([headers, ...rows]), `GEMS_Compliance_${monthLabel}_${yearLabel}_${dateStr}.csv`, 'text/csv');
      }

      if (modulesList.includes('actions')) {
        const headers = ['ID', 'Title', 'Entity Name', 'Entity Type', 'Assigned To', 'Status', 'Due Date', 'Priority', 'Action Type'];
        const rows = filteredActions.map((a) => [
          a.ID, a.Title, a.EntityName || '', a.EntityType || '', a.AssignedTo || '',
          a.Status, a.DueDate, a.Priority || '', a.ActionType || '',
        ]);
        downloadFile(toCsv([headers, ...rows]), `GEMS_Actions_${monthLabel}_${yearLabel}_${dateStr}.csv`, 'text/csv');
      }

      setSuccess(`Exported ${modulesList.join(', ')} report(s) successfully.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to export report.');
    } finally {
      setExporting(false);
    }
  };

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    interactions.forEach((i) => {
      const m = i.ReportingMonth;
      if (m) {
        const y = m.match(/\d{4}/);
        if (y) years.add(y[0]);
      }
    });
    const current = String(new Date().getFullYear());
    if (!years.has(current)) years.add(current);
    return Array.from(years).sort();
  }, [interactions]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 900 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AssessmentIcon sx={{ color: '#477BFF' }} />
          Export GEMS Report
        </Box>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
          ) : (
            <>
              <FormControl fullWidth size="small">
                <InputLabel>Modules to export</InputLabel>
                <Select
                  multiple
                  value={selectedModules}
                  onChange={(e) => setSelectedModules(e.target.value as ReportModule[])}
                  input={<OutlinedInput label="Modules to export" />}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((v) => <Chip key={v} label={v === 'all' ? 'All Modules' : v.charAt(0).toUpperCase() + v.slice(1)} size="small" />)}
                    </Box>
                  )}
                  MenuProps={MenuProps}
                >
                  <MenuItem value="all">
                    <Checkbox checked={selectedModules.includes('all')} />
                    <ListItemText primary="All Modules" />
                  </MenuItem>
                  <MenuItem value="interactions">
                    <Checkbox checked={selectedModules.includes('interactions') || selectedModules.includes('all')} />
                    <ListItemText primary="Interactions" />
                  </MenuItem>
                  <MenuItem value="compliance">
                    <Checkbox checked={selectedModules.includes('compliance') || selectedModules.includes('all')} />
                    <ListItemText primary="Compliance" />
                  </MenuItem>
                  <MenuItem value="actions">
                    <Checkbox checked={selectedModules.includes('actions') || selectedModules.includes('all')} />
                    <ListItemText primary="Actions" />
                  </MenuItem>
                </Select>
              </FormControl>

              <Stack direction="row" spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Month (optional)</InputLabel>
                  <Select
                    value={selectedMonth}
                    label="Month (optional)"
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  >
                    <MenuItem value="">All Months</MenuItem>
                    {MONTHS.map((m) => (
                      <MenuItem key={m} value={m}>{m}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small">
                  <InputLabel>Year</InputLabel>
                  <Select
                    value={selectedYear}
                    label="Year"
                    onChange={(e) => setSelectedYear(e.target.value)}
                  >
                    <MenuItem value="">All Years</MenuItem>
                    {yearOptions.map((y) => (
                      <MenuItem key={y} value={y}>{y}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>

              <Box sx={{ p: 2, borderRadius: 2, background: '#FAFBFC', border: '1px solid #E8ECF0' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.84rem', color: '#1A1D23', mb: 1 }}>
                  Export Summary
                </Typography>
                <Stack spacing={0.5}>
                  <Typography sx={{ fontSize: '0.8rem', color: '#7B8FA6' }}>
                    Interactions: <strong>{filteredInteractions.length}</strong> records
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: '#7B8FA6' }}>
                    Compliance: <strong>{filteredCompliance.length}</strong> records
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: '#7B8FA6' }}>
                    Actions: <strong>{filteredActions.length}</strong> records
                  </Typography>
                </Stack>
              </Box>
            </>
          )}

          {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ borderRadius: 2 }}>{success}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 2, fontWeight: 700 }}>
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          variant="contained"
          disabled={exporting || loading || modulesList.length === 0}
          startIcon={exporting ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <FileDownloadIcon />}
          sx={{ borderRadius: 2, fontWeight: 700 }}
        >
          {exporting ? 'Exporting...' : 'Download Report'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
