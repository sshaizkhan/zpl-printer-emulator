import { create } from 'zustand';

const useConfigStore = create((set, get) => ({
  configs: {},
  tcpStatus: { running: false },
  labels: [],
  notifications: [],
  activeTab: 'printer',
  darkMode: localStorage.getItem('darkMode') === 'true',

  setConfigs: (configs) => set({ configs }),

  updateConfig: (key, value) =>
    set((state) => ({
      configs: { ...state.configs, [key]: value },
    })),

  setTcpStatus: (status) => set({ tcpStatus: status }),

  addLabel: (label) =>
    set((state) => ({
      labels: [label, ...state.labels].slice(0, 50),
    })),

  setLabels: (labels) => set({ labels }),
  clearLabels: () => set({ labels: [] }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        { ...notification, id: Date.now() + Math.random() },
        ...state.notifications,
      ].slice(0, 20),
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  setActiveTab: (tab) => set({ activeTab: tab }),

  toggleDarkMode: () =>
    set((state) => {
      const newMode = !state.darkMode;
      localStorage.setItem('darkMode', newMode);
      return { darkMode: newMode };
    }),
}));

export default useConfigStore;
