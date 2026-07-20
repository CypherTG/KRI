import React from 'react';
import { Box } from '@mui/material';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import GemsInteractionWorkspace from './GemsInteractionWorkspace';

export default function GemsBoard({ context }: { context: WebPartContext }) {
  return (
    <Box sx={{ p: 3.5 }}>
      <GemsInteractionWorkspace
        context={context}
        title="GEMS"
        description="Global Engagement Measurement System for stakeholder mapping, regulatory engagement, executive reporting, and monthly scoring. GEMS reads eligible live stakeholders for NUPRC, NUIMS, NCDMB, NEPL, NNPC, NIMASA, ENSERV, and NMDPRA, then logs classified interactions without creating a parallel registry."
        showLeaderboard
      />
    </Box>
  );
}
