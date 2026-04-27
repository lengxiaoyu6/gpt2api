import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  username: string;
  email: string;
  points: number;
  avatar?: string;
  isLoggedIn: boolean;
}

export interface GenerationRecord {
  id: string;
  prompt: string;
  imageUrl: string;
  type: 'text-to-image' | 'image-to-image';
  createdAt: number;
  pointsUsed: number;
}

interface AppState {
  user: User | null;
  history: GenerationRecord[];
  isDark: boolean;
  
  // Actions
  login: (username: string, email: string) => void;
  logout: () => void;
  addPoints: (amount: number) => void;
  usePoints: (amount: number) => boolean;
  addRecord: (record: GenerationRecord) => void;
  toggleTheme: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      history: [],
      isDark: true,

      login: (username, email) => set({
        user: {
          id: Math.random().toString(36).substring(7),
          username,
          email,
          points: 100, // Initial free points
          isLoggedIn: true,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
        }
      }),

      logout: () => set({ user: null }),

      addPoints: (amount) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, points: user.points + amount } });
        }
      },

      usePoints: (amount) => {
        const { user } = get();
        if (user && user.points >= amount) {
          set({ user: { ...user, points: user.points - amount } });
          return true;
        }
        return false;
      },

      addRecord: (record) => set((state) => ({
        history: [record, ...state.history]
      })),

      toggleTheme: () => set((state) => ({ isDark: !state.isDark })),

      updateUser: (updates) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ...updates } });
        }
      }
    }),
    {
      name: 'imagine-ai-storage',
    }
  )
);
