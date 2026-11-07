import React from 'react';
import ReactDom from 'react-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress, Typography } from '@mui/material';
import App from './webparts/kriPlatform/components/App';
import SignIn from './webparts/kriPlatform/components/SignIn';
import { createKriTheme } from './webparts/kriPlatform/theme/theme';
import { useAuth } from './services/session';

/**
 * KAIROS entry point.
 *
 * Replaces the SPFx web part, which bolted a fixed-position overlay onto
 * document.body and rendered the SPA into it. There is no host page any more,
 * so the app mounts straight into #root and owns the whole document.
 */

function Root() {
  const status = useAuth((state) => state.status);
  const context = useAuth((state) => state.context);
  const bootstrap = useAuth((state) => state.bootstrap);
  const theme = React.useMemo(() => createKriTheme('light'), []);

  React.useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === 'loading') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <CircularProgress sx={{ color: '#6757EF' }} />
          <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', letterSpacing: '0.08em' }}>
            KAIROS
          </Typography>
        </Box>
      </ThemeProvider>
    );
  }

  if (status === 'anonymous' || !context) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SignIn />
      </ThemeProvider>
    );
  }

  return <App context={context} />;
}

const container = document.getElementById('root');
if (container) {
  ReactDom.render(<Root />, container);
}
