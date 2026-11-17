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
  TextField,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import LanOutlinedIcon from '@mui/icons-material/LanOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import airosLogo from '../assets/AIROS_Logo.png';
import konstructumLogo from '../assets/konstructum-logo.png';
import { familyFromEmail } from '../services/families';
import { useAuth } from '../../../services/session';
import { setKairosViewMode, KairosViewMode } from '../services/graphApi';
import { apiRequest } from '../../../types/kri';

const EXEMPT_EMAILS = ['mbello@konstructum.com', 'onechief011@gmail.com'];

const DEFAULT_DOMAINS = [
  { domain: 'konstructum.com', label: 'Konstructum' },
  { domain: 'pmt7integrated.com', label: 'PMT7' },
  { domain: 'interkonstruct.com', label: 'Interkonstruct' },
  { domain: 'ngneeredprojects.com', label: 'NGneered' },
  { domain: 'kcc.com', label: 'KCC' },
];

const KRI_LEDGER = [
  { index: '01', stage: 'Knowledge', desc: 'Corporate profiling & executive biodata', color: '#38BDF8' },
  { index: '02', stage: 'Rapport', desc: 'Active dialogue & tender alignment', color: '#FB923C' },
  { index: '03', stage: 'Intimacy', desc: 'Trusted partnership & contract execution', color: '#2DD4BF' },
];

