import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TableSortLabel, TextField, MenuItem,
  CircularProgress, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions,
} from '@mui/material';
import { KriContext } from '../../../../types/kri';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { downloadCsv, escapeCsv } from '../../utils/exportCsv';
import { GEMS_ALLOWED_AGENCIES } from '../../utils/gemsScope';
import { getKRIUsers, IKRIUser } from '../../services/graphApi';
import { userDisplayName } from '../../utils/lookupHelpers';
import { GemsActionRecord, getActionRecords, createActionRecord, completeActionRecord, deleteActionRecord } from '../../services/gemsApi';

interface Props { context: KriContext; }

const PRIORITY_COLORS: Record<string, string> = { High: '#F44336', Medium: '#FF9800', Low: '#477BFF' };
const STATUS_COLORS: Record<string, string> = { Open: '#477BFF', InProgress: '#FF9800', Completed: '#00BFA5', Cancelled: '#7B8FA6', Deferred: '#FF7043' };
const ACTION_TYPES = ['FollowUp', 'Task', 'Reminder', 'Approval', 'Review', 'Notification'];
const BUSINESS_ENTITIES = ['INTERKONSTRUCT', 'KCC', 'PMT7', 'NGNEERED PROJECTS'];
const PRIORITIES = ['High', 'Medium', 'Low'];

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try { return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return dateStr; }
}

type SortField = 'Title' | 'Priority' | 'Status' | 'DueDate' | 'AssignedTo' | 'EntityName';
type SortDir = 'asc' | 'desc';

