import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Link,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import TimelineIcon from '@mui/icons-material/Timeline';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import SearchIcon from '@mui/icons-material/Search';
import ShieldIcon from '@mui/icons-material/Shield';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BusinessIcon from '@mui/icons-material/Business';
import ChatIcon from '@mui/icons-material/Chat';
import DescriptionIcon from '@mui/icons-material/Description';
import { useNavigate } from 'react-router-dom';

type HelpSection = {
  icon: React.ElementType;
  title: string;
  summary: string;
  points: string[];
};

const SECTIONS: HelpSection[] = [
  {
    icon: DashboardIcon,
    title: 'Dashboard',
    summary: 'Live metrics, stage progress, activity trends, and the team leaderboard.',
    points: [
      'Live KPI cards cover contacts, rapport, stage movement, and deal performance.',
      'Activity charts summarise communications by month and support click-to-filter drilldowns.',
      'The relationship progress view reflects the Knowledge → Rapport → Intimacy model.',
      'The leaderboard ranks people using live workspace data, drawing on contacts, communications, deals, wins, and stage changes.',
      'Use the download action to export the current dashboard view as CSV.',
    ],
  },
  {
    icon: SmartToyIcon,
    title: 'AIROS',
    summary: 'The floating assistant that answers questions using your live KAIROS data.',
    points: [
      'Open AIROS from the floating button in the bottom-right corner of the screen.',
      'AIROS answers from your live contacts, engagements, communications, and workspace context.',
      'The assistant is read-only: it can analyse your data but cannot create or change records.',
      'Up to five conversations stay open at once — the plus button starts a new one.',
      'Ask questions in plain language, such as "Who is my latest engagement?", "Show my active deals", or "Who needs follow-up?".',
    ],
  },
  {
    icon: PeopleIcon,
    title: 'Contact List',
    summary: 'The contact registry and company view for onboarding and account management.',
    points: [
      'Use Contact List to search, review, and open contact records.',
      'Start a new contact from the plus button in the top bar, or from a company page.',
      'Company View groups contacts by company for company-level browsing.',
      'Duplicate checks catch repeated email addresses and phone numbers as you add contacts.',
      'Request access when you need a contact that is assigned to someone else.',
      'People see the contacts they own plus any shared with them. Administrators see the full registry.',
    ],
  },
  {
    icon: BusinessIcon,
    title: 'Company Page',
    summary: 'Company-level contact grouping and acumen document handling.',
    points: [
      'Open a company page to see every contact associated with that company.',
      'Use Add Contact on a company page to start a new record under the selected company.',
      'Company documents are stored per company in secure file storage.',
      'Uploading a new version replaces the previous file.',
      'PDFs and images preview in the app; other document types open in a new tab.',
    ],
  },
  {
    icon: DescriptionIcon,
    title: 'Contact Detail & Biodata',
    summary: 'Everything recorded about one contact: communications, biodata, and stage history.',
    points: [
      'A contact record is organised into tabs for Communications, Engagements, Stage History, Biodata, and Details.',
      'The summary card stays in place while the rest of the page scrolls.',
      'The Biodata tab holds extended profile fields, searchable pickers, and the profile photo upload.',
      'A new profile photo replaces the contact avatar everywhere it appears.',
      'The side panel shows the current stage, contact details, company, job title, and registration date.',
      'Owners and administrators can edit contact data. Shared access is read-only.',
    ],
  },
  {
    icon: TimelineIcon,
    title: 'Engagements',
    summary: 'The pipeline board for deal creation, stage tracking, and ownership.',
    points: [
      'Open Engagements to work the pipeline board.',
      'Use New Deal to create an engagement, link a contact, set the stage and value, and optionally assign an owner.',
      'Stages are Draft, Submitted, Won, and Lost.',
      'Stages can be updated directly from the deal card by the assigned owner or an administrator.',
      'Your saved deals stay on screen when you return to the page.',
      'Deals are visible only to the assigned owner and administrators.',
    ],
  },
  {
    icon: ChatIcon,
    title: 'Communications',
    summary: 'Log calls, emails, meetings, notes, and follow-up dates.',
    points: [
      'Use Log Interaction from a contact record to add a communication.',
      'Each entry captures the interaction type, subject, notes, and an optional follow-up date.',
      'Follow-up dates surface on the contact and feed your dashboard.',
      'Logged interactions also feed AIROS, which combines them with deals when answering questions about recent activity.',
    ],
  },
  {
    icon: AutoAwesomeOutlinedIcon,
    title: 'Automations',
    summary: 'Create reminders and scheduled messages from the Automation Centre.',
    points: [
      'Use New rule to create birthday, holiday, follow-up, or seasonal reminders.',
      'The form covers contact, automation type, trigger date, and message template.',
      'Rules persist between sessions, so you can leave the page and return without losing them.',
      'The notification bell surfaces assignment and access-request updates for you.',
    ],
  },
  {
    icon: PersonIcon,
    title: 'Profile',
    summary: 'Your personal dashboard for targets, activity, and deal progress.',
    points: [
      'Your profile is a personal performance dashboard rather than a contact list.',
      'It shows your name, department, photo, targets, active deals, won deals, and won revenue.',
      'Upload a profile photo to personalise your avatar everywhere in the app.',
      'If no targets have been set for you, the page says so rather than showing placeholder figures.',
    ],
  },
  {
    icon: SettingsIcon,
    title: 'Settings',
    summary: 'Theme, default home page, people management, and contact import.',
    points: [
      'Use Settings to switch theme and choose your default landing page.',
      'Administrators can add people, grant admin rights, and deactivate accounts from the people directory.',
      'Use contact import to bring records in from Excel or CSV.',
      'Your settings are saved to your account and follow you between devices.',
    ],
  },
  {
    icon: SearchIcon,
    title: 'Global Search',
    summary: 'The top-bar search that reaches across contacts, deals, activity, and people.',
    points: [
      'Search results update as you type from the fixed top header.',
      'Search spans contacts, engagements, communications, and people.',
      'Select a result to go straight to the matching record.',
      'Search is available on every page.',
    ],
  },
  {
    icon: ShieldIcon,
    title: 'Access & Confidentiality',
    summary: 'Role-based access keeps each person to the records they are entitled to see.',
    points: [
      'Administrators can see the full dataset.',
      'You can see a contact if you own it or have been granted access.',
      'Deals are visible only to the assigned owner and administrators.',
      'AIROS respects the same boundaries and will not cross between people.',
      'Accounts are limited to approved company email domains.',
    ],
  },
];

