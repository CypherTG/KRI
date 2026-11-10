import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TableSortLabel, TextField, MenuItem,
  CircularProgress, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, Link, Autocomplete,
} from '@mui/material';
import { KriContext } from '../../../../types/kri';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { downloadCsv, escapeCsv } from '../../utils/exportCsv';
import { GEMS_ALLOWED_AGENCIES } from '../../utils/gemsScope';
import { GemsComplianceRecord, getComplianceRecords, createComplianceRecord, deleteComplianceRecord, updateComplianceRecord } from '../../services/gemsApi';
import { createActionRecord, uploadComplianceAttachment, getComplianceAttachments } from '../../services/gemsApi';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AttachFileIcon from '@mui/icons-material/AttachFile';

interface Props { context: KriContext; }

const STATUS_COLORS: Record<string, string> = { Active: '#00BFA5', Expired: '#F44336', Pending: '#FF9800', Cancelled: '#7B8FA6', ExpiringSoon: '#FF7043', UnderReview: '#477BFF' };
const COMPLIANCE_TYPES = ['Permit', 'License', 'Obligation', 'Certificate', 'Filing', 'Registration'];
const STATUSES = ['Active', 'Expired', 'Pending', 'Cancelled', 'ExpiringSoon', 'UnderReview'];
const ENTITY_OPTIONS = ['INTERKONSTRUCT', 'KCC', 'PMT7', 'NGNEERED PROJECTS', ...GEMS_ALLOWED_AGENCIES];

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try { return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return dateStr; }
}

type SortField = 'Title' | 'ComplianceType' | 'Status' | 'ExpiryDate' | 'GoverningBody' | 'EntityName' | 'AssignedTo';
type SortDir = 'asc' | 'desc';

