import { create } from 'zustand';

const useConfigStore = create((set, get) => ({
  // Multi-printer state
  printers: [],
  activePrinterId: null,
  tcpStatuses: {},
  labelsByPrinter: {},

  // Shared state
  notifications: [],
  activeTab: 'printer',
  darkMode: localStorage.getItem('darkMode') === 'true',

  // ── Printer management ──────────────────────────────────────────
  setPrintersState: ({ printers, activePrinterId, tcpStatuses, labelHistories }) =>
    set({
      printers,
      activePrinterId,
      tcpStatuses: tcpStatuses || {},
      labelsByPrinter: labelHistories || {},
    }),

  setPrinters: (printers) => set({ printers }),

  setActivePrinterId: (id) => set({ activePrinterId: id }),

  getActivePrinter: () => {
    const { printers, activePrinterId } = get();
    return printers.find((p) => p.id === activePrinterId) || printers[0] || {};
  },

  // ── Config per printer ──────────────────────────────────────────
  updatePrinterConfig: (printerId, configs) =>
    set((s) => ({
      printers: s.printers.map((p) => (p.id === printerId ? { ...p, ...configs } : p)),
    })),

  // ── TCP status per printer ──────────────────────────────────────
  setTcpStatus: (printerId, status) =>
    set((s) => ({
      tcpStatuses: { ...s.tcpStatuses, [printerId]: status },
    })),

  // ── Labels per printer ──────────────────────────────────────────
  addLabel: (printerId, label) =>
    set((s) => ({
      labelsByPrinter: {
        ...s.labelsByPrinter,
        [printerId]: [label, ...(s.labelsByPrinter[printerId] || [])].slice(0, 50),
      },
    })),

  setLabels: (printerId, labels) =>
    set((s) => ({
      labelsByPrinter: { ...s.labelsByPrinter, [printerId]: labels },
    })),

  removeLabel: (printerId, labelId) =>
    set((s) => ({
      labelsByPrinter: {
        ...s.labelsByPrinter,
        [printerId]: (s.labelsByPrinter[printerId] || []).filter((l) => l.id !== labelId),
      },
    })),

  clearLabels: (printerId) =>
    set((s) => ({
      labelsByPrinter: { ...s.labelsByPrinter, [printerId]: [] },
    })),

  // ── Notifications (global) ──────────────────────────────────────
  addNotification: (notification) =>
    set((s) => ({
      notifications: [
        { ...notification, id: Date.now() + Math.random() },
        ...s.notifications,
      ].slice(0, 20),
    })),

  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),

  // ── Shared UI state ─────────────────────────────────────────────
  setActiveTab: (tab) => set({ activeTab: tab }),

  toggleDarkMode: () =>
    set((s) => {
      const newMode = !s.darkMode;
      localStorage.setItem('darkMode', newMode);
      return { darkMode: newMode };
    }),
}));

export default useConfigStore;
