import React from 'react';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
};

export default class GemsErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: '' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      hasError: true,
      error,
      errorInfo: errorInfo.componentStack || '',
    });
    // Surface the fault in browser devtools as well.
    console.error('[GEMS] Unhandled render error', error, errorInfo);
  }

  render() {
    const { hasError, error, errorInfo } = this.state;
    if (hasError) {
      return (
        <Box sx={{ p: 3.5 }}>
          <Paper sx={{ p: 3.5, borderRadius: 3, border: '1px solid #E8ECF0', background: '#FFF8F8' }}>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <ErrorOutlineIcon sx={{ color: '#D32F2F', fontSize: 28 }} />
                <Box>
                  <Typography sx={{ fontWeight: 900, fontSize: '1.15rem', color: '#8B1A1A' }}>
                    GEMS failed to render
                  </Typography>
                  <Typography sx={{ color: '#6B7280', fontSize: '0.9rem' }}>
                    The application hit a runtime error before the dashboard could mount.
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ p: 2, borderRadius: 2, background: '#FFFFFF', border: '1px solid #F1D5D5', overflow: 'auto' }}>
                <Typography sx={{ fontWeight: 700, color: '#B71C1C', mb: 1 }}>
                  {error?.name || 'RenderError'}: {error?.message || 'Unknown error'}
                </Typography>
                {errorInfo && (
                  <Typography component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: '#6B7280', margin: 0 }}>
                    {errorInfo}
                  </Typography>
                )}
              </Box>

              <Typography sx={{ color: '#6B7280', fontSize: '0.85rem' }}>
                The failure is contained so this screen reports the exact fault instead of showing a blank page.
              </Typography>

              <Button
                variant="contained"
                onClick={() => window.location.reload()}
                sx={{ alignSelf: 'flex-start', borderRadius: 2, background: '#477BFF', '&:hover': { background: '#3568f5' } }}
              >
                Reload GEMS
              </Button>
            </Stack>
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}