export default function GemsCompliancePage({ context }: Props) {
  const [records, setRecords] = useState<GemsComplianceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortField, setSortField] = useState<SortField>('ExpiryDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAssignedTo, setFilterAssignedTo] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<GemsComplianceRecord | null>(null);

  const fetchRecords = async () => {
    setLoading(true); setError('');
    try { setRecords(await getComplianceRecords(context)); }
    catch (err: any) { setError(String(err?.message || err || 'Failed to load compliance records')); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRecords(); }, []);

  const assignedToOptions = useMemo(() => {
    const names = new Set<string>();
    records.forEach((r) => { if (r.AssignedTo) names.add(r.AssignedTo); });
    return Array.from(names).sort();
  }, [records]);

  const filtered = useMemo(() => {
    let items = [...records];
    if (filterType !== 'all') items = items.filter((r) => r.ComplianceType === filterType);
    if (filterStatus !== 'all') items = items.filter((r) => r.Status === filterStatus);
    if (filterAssignedTo !== 'all') items = items.filter((r) => (r.AssignedTo || '') === filterAssignedTo);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((r) => r.Title.toLowerCase().includes(q) || r.EntityName.toLowerCase().includes(q) || r.GoverningBody.toLowerCase().includes(q));
    }
    items.sort((a, b) => { const c = String(a[sortField] || '').localeCompare(String(b[sortField] || '')); return sortDir === 'asc' ? c : -c; });
    return items;
  }, [records, filterType, filterStatus, filterAssignedTo, search, sortField, sortDir]);

  const handleSort = (field: SortField) => { if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); else { setSortField(field); setSortDir('asc'); } };

  const handleExport = () => {
    const fields: (keyof GemsComplianceRecord)[] = ['Title', 'EntityType', 'EntityId', 'EntityName', 'ComplianceType', 'Status', 'IssueDate', 'ExpiryDate', 'RenewalDate', 'GoverningBody', 'AssignedTo'];
    const headers = fields.map((f) => String(f));
    const rows = filtered.map((r) => fields.map((f) => escapeCsv(r[f])).join(','));
    downloadCsv(`gems-compliance-${new Date().toISOString().slice(0, 10)}.csv`, [headers.join(','), ...rows]);
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
        <Typography sx={{ fontWeight: 900, fontSize: '1.15rem', color: '#1A1D23' }}>
          Compliance Records
          <Typography component="span" sx={{ fontSize: '0.85rem', color: '#7B8FA6', ml: 1, fontWeight: 600 }}>({filtered.length} of {records.length})</Typography>
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<FileDownloadIcon />} onClick={handleExport} sx={{ fontWeight: 700, borderRadius: 2 }}>Export CSV</Button>
          <Button variant="outlined" size="small" startIcon={<RefreshIcon />} onClick={fetchRecords}>Refresh</Button>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Add Record</Button>
        </Stack>
      </Stack>

      <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid #E8ECF0', mb: 2.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField size="small" label="Search" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 200 }} />
          <TextField select size="small" label="Type" value={filterType} onChange={(e) => setFilterType(e.target.value)} sx={{ minWidth: 140 }}>
            <MenuItem value="all">All Types</MenuItem>
            {COMPLIANCE_TYPES.map((t) => (<MenuItem key={t} value={t}>{t}</MenuItem>))}
          </TextField>
          <TextField select size="small" label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 140 }}>
            <MenuItem value="all">All Statuses</MenuItem>
            {STATUSES.map((s) => (<MenuItem key={s} value={s}>{s}</MenuItem>))}
          </TextField>
          <TextField select size="small" label="Assigned To" value={filterAssignedTo} onChange={(e) => setFilterAssignedTo(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="all">All</MenuItem>
            {assignedToOptions.map((n) => (<MenuItem key={n} value={n}>{n}</MenuItem>))}
          </TextField>
        </Stack>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : error ? (
        <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #F44336' }}>
          <Typography color="error">{error}</Typography>
          <Button variant="outlined" size="small" sx={{ mt: 1.5 }} onClick={fetchRecords}>Retry</Button>
        </Paper>
      ) : filtered.length === 0 ? (
        <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px dashed #DDE3EA', textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 700, color: '#1A1D23', mb: 0.5 }}>No compliance records found</Typography>
          <Typography sx={{ fontSize: '0.84rem', color: '#7B8FA6' }}>
            {records.length === 0 ? 'Create your first compliance record to start tracking permits, licences, and obligations.' : 'Try adjusting your filters.'}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 3, border: '1px solid #E8ECF0' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><TableSortLabel active={sortField === 'Title'} direction={sortField === 'Title' ? sortDir : 'asc'} onClick={() => handleSort('Title')}>Title</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sortField === 'EntityName'} direction={sortField === 'EntityName' ? sortDir : 'asc'} onClick={() => handleSort('EntityName')}>Entity</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sortField === 'ComplianceType'} direction={sortField === 'ComplianceType' ? sortDir : 'asc'} onClick={() => handleSort('ComplianceType')}>Type</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sortField === 'Status'} direction={sortField === 'Status' ? sortDir : 'asc'} onClick={() => handleSort('Status')}>Status</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sortField === 'GoverningBody'} direction={sortField === 'GoverningBody' ? sortDir : 'asc'} onClick={() => handleSort('GoverningBody')}>Governing Body</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sortField === 'AssignedTo'} direction={sortField === 'AssignedTo' ? sortDir : 'asc'} onClick={() => handleSort('AssignedTo')}>Assigned To</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sortField === 'ExpiryDate'} direction={sortField === 'ExpiryDate' ? sortDir : 'asc'} onClick={() => handleSort('ExpiryDate')}>Expiry</TableSortLabel></TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((record) => (
                <TableRow key={record.ID} hover sx={{ cursor: 'pointer' }} onClick={() => setSelectedRecord(record)}>
                  <TableCell><Typography sx={{ fontWeight: 700, fontSize: '0.84rem' }}>{record.Title}</Typography></TableCell>
                  <TableCell><Typography sx={{ fontSize: '0.84rem' }}>{record.EntityName || '-'}</Typography></TableCell>
                  <TableCell><Typography sx={{ fontSize: '0.84rem' }}>{record.ComplianceType}</Typography></TableCell>
                  <TableCell><Chip label={record.Status} size="small" sx={{ fontWeight: 700, fontSize: '0.72rem', background: `${STATUS_COLORS[record.Status] || '#7B8FA6'}20`, color: STATUS_COLORS[record.Status] || '#7B8FA6', borderRadius: 1.5 }} /></TableCell>
                  <TableCell><Typography sx={{ fontSize: '0.84rem' }}>{record.GoverningBody || '-'}</Typography></TableCell>
                  <TableCell><Typography sx={{ fontSize: '0.84rem' }}>{record.AssignedTo || '-'}</Typography></TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: '0.84rem', color: record.Status === 'Expired' || record.Status === 'ExpiringSoon' ? '#F44336' : 'inherit' }}>{formatDate(record.ExpiryDate)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="View details"><IconButton size="small" onClick={(e) => { e.stopPropagation(); setSelectedRecord(record); }}><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${record.Title}"?`)) deleteComplianceRecord(context, record.ID).then(fetchRecords); }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CreateComplianceDialog open={createOpen} onClose={() => setCreateOpen(false)} context={context} onCreated={fetchRecords} />
      <ViewComplianceDialog record={selectedRecord} onClose={() => setSelectedRecord(null)} context={context} onUpdated={fetchRecords} />
    </Box>
  );
}

