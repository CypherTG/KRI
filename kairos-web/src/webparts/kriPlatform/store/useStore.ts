import { create } from 'zustand';
import { IClient, IComm, IEngagement, IAutomation, IKRIUser, IStageChange } from '../services/graphApi';

interface KRIStore {
  // Data
  clients: IClient[];
  comms: IComm[];
  engagements: IEngagement[];
  automations: IAutomation[];
  users: IKRIUser[];
  stageHistory: IStageChange[];
  currentUserProfile: IKRIUser | null;

  // UI state
  loadingClients: boolean;
  loadingEngagements: boolean;
  loadingComms: boolean;
  loadingAutomations: boolean;
  loadingUsers: boolean;
  error: string | null;

  // Client actions
  setClients: (clients: IClient[]) => void;
  setLoadingClients: (v: boolean) => void;
  addClient: (client: IClient) => void;
  updateClientInStore: (id: string, updates: Partial<IClient>) => void;

  // Engagement actions
  setEngagements: (engagements: IEngagement[]) => void;
  setLoadingEngagements: (v: boolean) => void;
  addEngagement: (eng: IEngagement) => void;
  updateEngagementInStore: (id: string, updates: Partial<IEngagement>) => void;

  // Communication actions
  setComms: (comms: IComm[]) => void;
  setLoadingComms: (v: boolean) => void;
  addComm: (comm: IComm) => void;

  // Automation actions
  setAutomations: (automations: IAutomation[]) => void;
  setLoadingAutomations: (v: boolean) => void;
  addAutomation: (auto: IAutomation) => void;
  updateAutomationInStore: (id: string, updates: Partial<IAutomation>) => void;
  removeAutomation: (id: string) => void;

  // User actions
  setUsers: (users: IKRIUser[]) => void;
  setLoadingUsers: (v: boolean) => void;
  setCurrentUserProfile: (user: IKRIUser | null) => void;

  // Stage history
  setStageHistory: (history: IStageChange[]) => void;

  // Error
  setError: (error: string | null) => void;

  // Computed
  getClientById: (id: string) => IClient | undefined;
  getEngagementsByStage: (stage: string) => IEngagement[];
  getCommsByClient: (clientId: string) => IComm[];
  getKRIStats: () => { totalClients: number; knowledge: number; rapport: number; intimacy: number; activeDeals: number; wonDeals: number; totalPipelineValue: number; wonValue: number };
}

export const useStore = create<KRIStore>((set, get) => ({
  clients: [],
  comms: [],
  engagements: [],
  automations: [],
  users: [],
  stageHistory: [],
  currentUserProfile: null,

  loadingClients: false,
  loadingEngagements: false,
  loadingComms: false,
  loadingAutomations: false,
  loadingUsers: false,
  error: null,

  // Clients
  setClients: (clients) => set({ clients }),
  setLoadingClients: (v) => set({ loadingClients: v }),
  addClient: (client) => set((s) => ({ clients: [client, ...s.clients] })),
  updateClientInStore: (id, updates) => set((s) => ({
    clients: s.clients.map((c) => c.ID === id ? { ...c, ...updates } : c),
  })),

  // Engagements
  setEngagements: (engagements) => set({ engagements }),
  setLoadingEngagements: (v) => set({ loadingEngagements: v }),
  addEngagement: (eng) => set((s) => ({ engagements: [eng, ...s.engagements] })),
  updateEngagementInStore: (id, updates) => set((s) => ({
    engagements: s.engagements.map((e) => e.ID === id ? { ...e, ...updates } : e),
  })),

  // Comms
  setComms: (comms) => set({ comms }),
  setLoadingComms: (v) => set({ loadingComms: v }),
  addComm: (comm) => set((s) => ({ comms: [comm, ...s.comms] })),

  // Automations
  setAutomations: (automations) => set({ automations }),
  setLoadingAutomations: (v) => set({ loadingAutomations: v }),
  addAutomation: (auto) => set((s) => ({ automations: [auto, ...s.automations] })),
  updateAutomationInStore: (id, updates) => set((s) => ({
    automations: s.automations.map((a) => a.ID === id ? { ...a, ...updates } : a),
  })),
  removeAutomation: (id) => set((s) => ({ automations: s.automations.filter((a) => a.ID !== id) })),

  // Users
  setUsers: (users) => set({ users }),
  setLoadingUsers: (v) => set({ loadingUsers: v }),
  setCurrentUserProfile: (user) => set({ currentUserProfile: user }),

  // Stage history
  setStageHistory: (history) => set({ stageHistory: history }),

  // Error
  setError: (error) => set({ error }),

  // Computed selectors
  getClientById: (id) => get().clients.find((c) => c.ID === id),
  getEngagementsByStage: (stage) => get().engagements.filter((e) => e.Stage === stage),
  getCommsByClient: (clientId) => get().comms.filter((c) => c.ClientID === clientId),
  getKRIStats: () => {
    const { clients, engagements } = get();
    const knowledge = clients.filter((c) => c.KRIStage === 'Knowledge').length;
    const rapport = clients.filter((c) => c.KRIStage === 'Rapport').length;
    const intimacy = clients.filter((c) => c.KRIStage === 'Intimacy').length;
    const activeDeals = engagements.filter((e) => e.Stage === 'Draft' || e.Stage === 'Submitted').length;
    const wonDeals = engagements.filter((e) => e.Stage === 'Won').length;
    const totalPipelineValue = engagements.reduce((acc, e) => acc + (Number(e.EstimatedValue) || 0), 0);
    const wonValue = engagements.filter((e) => e.Stage === 'Won').reduce((acc, e) => acc + (Number(e.ActualValue) || Number(e.EstimatedValue) || 0), 0);
    return { totalClients: clients.length, knowledge, rapport, intimacy, activeDeals, wonDeals, totalPipelineValue, wonValue };
  },
}));
