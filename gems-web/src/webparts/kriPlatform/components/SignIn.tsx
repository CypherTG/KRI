import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ContentPasteRoundedIcon from '@mui/icons-material/ContentPasteRounded';
import airosLogo from '../assets/AIROS_Logo.png';
import konstructumLogo from '../assets/konstructum-logo.png';
import { ALLOWED_EMAIL_DOMAINS, isAllowedEmail } from '../services/allowedDomains';
import { familyFromEmail } from '../services/families';
import { useAuth } from '../../../services/session';

type Mode = 'signin' | 'register';

const EXEMPT_EMAILS = ['mbello@konstructum.com', 'onechief011@gmail.com'];

const DOMAINS = [
  { domain: 'konstructum.com', label: 'Konstructum' },
  { domain: 'pmt7integrated.com', label: 'PMT7' },
  { domain: 'interkonstruct.com', label: 'Interkonstruct' },
  { domain: 'ngneeredprojects.com', label: 'NGneered' },
];

const GEMSTONE_LEDGER = [
  { code: 'RUBY', metric: '45% · 1 PT', desc: 'Regulatory intelligence & early mapping', color: '#F87171' },
  { code: 'CORAL', metric: '60% · 3 PTS', desc: 'Directorate dialogue & technical alignment', color: '#FB923C' },
  { code: 'PEARL', metric: '75% · 5 PTS', desc: 'Internal advocacy & compliance endorsement', color: '#38BDF8' },
  { code: 'CROWN JEWEL', metric: '90% · EXEC', desc: 'Executive authority & final clearance', color: '#2DD4BF' },
];

const AGENCIES = ['NUPRC', 'NUIMS', 'NCDMB', 'NEPL', 'NNPC', 'NIMASA', 'ENSERV', 'NMDPRA'];

