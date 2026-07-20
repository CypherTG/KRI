import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PeopleIcon from '@mui/icons-material/People';
import TimelineIcon from '@mui/icons-material/Timeline';
import SettingsIcon from '@mui/icons-material/Settings';
import SearchIcon from '@mui/icons-material/Search';

const FAQ = [
  {
    title: 'What GEMS does',
    body: 'GEMS logs stakeholder engagements, meeting notes, follow-up actions, and classification outcomes against synced SharePoint records, then credits points to the selected user.',
  },
  {
    title: 'Scoring model',
    body: 'Approvers/Crown Jewel are final decision-makers responsible for approvals, permits, and authorizations: 1 point. Recommenders/Pearl provide technical input and shape decisions before final approval: 5 points. Connectors/Coral facilitate introductions, access pathways, certifications, and permits: 3 points. Informators/Ruby provide insights, updates, and early information: 1 point.',
  },
  {
    title: 'Monthly target',
    body: 'The operating target is one consolidated 100-point monthly engagement target across the supported business arms. Entity and agency views show contribution and distribution, but they do not create separate targets per view.',
  },
  {
    title: 'Planning and follow-up',
    body: 'Every submission must be tied to a registered stakeholder, include a proposed classification, and carry a review status with optional follow-up dates for validation.',
  },
  {
    title: 'Compliance and documents',
    body: 'GEMS supports company acumen, regulatory correspondence, permits, licences, and executive reporting so the engagement history stays tied to the right record.',
  },
  {
    title: 'Synced data',
    body: 'GEMS reads the established SharePoint stakeholder and user lists. It filters the active surface to NUPRC, NUIMS, NCDMB, NEPL, NNPC, NIMASA, ENSERV, and NMDPRA and does not create a parallel registry.',
  },
];

export default function HelpCenter() {
  return (
    <Box sx={{ p: 3.5 }}>
      <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, border: '1px solid #E8ECF0', boxShadow: '0 18px 50px rgba(0,0,0,0.05)' }}>
        <Stack spacing={2.5}>
          <Box>
            <Chip icon={<AutoAwesomeIcon />} label="GEMS Manual" sx={{ background: 'rgba(71,123,255,0.10)', color: '#477BFF', fontWeight: 700 }} />
            <Typography sx={{ fontWeight: 900, fontSize: { xs: '1.45rem', md: '1.8rem' }, mt: 1.5 }}>
              Global Engagement Measurement System
            </Typography>
            <Typography sx={{ color: '#6B7280', mt: 0.8, maxWidth: 920 }}>
              Use this space to understand how the engagement workflow works, what each category means, and how to keep the SharePoint-backed records aligned with the GEMS brief.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip icon={<PeopleIcon />} label="Synced stakeholders" />
            <Chip icon={<TimelineIcon />} label="100-point target" />
            <Chip icon={<SearchIcon />} label="Document repository" />
            <Chip icon={<SettingsIcon />} label="Compliance tracking" />
          </Stack>

          <Divider />

          <Box>
            {FAQ.map((item) => (
              <Accordion key={item.title} sx={{ border: '1px solid #EEF2F7', mb: 1, borderRadius: 2, '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography sx={{ fontWeight: 700 }}>{item.title}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography sx={{ color: '#4A5568' }}>{item.body}</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