export default function GemsActionsPage({ context }: Props) {
  const [records, setRecords] = useState<GemsActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortField, setSortField] = useState<SortField>('DueDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterStatus, setFilterStatus] = useState<string>('open');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterAssignedTo, setFilterAssignedTo] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const fetchRecords = async () => {
    setLoading(true); setError('');
    try { setRecords(await getActionRecords(context)); }
    catch (err: any) { setError(String(err?.message || err || 'Failed to load action items')); }
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
    if (filterStatus === 'open') items = items.filter((r) => r.Status !== 'Completed' && r.Status !== 'Cancelled');
    else if (filterStatus === 'completed') items = items.filter((r) => r.Status === 'Completed');
    else if (filterStatus === 'overdue') items = items.filter((r) => {
      if (r.Status === 'Completed' || r.Status === 'Cancelled') return false;
      return !!r.DueDate && new Date(r.DueDate) < new Date();
    });
    if (filterPriority !== 'all') items = items.filter((r) => r.Priority === filterPriority);
    if (filterAssignedTo !== 'all') items = items.filter((r) => (r.AssignedTo || '') === filterAssignedTo);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((r) => r.Title.toLowerCase().includes(q) || r.EntityName.toLowerCase().includes(q) || r.AssignedTo.toLowerCase().includes(q) || r.Description.toLowerCase().includes(q));
    }
    items.sort((a, b) => {
      if (sortField === 'Priority') {
        const order = { High: 0, Medium: 1, Low: 2 };
        return sortDir === 'asc' ? (order[a.Priority as keyof typeof order] ?? 2) - (order[b.Priority as keyof typeof order] ?? 2) : (order[b.Priority as keyof typeof order] ?? 2) - (order[a.Priority as keyof typeof order] ?? 2);
      }
      const cmp = String(a[sortField] || '').localeCompare(String(b[sortField] || ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [records, filterStatus, filterPriority, filterAssignedTo, search, sortField, sortDir]);

  const handleSort = (field: SortField) => { if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); else { setSortField(field); setSortDir('asc'); } };

  const handleExport = () => {
    const fields: (keyof GemsActionRecord)[] = ['Title', 'EntityType', 'EntityId', 'EntityName', 'ActionType', 'Priority', 'Status', 'DueDate', 'CompletedDate', 'AssignedTo', 'Description'];
    downloadCsv(`gems-actions-${new Date().toISOString().slice(0, 10)}.csv`, [fields.map((f) => String(f)).join(','), ...filtered.map((r) => fields.map((f) => escapeCsv(r[f])).join(','))]);
  };

  const overdueCount = useMemo(() => records.filter((r) => r.Status !== 'Completed' && r.Status !== 'Cancelled' && !!r.DueDate && new Date(r.DueDate) < new Date()).length, [records]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
        <Typography sx={{ fontWeight: 900, fontSize: '1.15rem', color: '#1A1D23' }}>
          Action Items
          <Typography component="span" sx={{ fontSize: '0.85rem', color: '#7B8FA6', ml: 1, fontWeight: 600 }}>
            ({filtered.length} of {records.length}{overdueCount > 0 ? `, ${overdueCount} overdue` : ''})
          </Typography>
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<FileDownloadIcon />} onClick={handleExport} sx={{ fontWeight: 700, borderRadius: 2 }}>Export CSV</Button>
          <Button variant="outlined" size="small" startIcon={<RefreshIcon />} onClick={fetchRecords}>Refresh</Button>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Add Action</Button>
        </Stack>
      </Stack>

      {overdueCount > 0 && (
        <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid #F44336', background: '#FFF5F5', mb: 2 }}>
          <Typography sx={{ fontWeight: 700, color: '#F44336', fontSize: '0.88rem' }}>{overdueCount} action{overdueCount === 1 ? ' is' : 's are'} overdue — review and follow up.</Typography>
        </Paper>
      )}

      <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid #E8ECF0', mb: 2.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField size="small" label="Search" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 200 }} />
          <TextField select size="small" label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 140 }}>
            <MenuItem value="open">Open / In Progress</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="overdue">Overdue</MenuItem>
            <MenuItem value="all">All</MenuItem>
          </TextField>
          <TextField select size="small" label="Priority" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} sx={{ minWidth: 130 }}>
            <MenuItem value="all">All Priorities</MenuItem>
            {PRIORITIES.map((p) => (<MenuItem key={p} value={p}>{p}</MenuItem>))}
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
          <Typography sx={{ fontWeight: 700, color: '#1A1D23', mb: 0.5 }}>No action items found</Typography>
          <Typography sx={{ fontSize: '0.84rem', color: '#7B8FA6' }}>{records.length === 0 ? 'Create your first action item to start tracking tasks and follow-ups.' : 'Try adjusting your filters.'}</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 3, border: '1px solid #E8ECF0' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><TableSortLabel active={sortField === 'Title'} direction={sortField === 'Title' ? sortDir : 'asc'} onClick={() => handleSort('Title')}>Title</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sortField === 'EntityName'} direction={sortField === 'EntityName' ? sortDir : 'asc'} onClick={() => handleSort('EntityName')}>Entity</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sortField === 'Priority'} direction={sortField === 'Priority' ? sortDir : 'asc'} onClick={() => handleSort('Priority')}>Priority</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sortField === 'Status'} direction={sortField === 'Status' ? sortDir : 'asc'} onClick={() => handleSort('Status')}>Status</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sortField === 'DueDate'} direction={sortField === 'DueDate' ? sortDir : 'asc'} onClick={() => handleSort('DueDate')}>Due</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sortField === 'AssignedTo'} direction={sortField === 'AssignedTo' ? sortDir : 'asc'} onClick={() => handleSort('AssignedTo')}>Assigned To</TableSortLabel></TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((record) => {
                const isOverdue = record.Status !== 'Completed' && record.Status !== 'Cancelled' && !!record.DueDate && new Date(record.DueDate) < new Date();
                return (
                  <TableRow key={record.ID} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.84rem' }}>{record.Title}</Typography>
                      {record.Description && <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6', mt: 0.15 }}>{record.Description}</Typography>}
                    </TableCell>
                    <TableCell><Typography sx={{ fontSize: '0.84rem' }}>{record.EntityName || record.EntityType || '-'}</Typography></TableCell>
                    <TableCell><Chip label={record.Priority} size="small" sx={{ fontWeight: 700, fontSize: '0.72rem', background: `${PRIORITY_COLORS[record.Priority] || '#7B8FA6'}20`, color: PRIORITY_COLORS[record.Priority] || '#7B8FA6', borderRadius: 1.5 }} /></TableCell>
                    <TableCell><Chip label={record.Status} size="small" sx={{ fontWeight: 700, fontSize: '0.72rem', background: `${STATUS_COLORS[record.Status] || '#7B8FA6'}20`, color: STATUS_COLORS[record.Status] || '#7B8FA6', borderRadius: 1.5 }} /></TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.84rem', color: isOverdue ? '#F44336' : 'inherit', fontWeight: isOverdue ? 700 : 400 }}>
                        {formatDate(record.DueDate)}{isOverdue && ' overdue'}
                      </Typography>
                    </TableCell>
                    <TableCell><Typography sx={{ fontSize: '0.84rem' }}>{record.AssignedTo || '-'}</Typography></TableCell>
                    <TableCell align="right">
                      {record.Status !== 'Completed' && (
                        <Tooltip title="Mark completed"><IconButton size="small" onClick={() => completeActionRecord(context, record.ID).then(fetchRecords)}><CheckCircleIcon fontSize="small" /></IconButton></Tooltip>
                      )}
                      <Tooltip title="Delete"><IconButton size="small" onClick={() => { if (window.confirm(`Delete "${record.Title}"?`)) deleteActionRecord(context, record.ID).then(fetchRecords); }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CreateActionDialog open={createOpen} onClose={() => setCreateOpen(false)} context={context} onCreated={fetchRecords} />
    </Box>
  );
}

function CreateActionDialog({ open, onClose, context, onCreated }: {
  open: boolean; onClose: () => void; context: KriContext; onCreated: () => void;
}) {
  const [form, setForm] = useState({
    entityName: '',
    agency: '',
    assignedTo: '',
    actionType: 'Task',
    priority: 'Medium',
    dueDate: '',
    description: '',
  });
  const [users, setUsers] = useState<IKRIUser[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      entityName: '',
      agency: '',
      assignedTo: context?.pageContext?.user?.displayName || '',
      actionType: 'Task',
      priority: 'Medium',
      dueDate: '',
      description: '',
    });
    getKRIUsers(context).then(setUsers).catch(() => {});
  }, [open, context]);

  const handleCreate = async () => {
    if (!form.actionType.trim()) return;
    setSaving(true);
    try {
      const selectedUser = users.find((u) => userDisplayName(u) === form.assignedTo);
      await createActionRecord(context, {
        entityType: form.agency ? 'Agency' : 'System',
        entityId: form.agency || '',
        entityName: form.entityName.trim() || form.agency || form.description.trim().slice(0, 120) || form.actionType,
        actionType: form.actionType,
        priority: form.priority,
        dueDate: form.dueDate,
        assignedTo: form.assignedTo,
        assignedToId: selectedUser ? String(selectedUser.ID) : undefined,
        description: form.description,
      });
      onCreated(); onClose();
    } catch (err: any) { alert(String(err?.message || err || 'Failed to create action')); }
    finally { setSaving(false); }
  };

  const assigneeOptions = useMemo(() => {
    const names = new Set<string>();
    if (context?.pageContext?.user?.displayName) names.add(context.pageContext.user.displayName);
    users.forEach((u) => {
      const name = userDisplayName(u);
      if (name) names.add(name);
    });
    return Array.from(names).sort();
  }, [users, context]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, fontSize: '1rem' }}>New Action Item</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            size="small"
            label="Title / Subject"
            placeholder="e.g. Submit quarterly NUPRC compliance report"
            value={form.entityName}
            onChange={(e) => setForm((f) => ({ ...f, entityName: e.target.value }))}
          />
          <TextField
            select
            size="small"
            label="Agency / Entity"
            value={form.agency}
            onChange={(e) => setForm((f) => ({ ...f, agency: e.target.value }))}
          >
            <MenuItem value="">General / System</MenuItem>
            {BUSINESS_ENTITIES.map((e) => (<MenuItem key={e} value={e}>{e}</MenuItem>))}
            {GEMS_ALLOWED_AGENCIES.map((a) => (<MenuItem key={a} value={a}>{a}</MenuItem>))}
          </TextField>
          <TextField select size="small" label="Action Type" value={form.actionType} onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value }))} required>
            {ACTION_TYPES.map((t) => (<MenuItem key={t} value={t}>{t}</MenuItem>))}
          </TextField>
          <TextField select size="small" label="Priority" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
            {PRIORITIES.map((p) => (<MenuItem key={p} value={p}>{p}</MenuItem>))}
          </TextField>
          <TextField
            select
            size="small"
            label="Assigned To"
            value={form.assignedTo}
            onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
          >
            <MenuItem value="">Unassigned</MenuItem>
            {assigneeOptions.map((name) => (<MenuItem key={name} value={name}>{name}</MenuItem>))}
          </TextField>
          <TextField size="small" type="date" label="Due Date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
          <TextField size="small" multiline rows={2} label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={saving || !form.actionType.trim()}>{saving ? 'Creating...' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
}