export default function SignIn() {
  const theme = useTheme();
  const {
    login,
    register,
    error,
    clearError,
    needsToken,
    notice,
    clearNotice,
    resendCode,
  } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);

  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const isDark = theme.palette.mode === 'dark';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textMuted = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#1E293B' : '#E2E8F0';

  const emailAllowed = isAllowedEmail(email, EXEMPT_EMAILS);
  const domainHint = ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(', ');
  const detectedFamily = familyFromEmail(email);

  const switchMode = (next: Mode) => {
    setMode(next);
    clearError();
    setToken('');
    setResendNote(null);
  };

  useEffect(() => {
    if (needsToken && notice && mode === 'register') {
      setMode('signin');
    }
  }, [needsToken, notice, mode]);

  const applyDomain = (domain: string) => {
    clearError();
    const trimmed = email.trim();
    const localPart = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed;
    setEmail(`${localPart || 'name'}@${domain}`);
    window.setTimeout(() => {
      emailInputRef.current?.focus();
      if (!localPart && emailInputRef.current) {
        emailInputRef.current.setSelectionRange(0, 4);
      }
    }, 20);
  };

  const handlePasteToken = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        setToken(clip.trim().toUpperCase().replace(/\s+/g, '').slice(0, 32));
      }
    } catch {
      // Ignore clipboard error
    }
  };

  const onResend = async () => {
    if (resendBusy || !email.trim()) return;
    setResendBusy(true);
    setResendNote(null);
    try {
      await resendCode(email.trim());
      setResendNote('If that address needs a code, one is on its way.');
    } catch {
      setResendNote('Could not send code right now.');
    } finally {
      setResendBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'signin') {
        await login(email.trim(), password, token ? token.trim().toUpperCase() : undefined);
      } else {
        await register({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          jobTitle: jobTitle.trim() || undefined,
        });
      }
    } catch {
      // Handled by store
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '46% 54%' },
        background: isDark ? '#0B111E' : '#FFFFFF',
      }}
    >
      {/* ── LEFT PANEL: Classic Architectural Brand & Regulatory Ledger ───── */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: { xs: 3.5, sm: 5, md: 6.5 },
          background: '#0A0F1D',
          color: '#F8FAFC',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'radial-gradient(700px 400px at 15% 0%, rgba(13, 148, 136, 0.16) 0%, transparent 70%)',
          }}
        />

        {/* Top Identity */}
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{ position: 'relative', zIndex: 1 }}
        >
          <Box
            component="img"
            src={konstructumLogo}
            alt="Konstructum"
            sx={{ width: 30, height: 30, objectFit: 'contain' }}
          />
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: '0.88rem',
              letterSpacing: '0.14em',
              color: '#F8FAFC',
            }}
          >
            GEMS
          </Typography>
          <Box
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: 1,
              border: '1px solid rgba(255,255,255,0.14)',
              fontSize: '0.64rem',
              fontFamily: '"JetBrains Mono", monospace',
              color: 'rgba(248,250,252,0.7)',
              letterSpacing: '0.06em',
            }}
          >
            PROJECT ONYX
          </Box>
        </Stack>

        {/* Center Editorial Title & Minimal Ledger */}
        <Box sx={{ my: { xs: 4, md: 0 }, maxWidth: 460, position: 'relative', zIndex: 1 }}>
          <Typography
            sx={{
              fontFamily: '"Instrument Serif", Georgia, serif',
              fontWeight: 400,
              fontSize: { xs: '2.35rem', sm: '2.85rem', md: '3.15rem' },
              lineHeight: 1.08,
              letterSpacing: '-0.015em',
              color: '#FFFFFF',
              mb: 2,
            }}
          >
            Regulatory advocacy &amp; compliance command.
          </Typography>

          <Typography
            sx={{
              fontSize: '0.9rem',
              color: 'rgba(226, 232, 240, 0.68)',
              lineHeight: 1.6,
              mb: 3.5,
            }}
          >
            Business Arm Monthly (BAM) scoring, stakeholder rosters, and permit governance across eight core agencies.
          </Typography>

          {/* Classic 4-Row Gemstone Ledger */}
          <Box
            sx={{
              borderTop: '1px solid rgba(255,255,255,0.1)',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              mb: 2.5,
            }}
          >
            {GEMSTONE_LEDGER.map((row, idx) => (
              <Stack
                key={row.code}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{
                  py: 1.35,
                  borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: row.color }} />
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#F8FAFC' }}>
                    {row.code}
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: '0.68rem',
                      color: row.color,
                    }}
                  >
                    {row.metric}
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: '0.76rem', color: 'rgba(226,232,240,0.56)' }}>
                  {row.desc}
                </Typography>
              </Stack>
            ))}
          </Box>

          {/* Monitored Agencies Monospace Strip */}
          <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
            {AGENCIES.map((ag) => (
              <Box
                key={ag}
                sx={{
                  px: 1,
                  py: 0.3,
                  borderRadius: 1,
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '0.66rem',
                  color: 'rgba(226,232,240,0.68)',
                }}
              >
                {ag}
              </Box>
            ))}
          </Stack>
        </Box>

        {/* Bottom Group Footer */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap={1.5}
          sx={{ position: 'relative', zIndex: 1, pt: 2, borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <Typography sx={{ fontSize: '0.72rem', color: 'rgba(226,232,240,0.48)', letterSpacing: '0.02em' }}>
            Konstructum · PMT7 Integrated · Interkonstruct · NGneered Projects
          </Typography>

          <Stack direction="row" spacing={0.8} alignItems="center">
            <Box
              component="img"
              src={airosLogo}
              alt="AIROS"
              sx={{ width: 15, height: 15, objectFit: 'contain', opacity: 0.8 }}
            />
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(226,232,240,0.58)' }}>
              AIROS Enabled
            </Typography>
          </Stack>
        </Stack>
      </Box>

      {/* ── RIGHT PANEL: Clean Classic Authentication Form ─────────────────── */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: { xs: 3, sm: 5, md: 6 },
          background: isDark ? '#0F172A' : '#FFFFFF',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 380 }}>
          {/* Header */}
          <Box sx={{ mb: 3 }}>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: '1.45rem',
                letterSpacing: '-0.025em',
                color: textPrimary,
                mb: 0.5,
              }}
            >
              {mode === 'signin' ? 'Sign in to GEMS' : 'Create your account'}
            </Typography>
            <Typography sx={{ fontSize: '0.84rem', color: textMuted }}>
              {mode === 'signin'
                ? 'Enter your corporate credentials to continue.'
                : 'Use your official group email address to register.'}
            </Typography>
          </Box>

          {/* Classic Tab Switcher */}
          <Tabs
            value={mode}
            onChange={(_, value) => switchMode(value)}
            variant="fullWidth"
            sx={{
              mb: 3,
              minHeight: 38,
              borderBottom: `1px solid ${border}`,
              '& .MuiTabs-indicator': {
                backgroundColor: textPrimary,
                height: 2,
              },
              '& .MuiTab-root': {
                minHeight: 38,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.84rem',
                color: textMuted,
                '&.Mui-selected': {
                  color: textPrimary,
                },
              },
            }}
          >
            <Tab value="signin" label="Sign in" />
            <Tab value="register" label="Create account" />
          </Tabs>

          <Box component="form" onSubmit={submit}>
            <Stack spacing={2}>
              {error && (
                <Alert
                  severity="error"
                  onClose={clearError}
                  sx={{ borderRadius: 1.5, fontSize: '0.8rem', py: 0.5 }}
                >
                  {error}
                </Alert>
              )}

              {notice && (
                <Alert
                  severity="info"
                  onClose={clearNotice}
                  sx={{ borderRadius: 1.5, fontSize: '0.8rem', py: 0.5 }}
                >
                  {notice}
                </Alert>
              )}

              {/* Email */}
              <Box>
                <TextField
                  inputRef={emailInputRef}
                  label="Work email"
                  type="email"
                  size="small"
                  fullWidth
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="name@konstructum.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={!emailAllowed}
                  InputProps={{
                    endAdornment: detectedFamily ? (
                      <InputAdornment position="end">
                        <Typography
                          sx={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            px: 0.8,
                            py: 0.2,
                            borderRadius: 1,
                            bgcolor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                            color: textMuted,
                          }}
                        >
                          {detectedFamily}
                        </Typography>
                      </InputAdornment>
                    ) : undefined,
                  }}
                  helperText={
                    !emailAllowed ? `Permitted domains: ${domainHint}` : undefined
                  }
                />

                {/* Minimal Domain Quick-Select */}
                <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap" sx={{ mt: 0.8 }}>
                  {DOMAINS.map((d) => {
                    const active = email.toLowerCase().endsWith(`@${d.domain}`);
                    return (
                      <Box
                        key={d.domain}
                        component="button"
                        type="button"
                        onClick={() => applyDomain(d.domain)}
                        sx={{
                          px: 0.9,
                          py: 0.3,
                          fontSize: '0.68rem',
                          fontFamily: '"JetBrains Mono", monospace',
                          borderRadius: 1,
                          border: `1px solid ${active ? textPrimary : border}`,
                          background: active
                            ? alpha(textPrimary, 0.06)
                            : 'transparent',
                          color: active ? textPrimary : textMuted,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          '&:hover': {
                            borderColor: textPrimary,
                            color: textPrimary,
                          },
                        }}
                      >
                        @{d.domain}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>

              {mode === 'register' && (
                <>
                  <TextField
                    label="Full name"
                    size="small"
                    fullWidth
                    autoComplete="name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                  <TextField
                    label="Job title"
                    size="small"
                    fullWidth
                    placeholder="e.g. Regulatory Affairs Lead"
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                  />
                </>
              )}

              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                size="small"
                fullWidth
                required
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                helperText={mode === 'register' ? 'Minimum 8 characters.' : undefined}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        edge="end"
                        onClick={() => setShowPassword((prev) => !prev)}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <VisibilityOffOutlinedIcon sx={{ fontSize: 17 }} />
                        ) : (
                          <VisibilityOutlinedIcon sx={{ fontSize: 17 }} />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              {/* Verification code field */}
              {mode === 'signin' && needsToken && (
                <Stack spacing={1}>
                  <TextField
                    label="Verification code"
                    size="small"
                    fullWidth
                    required
                    autoComplete="one-time-code"
                    value={token}
                    onChange={(event) => setToken(event.target.value.toUpperCase())}
                    placeholder="32-character emailed code"
                    inputProps={{
                      maxLength: 32,
                      style: {
                        letterSpacing: '0.1em',
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: '0.8rem',
                      },
                    }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => { void handlePasteToken(); }}
                            title="Paste code"
                          >
                            <ContentPasteRoundedIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                    helperText="Valid for 5 minutes."
                  />
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => { void onResend(); }}
                      disabled={resendBusy || busy}
                      sx={{ fontWeight: 600, p: 0, minWidth: 0, fontSize: '0.75rem', color: textPrimary }}
                    >
                      {resendBusy ? 'Sending…' : 'Resend code'}
                    </Button>
                    {resendNote && (
                      <Typography sx={{ fontSize: '0.72rem', color: textMuted }}>{resendNote}</Typography>
                    )}
                  </Stack>
                </Stack>
              )}

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={
                  busy ||
                  !email.trim() ||
                  !password ||
                  !emailAllowed ||
                  (mode === 'register' && password.length < 8)
                }
                endIcon={!busy ? <ArrowForwardIcon sx={{ fontSize: 16 }} /> : undefined}
                startIcon={busy ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : undefined}
                sx={{
                  mt: 0.5,
                  py: 1.2,
                  borderRadius: 1.5,
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  backgroundColor: isDark ? '#4F46E5' : '#0F172A',
                  color: '#FFFFFF',
                  boxShadow: 'none',
                  '&:hover': {
                    backgroundColor: isDark ? '#4338CA' : '#1E293B',
                    boxShadow: 'none',
                  },
                }}
              >
                {busy
                  ? 'Please wait…'
                  : mode === 'signin'
                    ? 'Sign in'
                    : 'Create account'}
              </Button>
            </Stack>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Typography sx={{ fontSize: '0.74rem', color: textMuted, lineHeight: 1.6 }}>
            Restricted to verified Konstructum Group accounts. Credentials are shared across KAIROS and GEMS.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
