import { create } from 'zustand';
import { IClient, IComm, IKRIUser } from '../services/graphApi';
import { GemsInteractionRecord } from '../services/sharepointProvisioning';
import { filterGemsEligibleClients } from '../utils/gemsScope';
import { buildCompanySummaries } from '../utils/lookupHelpers';

interface GemsStoreState {
  gemsClients: IClient[];
  interactions: GemsInteractionRecord[];
  loading: boolean;

  setGemsClients: (clients: IClient[]) => void;
  setInteractions: (interactions: GemsInteractionRecord[]) => void;
  setLoading: (v: boolean) => void;

  getGemsClients: () => IClient[];
  getAgencies: () => ReturnType<typeof buildCompanySummaries>;
  getMonthInteractions: () => GemsInteractionRecord[];
  getMonthPoints: () => number;
  getTotalPoints: () => number;
  getInteractionStats: () => {
    crownJewel: number; pearl: number; coral: number; ruby: number;
    total: number; points: number;
  };
  getLeaderboard: () => Array<{ name: string; points: number; count: number; latest: GemsInteractionRecord | null }>;
}

export const useGemsStore = create<GemsStoreState>((set, get) => ({
  gemsClients: [],
  interactions: [],
  loading: false,

  setGemsClients: (clients) => set({ gemsClients: clients }),
  setInteractions: (interactions) => set({ interactions }),
  setLoading: (v) => set({ loading: v }),

  getGemsClients: () => filterGemsEligibleClients(get().gemsClients),

  getAgencies: () => buildCompanySummaries(filterGemsEligibleClients(get().gemsClients)),

  getMonthInteractions: () => {
    const now = new Date();
    return get().interactions.filter((i) => {
      const d = new Date(i.LoggedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  },

  getMonthPoints: () => {
    return get().getMonthInteractions().reduce((sum, i) => sum + Number(i.Points || 0), 0);
  },

  getTotalPoints: () => {
    return get().interactions.reduce((sum, i) => sum + Number(i.Points || 0), 0);
  },

  getInteractionStats: () => {
    const interactions = get().interactions;
    return {
      crownJewel: interactions.filter((i) => i.Category === 'Crown Jewel').length,
      pearl: interactions.filter((i) => i.Category === 'Pearl').length,
      coral: interactions.filter((i) => i.Category === 'Coral').length,
      ruby: interactions.filter((i) => i.Category === 'Ruby').length,
      total: interactions.length,
      points: interactions.reduce((sum, i) => sum + Number(i.Points || 0), 0),
      pendingReview: interactions.filter((i) => i.ReviewStatus === 'Pending Review' || i.ReviewStatus === 'Submitted').length,
      validated: interactions.filter((i) => i.ReviewStatus === 'Validated').length,
      rejected: interactions.filter((i) => i.ReviewStatus === 'Rejected').length,
    };
  },

  getLeaderboard: () => {
    const byUser = new Map<string, { points: number; count: number; latest: GemsInteractionRecord | null }>();
    get().interactions.forEach((interaction) => {
      const key = interaction.TargetUser || interaction.TargetUserId || 'Unassigned';
      const current = byUser.get(key) || { points: 0, count: 0, latest: null };
      current.points += Number(interaction.Points || 0);
      current.count += 1;
      if (!current.latest || new Date(interaction.LoggedAt).getTime() > new Date(current.latest.LoggedAt).getTime()) {
        current.latest = interaction;
      }
      byUser.set(key, current);
    });
    return Array.from(byUser.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.points - a.points || b.count - a.count);
  },
}));