export default function SignIn() {
  const theme = useTheme();
  const {
    login,
    loginWithSso,
    error,
    clearError,
    notice,
    clearNotice,
  } = useAuth();

  const [roleIntent, setRoleIntent] = useState<KairosViewMode>('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ssoBusy, setSsoBusy] = useState(false);
  const [domains, setDomains] = useState<Array<{ domain: string; label: string }>>(DEFAULT_DOMAINS);
  const [ssoEnabled, setSsoEnabled] = useState(true);

  const emailInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<{
      allowedDomains?: Array<{ domain: string; label: string; is_active?: boolean }>;
      ssoEnabled?: boolean;
    }>('/auth/login')
      .then((res) => {
        if (cancelled) return;
        if (Array.isArray(res?.allowedDomains) && res.allowedDomains.length > 0) {
          setDomains(res.allowedDomains.map((d) => ({ domain: d.domain, label: d.label })));
        }
        if (typeof res?.ssoEnabled === 'boolean') {
          setSsoEnabled(res.ssoEnabled);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const isDark = theme.palette.mode === 'dark';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textMuted = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#1E293B' : '#E2E8F0';

  const trimmedEmail = email.trim().toLowerCase();
  const emailDomainPart = trimmedEmail.includes('@') ? trimmedEmail.split('@')[1] || '' : '';
  const emailAllowed =
    !trimmedEmail
    || EXEMPT_EMAILS.includes(trimmedEmail)
    || (Boolean(emailDomainPart) && domains.some((d) => d.domain.toLowerCase() === emailDomainPart));
  const domainHint = domains.map((d) => `@${d.domain}`).join(', ');
  const detectedFamily = familyFromEmail(email);

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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || ssoBusy) return;
    setBusy(true);
    try {
      setKairosViewMode(roleIntent);
      await login(email.trim(), password);
    } catch {
      // Handled by store
    } finally {
      setBusy(false);
    }
  };

  const handleIntranetSso = async () => {
    if (busy || ssoBusy) return;
    if (!email.trim()) {
      emailInputRef.current?.focus();
      return;
    }
    setSsoBusy(true);
    try {
      setKairosViewMode(roleIntent);
      await loginWithSso({ email: email.trim() });
    } catch {
      // Handled by store
    } finally {
      setSsoBusy(false);
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
      {/* ── LEFT PANEL: Classic Architectural Brand & Ledger ───────────────── */}
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
              'radial-gradient(700px 400px at 15% 0%, rgba(79, 70, 229, 0.16) 0%, transparent 70%)',
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
            KAIROS
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
            KRI REGISTRY
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
            Relationship intelligence, structured for execution.
          </Typography>

          <Typography
            sx={{
              fontSize: '0.9rem',
              color: 'rgba(226, 232, 240, 0.68)',
              lineHeight: 1.6,
              mb: 4,
            }}
          >
            Unified stakeholder registry, executive biodata, and commercial pipeline across the Konstructum Group.
          </Typography>

          {/* Classic 3-Row KRI Ledger */}
          <Box
            sx={{
              borderTop: '1px solid rgba(255,255,255,0.1)',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {KRI_LEDGER.map((row, idx) => (
              <Stack
                key={row.stage}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{
                  py: 1.6,
                  borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <Stack direction="row" spacing={1.8} alignItems="center">
                  <Typography
                    sx={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: '0.72rem',
                      color: row.color,
                      fontWeight: 600,
                    }}
                  >
                    {row.index}
                  </Typography>
                  <Typography sx={{ fontSize: '0.86rem', fontWeight: 600, color: '#F8FAFC' }}>
                    {row.stage}
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: '0.78rem', color: 'rgba(226,232,240,0.56)' }}>
                  {row.desc}
                </Typography>
              </Stack>
            ))}
          </Box>
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

      {/* ── RIGHT PANEL: Corporate Authentication & Intranet SSO ───────────── */}
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
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          {/* Header */}
          <Box sx={{ mb: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Box
                sx={{
                  px: 1,
                  py: 0.3,
                  borderRadius: 1,
                  bgcolor: 'rgba(79, 70, 229, 0.1)',
                  color: '#4F46E5',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Corporate Intranet &amp; Identity
              </Box>
            </Stack>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: '1.5rem',
                letterSpacing: '-0.025em',
                color: textPrimary,
                mb: 0.5,
              }}
            >
              Sign in to KAIROS
            </Typography>
            <Typography sx={{ fontSize: '0.84rem', color: textMuted }}>
              Enter your provisioned corporate credentials or continue with Group Intranet SSO.
            </Typography>
          </Box>

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

              {/* Workspace Selector */}
              <Box>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: textMuted, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Sign in as
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 0.75,
                    p: 0.5,
                    borderRadius: 2,
                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
                    border: `1px solid ${border}`,
                  }}
                >
                  {([
                    { key: 'user', label: 'User Workspace', icon: <PersonOutlineIcon sx={{ fontSize: 16 }} /> },
                    { key: 'admin', label: 'Admin Workspace', icon: <ShieldOutlinedIcon sx={{ fontSize: 16 }} /> },
                  ] as const).map((opt) => {
                    const active = roleIntent === opt.key;
                    return (
                      <Button
                        key={opt.key}
                        type="button"
                        size="small"
                        startIcon={opt.icon}
                        onClick={() => setRoleIntent(opt.key)}
                        sx={{
                          py: 0.75,
                          borderRadius: 1.5,
                          textTransform: 'none',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          bgcolor: active ? (opt.key === 'admin' ? '#4F46E5' : '#FFFFFF') : 'transparent',
                          color: active ? (opt.key === 'admin' ? '#FFFFFF' : '#0F172A') : textMuted,
                          boxShadow: active ? '0 2px 6px rgba(15,23,42,0.08)' : 'none',
                          '&:hover': {
                            bgcolor: active ? (opt.key === 'admin' ? '#4338CA' : '#FFFFFF') : alpha(textPrimary, 0.04),
                          },
                        }}
                      >
                        {opt.label}
                      </Button>
                    );
                  })}
                </Box>
              </Box>

              {/* Work Email + Dynamic Domain Quick-Select */}
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
                    !emailAllowed ? 'Use an authorized corporate email address.' : undefined
                  }
                />
              </Box>

              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                size="small"
                fullWidth
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={
                  busy ||
                  ssoBusy ||
                  !email.trim() ||
                  !password ||
                  !emailAllowed
                }
                endIcon={!busy ? <ArrowForwardIcon sx={{ fontSize: 16 }} /> : undefined}
                startIcon={busy ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : undefined}
                sx={{
                  mt: 0.5,
                  py: 1.2,
                  borderRadius: 1.5,
                  fontWeight: 700,
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
                {busy ? 'Signing in…' : 'Sign in with Password'}
              </Button>

              {ssoEnabled && (
                <>
                  <Divider sx={{ my: 0.5 }}>
                    <Typography sx={{ fontSize: '0.7rem', color: textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      or Group Intranet SSO
                    </Typography>
                  </Divider>

                  <Button
                    type="button"
                    variant="outlined"
                    size="large"
                    disabled={busy || ssoBusy || !email.trim() || !emailAllowed}
                    onClick={() => void handleIntranetSso()}
                    startIcon={ssoBusy ? <CircularProgress size={16} /> : <LanOutlinedIcon sx={{ fontSize: 18 }} />}
                    sx={{
                      py: 1.1,
                      borderRadius: 1.5,
                      fontWeight: 700,
                      fontSize: '0.84rem',
                      textTransform: 'none',
                      borderColor: '#4F46E5',
                      color: '#4F46E5',
                      '&:hover': {
                        borderColor: '#4338CA',
                        backgroundColor: 'rgba(79, 70, 229, 0.06)',
                      },
                    }}
                  >
                    {ssoBusy ? 'Verifying Intranet Identity…' : 'Continue with Group Intranet SSO'}
                  </Button>
                </>
              )}
            </Stack>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
              border: `1px solid ${border}`,
            }}
          >
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <LockOutlinedIcon sx={{ fontSize: 16, color: '#4F46E5', mt: 0.25 }} />
              <Typography sx={{ fontSize: '0.73rem', color: textMuted, lineHeight: 1.55 }}>
                <strong>Managed Corporate Access:</strong> Public account creation is disabled. Only the{' '}
                <strong>Super Administrator</strong> can invite users and authorize corporate domains across KAIROS, GEMS, and the Group Intranet.
              </Typography>
            </Stack>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
