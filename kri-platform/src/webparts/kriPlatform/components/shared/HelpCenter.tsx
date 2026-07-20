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
      'The dashboard shows live KPI cards for contacts, rapport, stage movement, and deal performance.',
      'Activity charts summarize communications by month and support click-to-filter drilldowns.',
      'The relationship progress view reflects the Knowledge -> Rapport -> Intimacy pipeline.',
      'The leaderboard ranks users from live CRM data and updates from contacts, communications, deals, wins, and stage changes.',
      'Use the download action when you need a CSV export of the current dashboard view.',
    ],
  },
  {
    icon: SmartToyIcon,
    title: 'AIROS',
    summary: 'The floating assistant that answers questions using your live KAIROS data.',
    points: [
      'Open AIROS from the floating button at the bottom-right corner of the screen.',
      'AIROS uses live contacts, engagements, communications, and user context from the current site.',
      'The assistant is read-only. It can analyse your data, but it cannot create or modify records.',
      'The assistant keeps up to 5 conversation windows and the plus button starts a new window.',
      'AIROS now treats "latest engagement" as a deal-and-communications question, not a communications-only question.',
      'Ask natural language questions such as "Who is my latest engagement?", "Show my active deals", or "Who needs follow-up?"',
    ],
  },
  {
    icon: PeopleIcon,
    title: 'Contact List',
    summary: 'The contact registry and company view for onboarding and account management.',
    points: [
      'Use the Contact List route to search, review, and open client records.',
      'The Add Contact flow starts from the top-bar plus button and continues into the company onboarding flow.',
      'Company View groups contacts by company and supports company-level browsing.',
      'Duplicate checks help prevent repeated emails or phone numbers during onboarding.',
      'Access requests are used when a user needs access to a contact they do not own.',
      'Standard users see their own contacts and approved access only. Admins see the full registry.',
    ],
  },
  {
    icon: BusinessIcon,
    title: 'Company Page',
    summary: 'Company-level contact grouping and acumen document handling.',
    points: [
      'Open a company page to see the contacts that belong to that company.',
      'Use Add Contact on the company page to start a new client record under the selected company.',
      'Company acumen documents are stored in the KRI_AcumenFiles document library.',
      'Uploaded documents are stored under company-named folders and replace the prior file when updated.',
      'PDF and image files can be previewed in-app, while Office documents open in SharePoint Online.',
    ],
  },
  {
    icon: DescriptionIcon,
    title: 'Client Detail & Biodata',
    summary: 'The individual contact workspace for communications, biodata, and stage history.',
    points: [
      'The client detail page contains tabs for Communications, Engagements, Stage History, Biodata, and Details.',
      'The left summary card stays fixed while the rest of the page scrolls.',
      'The Biodata tab includes the extended profile fields, searchable pickers, and the profile photo upload.',
      'Profile photo updates in Biodata flow back into the contact avatar across the app.',
      'The contact side panel shows the current stage badge, contact details, company, job title, and registration date.',
      'Owners and admins can edit contact data. Approved shared access remains restricted by the visibility rules.',
    ],
  },
  {
    icon: TimelineIcon,
    title: 'Engagements',
    summary: 'The pipeline board for deal creation, stage tracking, and ownership.',
    points: [
      'Open the Engagements route to work with the pipeline board.',
      'Use New Deal to create a new engagement, assign a contact, set the stage, set the value, and optionally assign the deal owner.',
      'Stages are Draft, Submitted, Won, and Lost.',
      'The stage can be updated in real time from the engagement card by the assigned user or an admin.',
      'The close date field uses the current SharePoint column mapping, and the app keeps the saved deal visible when you return to the page.',
      'Only the assigned KRI user and admins should see a given engagement for confidentiality.',
    ],
  },
  {
    icon: ChatIcon,
    title: 'Communications',
    summary: 'Log calls, emails, meetings, notes, and follow-up dates.',
    points: [
      'Use Log Interaction from the client detail page to add a new communication.',
      'Communications capture the interaction type, subject, notes, and optional follow-up date.',
      'Follow-up scheduling uses the current FollowUpDate field mapping.',
      'Logged communications feed the dashboard, AIROS, and engagement context.',
      'AIROS uses communications together with engagements when answering latest-activity questions.',
    ],
  },
  {
    icon: AutoAwesomeOutlinedIcon,
    title: 'Automations',
    summary: 'Create reminders and scheduled messages from the Automation Centre.',
    points: [
      'Use New rule to create birthday, holiday, follow-up, or seasonal automation rules.',
      'The dialog includes a contact picker, automation type dropdown, trigger date, and message template.',
      'Dropdown menus now stay visible inside the dialog and are not hidden behind the workbench shell.',
      'Rules are stored in SharePoint and remain visible when you leave and return to the page.',
      'The header notification bell surfaces assignment and access-request updates for the current user.',
    ],
  },
  {
    icon: PersonIcon,
    title: 'Profile',
    summary: 'Your personal dashboard for targets, activity, and deal progress.',
    points: [
      'The profile page is a personal dashboard, not a contact list.',
      'It shows your name, department, photo, targets, active deals, won deals, and won revenue.',
      'It no longer lists contact cards on the profile page.',
      'If you have no targets yet, the page shows the empty target state instead of fabricating data.',
    ],
  },
  {
    icon: SettingsIcon,
    title: 'Settings',
    summary: 'Theme, default home page, user registry operations, and contact import.',
    points: [
      'Use Settings to switch theme and set your default landing page.',
      'Use the user registry reseed action to reconcile SharePoint identities into the KRI user list.',
      'Use the contact import action to bring contacts in from Excel when needed.',
      'The settings you change are stored per signed-in user.',
    ],
  },
  {
    icon: SearchIcon,
    title: 'Global Search',
    summary: 'The top-bar search that reaches across contacts, deals, activity, and profiles.',
    points: [
      'Search results update as you type from the fixed top header.',
      'The search spans contacts, engagements, communications, and profile references.',
      'Click a result to navigate directly to the matching record.',
      'The search box is available on every page through the app shell.',
    ],
  },
  {
    icon: ShieldIcon,
    title: 'Access & Confidentiality',
    summary: 'The app applies role-based access so users only see what they should see.',
    points: [
      'Admins can see the full platform dataset.',
      'A user can see a client if they own it or have approved access.',
      'Engagements are visible only to the assigned KRI user and admins.',
      'AIROS follows the same access scope and does not cross user boundaries.',
      'All data lives in SharePoint lists and libraries inside the KONSTRUCTUM site.',
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
  { label: 'Settings', detail: 'Theme, home page, import, and reseed tools.' },
];

export default function HelpCenter() {
  const navigate = useNavigate();

  return (
    <Box sx={{ p: 3.5, maxWidth: 1320, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Chip
          icon={<AutoAwesomeIcon />}
          label="KRI Platform Manual"
          sx={{ background: 'rgba(71,123,255,0.10)', color: '#477BFF', fontWeight: 700, borderRadius: 20, mb: 1.5 }}
        />
        <Typography sx={{ fontWeight: 800, fontSize: '1.7rem', color: '#111827' }}>
          Full user guide for the platform
        </Typography>
        <Typography sx={{ mt: 0.75, color: '#6B7280', maxWidth: 900, lineHeight: 1.75 }}>
          This page is the current source of truth for the KRI Platform. It reflects the live routes, the
          current access model, the updated automation and engagement flows, and the AIROS multi-window assistant.
          Use it as the reference for how the software behaves right now.
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
                      primary="4. Log interactions from client detail and use follow-up dates when needed."
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
                      primary="Engagements are visible only to the assigned KRI user and admins."
                      primaryTypographyProps={{ sx: { color: '#4B5563' } }}
                    />
                  </ListItem>
                  <ListItem sx={{ px: 0, py: 0.2 }}>
                    <ListItemText
                      primary="AIROS reads live contacts, engagements, and communications from the current site."
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
                      primary="The top search bar finds contacts, deals, communications, and profile references."
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
            The KRI Platform is a SharePoint-embedded CRM built around the Knowledge {'->'} Rapport {'->'} Intimacy relationship
            model. It currently includes the Dashboard, Contact List, Company Page, Engagements pipeline, Communications,
            Automations, User Profile, Settings, Help, global search, the notification bell, and the AIROS assistant.
            Data lives in SharePoint lists and libraries within the KONSTRUCTUM site, and AIROS uses the same live data
            scope as the rest of the app.
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