const SHORTCUTS = [
  { label: 'Dashboard', detail: 'Live metrics, charts, and leaderboard views.' },
  { label: 'AIROS', detail: 'Read-only assistant with live workspace context.' },
  { label: 'Contact List', detail: 'Create, search, and manage contact records.' },
  { label: 'Company Page', detail: 'Company grouping and acumen documents.' },
  { label: 'Engagements', detail: 'Deal pipeline and stage control.' },
  { label: 'Communications', detail: 'Log interactions and follow-ups.' },
  { label: 'Automations', detail: 'Scheduled reminders and message rules.' },
  { label: 'Profile', detail: 'Personal targets, performance, and revenue.' },
  { label: 'Settings', detail: 'Theme, home page, people, and import.' },
];

export default function HelpCenter() {
  const navigate = useNavigate();

  return (
    <Box sx={{ p: 3.5, maxWidth: 1320, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Chip
          icon={<AutoAwesomeIcon />}
          label="KAIROS Guide"
          sx={{ background: 'rgba(71,123,255,0.10)', color: '#477BFF', fontWeight: 700, borderRadius: 20, mb: 1.5 }}
        />
        <Typography sx={{ fontWeight: 800, fontSize: '1.7rem', color: '#111827' }}>
          How KAIROS works
        </Typography>
        <Typography sx={{ mt: 0.75, color: '#6B7280', maxWidth: 900, lineHeight: 1.75 }}>
          A reference for the features, shortcuts, and access model in KAIROS. It describes the product as it
          behaves today, so use it as the definitive answer to "where is this?" and "am I allowed to see it?".
        </Typography>
      </Box>

      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        {SHORTCUTS.map((item) => (
          <Grid key={item.label} item xs={12} sm={6} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: 2.25 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.98rem', color: '#111827' }}>
                  {item.label}
                </Typography>
                <Typography sx={{ mt: 0.7, color: '#6B7280', lineHeight: 1.7 }}>
                  {item.detail}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8}>
          <Stack spacing={1.5}>
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <Accordion
                  key={section.title}
                  defaultExpanded={section.title === 'AIROS'}
                  disableGutters
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1 }}>
                      <Box
                        sx={{
                          width: 42,
                          height: 42,
                          borderRadius: 2,
                          background: 'rgba(71,123,255,0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon sx={{ fontSize: 22, color: '#477BFF' }} />
                      </Box>
                      <Box>
                        <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#111827' }}>
                          {section.title}
                        </Typography>
                        <Typography sx={{ color: '#6B7280', fontSize: '0.84rem', mt: 0.2 }}>
                          {section.summary}
                        </Typography>
                      </Box>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <List dense sx={{ py: 0 }}>
                      {section.points.map((point) => (
                        <ListItem key={point} sx={{ px: 0, py: 0.3, alignItems: 'flex-start' }}>
                          <ListItemText
                            primary={point}
                            primaryTypographyProps={{
                              sx: { color: '#4B5563', lineHeight: 1.75, fontSize: '0.92rem' },
                            }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Stack>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Stack spacing={2.5}>
            <Card>
              <CardContent sx={{ p: 2.5 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#111827', mb: 1 }}>
                  Quick start
                </Typography>
                <List dense sx={{ py: 0 }}>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="1. Open Dashboard for live metrics, charts, and leaderboard status."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="2. Use Contact List or Company Page to create and manage contacts."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="3. Open Engagements to create deals and update stages in real time."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="4. Log interactions from a contact record and use follow-up dates when needed."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="5. Use Automations for reminders and scheduled messages."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="6. Open AIROS for live, read-only questions about your workspace."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>

            <Card>
              <CardContent sx={{ p: 2.5 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#111827', mb: 1 }}>
                  Current workspace rules
                </Typography>
                <List dense sx={{ py: 0 }}>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="Contacts are visible based on ownership and approved access."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="Deals are visible only to the assigned owner and administrators."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="AIROS reads your live contacts, deals, and communications, within the same access boundaries as the rest of the app."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="The notification bell shows assignment and access-request activity."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="The top search bar finds contacts, deals, communications, and people."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>

            <Card>
              <CardContent sx={{ p: 2.5 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#111827', mb: 1 }}>
                  AIROS prompt guidance
                </Typography>
                <List dense sx={{ py: 0 }}>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="Ask about your latest engagement, and AIROS will use both engagements and communications."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="Use questions like: 'Show my active deals', 'Who needs follow-up?', and 'What communications happened this week?'"
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="AIROS keeps up to five conversation windows so you can return to prior discussions."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <Card sx={{ mt: 3 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#111827', mb: 1 }}>
            Platform overview
          </Typography>
          <Typography sx={{ color: '#6B7280', lineHeight: 1.8 }}>
            KAIROS is the Konstructum group&apos;s relationship intelligence platform, built around the Knowledge
            {' → '} Rapport {' → '} Intimacy model. It covers the Dashboard, Contact List, Company pages, the
            Engagements pipeline, Communications, Automations, your Profile, Settings, Help, global search, notifications,
            and the AIROS assistant.
          </Typography>
          <Typography sx={{ mt: 1.25, color: '#6B7280', lineHeight: 1.8 }}>
            Contacts, deals, activity, and documents are stored together so every screen reflects the same live
            picture, and AIROS reads the same data within the same access boundaries as the rest of the app.
          </Typography>
          <Typography sx={{ mt: 1.5, color: '#6B7280' }}>
            Quick links:
            {' '}
            <Link component="button" type="button" underline="hover" onClick={() => navigate('/settings')} sx={{ color: '#477BFF', fontWeight: 600, background: 'none', border: 0, p: 0, cursor: 'pointer' }}>
              Settings
            </Link>
            {' · '}
            <Link component="button" type="button" underline="hover" onClick={() => navigate('/clients')} sx={{ color: '#477BFF', fontWeight: 600, background: 'none', border: 0, p: 0, cursor: 'pointer' }}>
              Contact List
            </Link>
            {' · '}
            <Link component="button" type="button" underline="hover" onClick={() => navigate('/engagements')} sx={{ color: '#477BFF', fontWeight: 600, background: 'none', border: 0, p: 0, cursor: 'pointer' }}>
              Engagements
            </Link>
            {' · '}
            <Link component="button" type="button" underline="hover" onClick={() => navigate('/profile')} sx={{ color: '#477BFF', fontWeight: 600, background: 'none', border: 0, p: 0, cursor: 'pointer' }}>
              Profile
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
