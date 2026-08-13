import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  Stack,
  Alert,
  LinearProgress,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  FormControlLabel,
  Switch,
  IconButton,
  Tooltip,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditNoteIcon from '@mui/icons-material/EditNote';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CloseIcon from '@mui/icons-material/Close';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { useStore } from '../../store/useStore';
import {
  parseContactSpreadsheet,
  executeBulkImport,
  downloadContactTemplate,
  SpreadsheetParseResult,
  BulkImportSummary,
} from '../../utils/excelImportEngine';
import { getClients } from '../../services/graphApi';
import KriStageBadge from '../shared/KriStageBadge';

interface Props {
  context: WebPartContext;
  open: boolean;
  onClose: () => void;
  onImportComplete?: (summary: BulkImportSummary) => void;
}

export default function BulkImportModal({ context, open, onClose, onImportComplete }: Props) {
  const { clients, setClients } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'summary'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<SpreadsheetParseResult | null>(null);

  // Options
  const [sendIncompleteToDrafts, setSendIncompleteToDrafts] = useState(true);
  const [updateDuplicates, setUpdateDuplicates] = useState(true);

  // Progress & Results
  const [progress, setProgress] = useState<{ current: number; total: number; created: number; updated: number; drafts: number } | null>(null);
  const [importSummary, setImportSummary] = useState<BulkImportSummary | null>(null);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setParsing(true);
    setParseError(null);
    try {
      const result = await parseContactSpreadsheet(file, clients);
      setParseResult(result);
      setStep('preview');
    } catch (err: any) {
      console.error('[BulkImportModal] Parse error:', err);
      setParseError(err?.message || 'Failed to read spreadsheet. Please ensure it is a valid .xlsx, .xls, or .csv file.');
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    void handleFile(file);
  };

  const handleStartImport = async () => {
    if (!parseResult) return;
    setStep('importing');
    setProgress({ current: 0, total: parseResult.totalRows, created: 0, updated: 0, drafts: 0 });

    try {
      const summary = await executeBulkImport(context, parseResult, {
        sendIncompleteToDrafts,
        updateDuplicates,
        onProgress: (p) => {
          setProgress({
            current: p.current,
            total: p.total,
            created: p.created,
            updated: p.updated,
            drafts: p.drafts,
          });
        },
      });

      // Refresh store with latest contacts
      const updatedClients = await getClients(context).catch(() => []);
      if (updatedClients.length) {
        setClients(updatedClients);
      }

      setImportSummary(summary);
      setStep('summary');
      onImportComplete?.(summary);
    } catch (err: any) {
      console.error('[BulkImportModal] Import error:', err);
      setParseError(err?.message || 'Import encountered an error.');
      setStep('preview');
    }
  };

  const handleReset = () => {
    setStep('upload');
    setParseResult(null);
    setParseError(null);
    setProgress(null);
    setImportSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDialogClose = () => {
    if (step === 'importing') return; // prevent closing while importing
    handleReset();
    onClose();
  };

  const progressPct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <Dialog
      open={open}
      fullWidth
      maxWidth="md"
      onClose={handleDialogClose}
      scroll="paper"
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100dvh - 32px)',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, borderBottom: '1px solid #E8ECF0' }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#1A1D23' }}>
            Bulk Import Contacts from Excel / CSV
          </Typography>
          <Typography sx={{ fontSize: '0.82rem', color: '#7B8FA6', mt: 0.25 }}>
            Upload spreadsheets with contacts across multiple companies with auto-population and draft routing.
          </Typography>
        </Box>
        <IconButton onClick={handleDialogClose} disabled={step === 'importing'} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3, flex: 1, overflowY: 'auto' }}>
        {/* ── STEP 1: UPLOAD ── */}
        {step === 'upload' && (
          <Stack spacing={3}>
            {parseError && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {parseError}
              </Alert>
            )}

            {/* Drop Zone */}
            <Box
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: '2px dashed',
                borderColor: dragOver ? '#6757EF' : '#CBD5E1',
                borderRadius: 3,
                p: 5,
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? 'rgba(103, 87, 239, 0.05)' : '#FAFBFC',
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: '#6757EF',
                  background: 'rgba(103, 87, 239, 0.03)',
                },
              }}
            >
              <CloudUploadIcon sx={{ fontSize: 56, color: '#6757EF', mb: 1.5 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#1A1D23', mb: 0.5 }}>
                Drag and drop your spreadsheet here
              </Typography>
              <Typography sx={{ fontSize: '0.85rem', color: '#6B7280', mb: 2 }}>
                Supports Microsoft Excel (<strong>.xlsx</strong>, <strong>.xls</strong>) and <strong>.csv</strong> files
              </Typography>
              <Button variant="contained" sx={{ borderRadius: 2, fontWeight: 700, px: 3 }}>
                Choose File from Computer
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </Box>

            {/* Template Download & Guide */}
            <Box sx={{ p: 2.5, borderRadius: 2.5, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: '#1E293B' }}>
                    Need a formatted spreadsheet template?
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: '#64748B', mt: 0.25 }}>
                    Download our sample template containing recommended column headers and multi-company rows.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={() => downloadContactTemplate('xlsx')}
                    sx={{ borderRadius: 2, fontWeight: 700 }}
                  >
                    Download Excel (.xlsx)
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={() => downloadContactTemplate('csv')}
                    sx={{ borderRadius: 2, fontWeight: 700 }}
                  >
                    Download CSV
                  </Button>
                </Stack>
              </Box>
            </Box>

            {/* Features Highlight */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: '1px solid #E8ECF0' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: '#1A1D23', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleOutlineIcon sx={{ color: '#00BFA5', fontSize: 20 }} /> Auto-populate Companies
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: '#6B7280', mt: 0.5 }}>
                  Contacts from various companies will be automatically sorted and mapped into the company registry.
                </Typography>
              </Box>
              <Box sx={{ p: 2, borderRadius: 2, border: '1px solid #E8ECF0' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: '#1A1D23', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EditNoteIcon sx={{ color: '#D97706', fontSize: 20 }} /> Intelligent Draft Routing
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: '#6B7280', mt: 0.5 }}>
                  Incomplete records without full phone/email details are automatically routed into Drafts for later completion.
                </Typography>
              </Box>
            </Box>
          </Stack>
        )}

        {/* ── STEP 2: PREVIEW & REVIEW ── */}
        {step === 'preview' && parseResult && (
          <Stack spacing={2.5}>
            {/* Summary Cards */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip
                label={`Total Rows: ${parseResult.totalRows}`}
                sx={{ fontWeight: 700, background: '#F1F5F9', color: '#334155' }}
              />
              <Chip
                icon={<CheckCircleOutlineIcon />}
                label={`Ready to Activate: ${parseResult.readyRows.length}`}
                color="success"
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
              <Chip
                icon={<EditNoteIcon />}
                label={`Incomplete → Drafts: ${parseResult.draftRows.length}`}
                sx={{ fontWeight: 700, background: 'rgba(245, 158, 11, 0.12)', color: '#D97706', borderColor: '#D97706' }}
              />
              {parseResult.duplicateRows.length > 0 && (
                <Chip
                  icon={<WarningAmberIcon />}
                  label={`Existing Duplicates: ${parseResult.duplicateRows.length}`}
                  color="info"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              )}
              {parseResult.invalidRows.length > 0 && (
                <Chip
                  icon={<ErrorOutlineIcon />}
                  label={`Empty/Skipped: ${parseResult.invalidRows.length}`}
                  color="default"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              )}
            </Box>

            {/* Companies Detected */}
            {parseResult.uniqueCompanies.length > 0 && (
              <Box sx={{ p: 1.5, borderRadius: 2, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', mb: 0.75 }}>
                  COMPANIES DETECTED ({parseResult.uniqueCompanies.length}):
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {parseResult.uniqueCompanies.map((co) => (
                    <Chip key={co} label={co} size="small" sx={{ fontWeight: 600 }} />
                  ))}
                </Box>
              </Box>
            )}

            {/* Settings Options */}
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', py: 1, borderTop: '1px solid #E8ECF0', borderBottom: '1px solid #E8ECF0' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={sendIncompleteToDrafts}
                    onChange={(e) => setSendIncompleteToDrafts(e.target.checked)}
                    color="warning"
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
                      Send incomplete contacts to Drafts
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#64748B' }}>
                      Incomplete profiles are saved as Drafts so your team can fill missing details later.
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={updateDuplicates}
                    onChange={(e) => setUpdateDuplicates(e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
                      Update existing contacts
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#64748B' }}>
                      Populates missing fields on already registered contacts.
                    </Typography>
                  </Box>
                }
              />
            </Box>

            {/* Preview Table */}
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23' }}>
              Data Preview ({parseResult.allRows.length} rows):
            </Typography>
            <Box sx={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #E8ECF0', borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, background: '#F8FAFC' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, background: '#F8FAFC' }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 700, background: '#F8FAFC' }}>Company</TableCell>
                    <TableCell sx={{ fontWeight: 700, background: '#F8FAFC' }}>Role</TableCell>
                    <TableCell sx={{ fontWeight: 700, background: '#F8FAFC' }}>Contact Info</TableCell>
                    <TableCell sx={{ fontWeight: 700, background: '#F8FAFC' }}>Notes / Validation</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parseResult.allRows.slice(0, 50).map((row) => (
                    <TableRow key={row.rowIndex} hover>
                      <TableCell>
                        {row.status === 'ready' && <KriStageBadge stage="Knowledge" size="small" />}
                        {row.status === 'draft' && <KriStageBadge stage="Draft" size="small" />}
                        {row.status === 'duplicate' && (
                          <Chip label="Update Existing" size="small" color="info" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
                        )}
                        {row.status === 'invalid' && (
                          <Chip label="Invalid Row" size="small" color="default" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
                        )}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {row.data.FirstName || row.data.LastName ? `${row.data.FirstName || ''} ${row.data.LastName || ''}`.trim() : '—'}
                      </TableCell>
                      <TableCell sx={{ color: '#475569' }}>
                        {row.data.CompanyName || '—'}
                      </TableCell>
                      <TableCell sx={{ color: '#475569' }}>
                        {row.data.JobTitle || '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>
                        {row.data.Email && <div>{row.data.Email}</div>}
                        {row.data.Phone && <div style={{ color: '#64748B' }}>{row.data.Phone}</div>}
                        {!row.data.Email && !row.data.Phone && <span style={{ color: '#94A3B8' }}>No contact info</span>}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: row.status === 'draft' ? '#D97706' : '#64748B' }}>
                        {row.reasons.join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            {parseResult.allRows.length > 50 && (
              <Typography sx={{ fontSize: '0.78rem', color: '#64748B', textAlign: 'center' }}>
                Showing first 50 of {parseResult.allRows.length} rows
              </Typography>
            )}
          </Stack>
        )}

        {/* ── STEP 3: IMPORTING ── */}
        {step === 'importing' && progress && (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', color: '#1A1D23', mb: 1 }}>
              Importing Contacts to KAIROS…
            </Typography>
            <Typography sx={{ fontSize: '0.88rem', color: '#64748B', mb: 3 }}>
              Processing row {progress.current} of {progress.total}
            </Typography>

            <Box sx={{ maxWidth: 450, mx: 'auto', mb: 2 }}>
              <LinearProgress
                variant="determinate"
                value={progressPct}
                sx={{ height: 10, borderRadius: 5 }}
              />
            </Box>
            <Typography sx={{ fontWeight: 800, color: '#6757EF', fontSize: '1.1rem' }}>
              {progressPct}%
            </Typography>

            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 3 }}>
              <Chip label={`Created Active: ${progress.created}`} color="success" size="small" />
              <Chip label={`Saved Drafts: ${progress.drafts}`} sx={{ background: 'rgba(245, 158, 11, 0.15)', color: '#D97706', fontWeight: 700 }} size="small" />
              <Chip label={`Updated: ${progress.updated}`} color="info" size="small" />
            </Box>
          </Box>
        )}

        {/* ── STEP 4: SUMMARY RESULTS ── */}
        {step === 'summary' && importSummary && (
          <Stack spacing={3} sx={{ py: 2 }}>
            <Box sx={{ textAlign: 'center' }}>
              <CheckCircleOutlineIcon sx={{ fontSize: 64, color: '#00BFA5', mb: 1 }} />
              <Typography sx={{ fontWeight: 800, fontSize: '1.3rem', color: '#1A1D23' }}>
                Bulk Import Completed Successfully!
              </Typography>
              <Typography sx={{ fontSize: '0.85rem', color: '#64748B', mt: 0.5 }}>
                Your contacts and companies have been imported and synchronized with SharePoint.
              </Typography>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              <Box sx={{ p: 2.5, borderRadius: 2.5, background: 'rgba(0, 191, 165, 0.08)', textAlign: 'center', border: '1px solid rgba(0, 191, 165, 0.2)' }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1.6rem', color: '#00897B' }}>
                  {importSummary.created}
                </Typography>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#00695C' }}>
                  Active Contacts Created
                </Typography>
              </Box>

              <Box sx={{ p: 2.5, borderRadius: 2.5, background: 'rgba(245, 158, 11, 0.08)', textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1.6rem', color: '#D97706' }}>
                  {importSummary.drafts}
                </Typography>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#B45309' }}>
                  Draft Contacts Saved
                </Typography>
              </Box>

              <Box sx={{ p: 2.5, borderRadius: 2.5, background: 'rgba(33, 150, 243, 0.08)', textAlign: 'center', border: '1px solid rgba(33, 150, 243, 0.2)' }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1.6rem', color: '#1976D2' }}>
                  {importSummary.updated}
                </Typography>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#1565C0' }}>
                  Existing Contacts Updated
                </Typography>
              </Box>
            </Box>

            {importSummary.errors.length > 0 && (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  {importSummary.errors.length} row(s) encountered warnings during import:
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2, mt: 0.5, fontSize: '0.78rem' }}>
                  {importSummary.errors.slice(0, 5).map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                  {importSummary.errors.length > 5 && <li>…and {importSummary.errors.length - 5} more</li>}
                </Box>
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #E8ECF0', background: '#FFFFFF' }}>
        {step === 'upload' && (
          <>
            <Button onClick={handleDialogClose} sx={{ borderRadius: 2, fontWeight: 700 }}>
              Cancel
            </Button>
          </>
        )}

        {step === 'preview' && (
          <>
            <Button onClick={handleReset} sx={{ borderRadius: 2, fontWeight: 700 }}>
              Choose Different File
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={handleDialogClose} sx={{ borderRadius: 2, fontWeight: 700 }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => void handleStartImport()}
              sx={{ borderRadius: 2, fontWeight: 700, px: 3 }}
            >
              Start Import ({parseResult?.readyRows.length || 0} Active, {sendIncompleteToDrafts ? parseResult?.draftRows.length || 0 : 0} Drafts)
            </Button>
          </>
        )}

        {step === 'summary' && (
          <>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              onClick={handleDialogClose}
              sx={{ borderRadius: 2, fontWeight: 700, px: 4 }}
            >
              Done & View Contacts
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
