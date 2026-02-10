import { create } from 'zustand';

interface MockStoreState {
  mockMode: boolean;
  mockAvailable: boolean;
  setMockMode: (mode: boolean) => void;
}

const mockAvailable = import.meta.env.VITE_ENABLE_MOCK_MODE === 'true';

export const useMockStore = create<MockStoreState>((set) => ({
  mockMode: false,
  mockAvailable,
  setMockMode: (mode) => set({ mockMode: mockAvailable && mode }),
}));