function CreateComplianceDialog({ open, onClose, context, onCreated }: {
  open: boolean; onClose: () => void; context: KriContext; onCreated: () => void;
}) {
  const [form, setForm] = useState({
    complianceType: 'Permit', status: 'Pending', issueDate: '', expiryDate: '', renewalDate: '',
    governingBody: '', description: '', referenceNumber: '', assignedTo: '',
    entityName: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      complianceType: 'Permit', status: 'Pending', issueDate: '', expiryDate: '', renewalDate: '',
      governingBody: '', description: '', referenceNumber: '', assignedTo: '',
      entityName: '',
    });
    setSelectedFile(null);
  }, [open]);

  const handleCreate = async () => {
    if (!form.complianceType.trim()) return;
    setSaving(true);
    try {
      const created = await createComplianceRecord(context, {
        entityType: form.governingBody ? 'Agency' : '',
        entityId: form.governingBody || '',
        entityName: form.entityName || form.governingBody || '',
        complianceType: form.complianceType,
        status: form.status,
        issueDate: form.issueDate,
        expiryDate: form.expiryDate,
        renewalDate: form.renewalDate,
        governingBody: form.governingBody,
        referenceNumber: form.referenceNumber,
        description: form.description,
        assignedTo: form.assignedTo,
      });

      if (selectedFile) {
        try {
          await uploadComplianceAttachment(context, created.ID, selectedFile);
        } catch (uploadErr) {
          console.warn('Document upload failed, record was created.', uploadErr);
        }
      }

      onCreated(); onClose();
    } catch (err: any) { alert(String(err?.message || err || 'Failed to create record')); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, fontSize: '1rem' }}>New Compliance Record</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select size="small" label="Compliance Type" value={form.complianceType} onChange={(e) => setForm((f) => ({ ...f, complianceType: e.target.value }))} required>
            {COMPLIANCE_TYPES.map((t) => (<MenuItem key={t} value={t}>{t}</MenuItem>))}
          </TextField>
          <TextField select size="small" label="Status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            {STATUSES.map((s) => (<MenuItem key={s} value={s}>{s}</MenuItem>))}
          </TextField>
          <TextField size="small" type="date" label="Issue Date" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="Expiry Date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="Renewal Date" value={form.renewalDate} onChange={(e) => setForm((f) => ({ ...f, renewalDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
          <TextField select size="small" label="Governing Body" value={form.governingBody} onChange={(e) => setForm((f) => ({ ...f, governingBody: e.target.value }))}>
            <MenuItem value="">None</MenuItem>
            {GEMS_ALLOWED_AGENCIES.map((a) => (<MenuItem key={a} value={a}>{a}</MenuItem>))}
          </TextField>
          <TextField size="small" label="Reference Number" value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} placeholder="Permit/licence reference" />
          <Autocomplete
            freeSolo
            options={ENTITY_OPTIONS}
            value={form.entityName}
            onChange={(_, v) => setForm((f) => ({ ...f, entityName: typeof v === 'string' ? v : v || '' }))}
            onInputChange={(_, v) => setForm((f) => ({ ...f, entityName: v }))}
            renderInput={(params) => (
              <TextField {...params} size="small" label="Entity Name" placeholder="Select or type entity / agency name" />
            )}
          />
          <TextField size="small" label="Assigned To" value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))} />
          <TextField size="small" multiline rows={2} label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <Box>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#7B8FA6', mb: 0.5 }}>Permit Document (optional)</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button variant="outlined" component="label" sx={{ borderRadius: 2, fontWeight: 700, fontSize: '0.78rem' }} startIcon={<UploadFileIcon />}>
                Upload File
                <input type="file" hidden onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
              </Button>
              {selectedFile && (
                <Chip label={selectedFile.name} size="small" onDelete={() => setSelectedFile(null)} sx={{ fontWeight: 600 }} />
              )}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={saving || !form.complianceType.trim()}>{saving ? 'Creating...' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function ViewComplianceDialog({ record, onClose, context, onUpdated }: { record: GemsComplianceRecord | null; onClose: () => void; context?: KriContext; onUpdated?: () => void }) {
  const [actionOpen, setActionOpen] = useState(false);
  const [actionForm, setActionForm] = useState({ actionType: 'FollowUp', priority: 'Medium', dueDate: '', assignedTo: '', description: '' });
  const [actionSaving, setActionSaving] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ fileName: string; serverRelativeUrl: string }>>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    status: 'Active',
    expiryDate: '',
    renewalDate: '',
    assignedTo: '',
    notes: '',
  });

  useEffect(() => {
    if (!record || !context) return;
    setEditing(false);
    setEditForm({
      status: record.Status || 'Active',
      expiryDate: record.ExpiryDate ? String(record.ExpiryDate).slice(0, 10) : '',
      renewalDate: record.RenewalDate ? String(record.RenewalDate).slice(0, 10) : '',
      assignedTo: record.AssignedTo || '',
      notes: record.Notes || '',
    });
    setAttachmentsLoading(true);
    getComplianceAttachments(context, record.ID).then(setAttachments).catch(() => {}).finally(() => setAttachmentsLoading(false));
  }, [record, context]);

  if (!record) return null;

  const handleSaveEdit = async () => {
    if (!context) return;
    setEditSaving(true);
    try {
      await updateComplianceRecord(context, record.ID, {
        status: editForm.status,
        expiryDate: editForm.expiryDate,
        renewalDate: editForm.renewalDate,
        assignedTo: editForm.assignedTo,
        notes: editForm.notes,
        lastCheckedDate: new Date().toISOString().slice(0, 10),
      });
      setEditing(false);
      onUpdated?.();
      onClose();
    } catch (err: any) {
      alert(String(err?.message || err || 'Failed to update compliance record'));
    } finally {
      setEditSaving(false);
    }
  };

  let documents: Array<{ url: string; name: string; uploadedAt: string }> = [];
  try { documents = JSON.parse(record.DocumentsJson || '[]'); } catch { documents = []; }

  const handleUpload = async (file: File) => {
    if (!context) return;
    setUploadingFile(true);
    try {
      await uploadComplianceAttachment(context, record.ID, file);
      const updated = await getComplianceAttachments(context, record.ID);
      setAttachments(updated);
    } catch (err: any) {
      alert(err?.message || 'Failed to upload file');
    } finally {
      setUploadingFile(false);
    }
  };

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(name);

  const handleCreateAction = async () => {
    if (!context || !actionForm.description.trim()) return;
    setActionSaving(true);
    try {
      await createActionRecord(context, {
        entityType: 'Compliance',
        entityId: record.ID,
        entityName: record.Title,
        actionType: actionForm.actionType,
        priority: actionForm.priority,
        dueDate: actionForm.dueDate,
        assignedTo: actionForm.assignedTo || record.AssignedTo,
        description: actionForm.description,
        source: 'Compliance',
        sourceId: record.ID,
      });
      setActionOpen(false);
      setActionForm({ actionType: 'FollowUp', priority: 'Medium', dueDate: '', assignedTo: '', description: '' });
    } catch (err: any) { alert(String(err?.message || err || 'Failed to create action')); }
    finally { setActionSaving(false); }
  };

  return (
    <>
      <Dialog open={!!record} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{record.Title}</span>
          {context && (
            <Button size="small" variant="outlined" onClick={() => setEditing((v) => !v)} sx={{ fontWeight: 700, borderRadius: 2, fontSize: '0.75rem' }}>
              {editing ? 'Cancel Edit' : 'Edit Status / Dates'}
            </Button>
          )}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {editing ? (
              <Stack spacing={1.5} sx={{ p: 2, borderRadius: 2, background: '#FAFBFC', border: '1px solid #E8ECF0' }}>
                <TextField select size="small" label="Status" value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map((s) => (<MenuItem key={s} value={s}>{s}</MenuItem>))}
                </TextField>
                <TextField size="small" type="date" label="Expiry Date" value={editForm.expiryDate} onChange={(e) => setEditForm((f) => ({ ...f, expiryDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
                <TextField size="small" type="date" label="Renewal Date" value={editForm.renewalDate} onChange={(e) => setEditForm((f) => ({ ...f, renewalDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
                <TextField size="small" label="Assigned To" value={editForm.assignedTo} onChange={(e) => setEditForm((f) => ({ ...f, assignedTo: e.target.value }))} />
                <TextField size="small" multiline rows={2} label="Notes" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                  <Button size="small" variant="contained" onClick={handleSaveEdit} disabled={editSaving}>
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </Box>
              </Stack>
            ) : (
              <>
                <Row label="Type" value={record.ComplianceType} />
                <Row label="Status" value={record.Status} color={STATUS_COLORS[record.Status] || undefined} />
                <Row label="Entity" value={`${record.EntityName || record.EntityId} (${record.EntityType || 'General'})`} />
                <Row label="Governing Body" value={record.GoverningBody || '-'} />
                <Row label="Reference No." value={record.ReferenceNumber || '-'} />
                <Row label="Issue Date" value={formatDate(record.IssueDate)} />
                <Row label="Expiry Date" value={formatDate(record.ExpiryDate)} />
                <Row label="Renewal Date" value={formatDate(record.RenewalDate)} />
                <Row label="Assigned To" value={record.AssignedTo || '-'} />
                <Row label="Last Checked" value={formatDate(record.LastCheckedDate)} />
                {record.Description && <Row label="Description" value={record.Description} />}
                {record.Notes && <Row label="Notes" value={record.Notes} />}
                <Row label="Alert Sent" value={record.AlertSent ? 'Yes' : 'No'} />
              </>
            )}

            <Box>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#7B8FA6', mb: 0.5 }}>
                Documents & Attachments
              </Typography>
              {attachmentsLoading ? (
                <CircularProgress size={16} />
              ) : (
                <>
                  {attachments.length === 0 && documents.length === 0 && (
                    <Typography sx={{ fontSize: '0.82rem', color: '#B0BEC5', py: 0.5 }}>No documents attached.</Typography>
                  )}
                  {documents.map((doc, idx) => (
                    <Box key={`doc-${idx}`} sx={{ p: 1, borderRadius: 1, background: '#FAFBFC', border: '1px solid #E8ECF0', mb: 0.5 }}>
                      {doc.url ? (
                        <Link href={doc.url} target="_blank" rel="noopener" sx={{ fontSize: '0.82rem', color: '#477BFF', fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <UploadFileIcon sx={{ fontSize: 16 }} /> {doc.name || 'View Document'}
                        </Link>
                      ) : (
                        <Typography sx={{ fontSize: '0.82rem', color: '#7B8FA6' }}>No document URL</Typography>
                      )}
                    </Box>
                  ))}
                  {attachments.map((att, idx) => (
                    <Box key={`att-${idx}`} sx={{ p: 1, borderRadius: 1, background: '#FAFBFC', border: '1px solid #E8ECF0', mb: 0.5 }}>
                      <Link href={att.serverRelativeUrl} target="_blank" rel="noopener" sx={{ fontSize: '0.82rem', color: '#477BFF', fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AttachFileIcon sx={{ fontSize: 16 }} /> {att.fileName}
                      </Link>
                      {isImage(att.fileName) && (
                        <Box sx={{ mt: 0.5, borderRadius: 1, overflow: 'hidden', maxHeight: 160 }}>
                          <img src={att.serverRelativeUrl} alt={att.fileName} style={{ width: '100%', maxHeight: 160, objectFit: 'cover' }} />
                        </Box>
                      )}
                    </Box>
                  ))}
                  {context && (
                    <Box sx={{ mt: 1 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        component="label"
                        disabled={uploadingFile}
                        startIcon={uploadingFile ? <CircularProgress size={14} /> : <UploadFileIcon />}
                        sx={{ fontWeight: 700, borderRadius: 2, fontSize: '0.78rem' }}
                      >
                        {uploadingFile ? 'Uploading...' : 'Upload Document'}
                        <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </Box>

            {context && (
              <Box sx={{ pt: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AssignmentIcon />}
                  onClick={() => setActionOpen(true)}
                  sx={{ fontWeight: 700, borderRadius: 2, fontSize: '0.78rem' }}
                >
                  Add Action Item
                </Button>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={actionOpen} onClose={() => setActionOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '0.95rem' }}>New Action Item for {record.Title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select size="small" label="Action Type" value={actionForm.actionType} onChange={(e) => setActionForm((f) => ({ ...f, actionType: e.target.value }))}>
              {['FollowUp', 'Task', 'Reminder', 'Approval', 'Review'].map((t) => (<MenuItem key={t} value={t}>{t}</MenuItem>))}
            </TextField>
            <TextField select size="small" label="Priority" value={actionForm.priority} onChange={(e) => setActionForm((f) => ({ ...f, priority: e.target.value }))}>
              {['High', 'Medium', 'Low'].map((p) => (<MenuItem key={p} value={p}>{p}</MenuItem>))}
            </TextField>
            <TextField size="small" type="date" label="Due Date" value={actionForm.dueDate} onChange={(e) => setActionForm((f) => ({ ...f, dueDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField size="small" label="Assigned To" value={actionForm.assignedTo} onChange={(e) => setActionForm((f) => ({ ...f, assignedTo: e.target.value }))} />
            <TextField size="small" multiline rows={2} label="Description" value={actionForm.description} onChange={(e) => setActionForm((f) => ({ ...f, description: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateAction} disabled={actionSaving || !actionForm.description.trim()}>
            {actionSaving ? 'Creating...' : 'Create Action'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Stack direction="row" spacing={1}>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#7B8FA6', minWidth: 120 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.84rem', color: color || '#1A1D23' }}>{value}</Typography>
    </Stack>
  );
}
