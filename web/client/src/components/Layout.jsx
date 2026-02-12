import { useState } from 'react';
import useConfigStore from '../store/configStore';
import SettingsModal from './SettingsModal';
import TestModal from './TestModal';
import ErrorsWarningsModal from './ErrorsWarningsModal';
import {
  Printer,
  PenTool,
  Settings,
  FlaskConical,
  AlertTriangle,
  Power,
  PowerOff,
  Moon,
  Sun,
  Trash2,
  Activity,
  Plus,
  X,
} from 'lucide-react';

export default function Layout({ children }) {
  const {
    activeTab,
    setActiveTab,
    printers,
    activePrinterId,
    setActivePrinterId,
    tcpStatuses,
    labelsByPrinter,
    darkMode,
    toggleDarkMode,
  } = useConfigStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const activePrinter = printers.find((p) => p.id === activePrinterId) || printers[0] || {};
  const activeTcpStatus = tcpStatuses[activePrinterId] || { running: false };
  const activeLabels = labelsByPrinter[activePrinterId] || [];

  const handleToggleTcp = async () => {
    if (!activePrinterId) return;
    const endpoint = activeTcpStatus.running
      ? `/api/printers/${activePrinterId}/tcp/stop`
      : `/api/printers/${activePrinterId}/tcp/start`;
    await fetch(endpoint, { method: 'POST' });
  };

  const handleClearLabels = async () => {
    if (activeLabels.length === 0 || !activePrinterId) return;
    if (confirm(`Remove ${activeLabels.length} label${activeLabels.length > 1 ? 's' : ''}?`)) {
      await fetch(`/api/printers/${activePrinterId}/labels`, { method: 'DELETE' });
    }
  };

  const handleAddPrinter = async () => {
    const res = await fetch('/api/printers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.success) {
      setActivePrinterId(data.printer.id);
    }
  };

  const handleRemovePrinter = async (e, printerId) => {
    e.stopPropagation();
    if (printers.length <= 1) return;
    const printer = printers.find((p) => p.id === printerId);
    if (!confirm(`Remove printer "${printer?.name}"? This will stop its server and clear its labels.`)) return;
    await fetch(`/api/printers/${printerId}`, { method: 'DELETE' });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex-none border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Printer size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                ZPL Printer Emulator
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                EN Systems &middot; v5.0.0
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* TCP Status Indicator */}
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
              <Activity
                size={14}
                className={activeTcpStatus.running ? 'text-emerald-500' : 'text-gray-400'}
              />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {activeTcpStatus.running
                  ? `${activePrinter.host || '0.0.0.0'}:${activePrinter.port || '9100'}`
                  : 'Offline'}
              </span>
              <span
                className={`h-2 w-2 rounded-full ${
                  activeTcpStatus.running ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                }`}
              />
            </div>

            {/* Toggle TCP */}
            <button
              onClick={handleToggleTcp}
              className={`btn-icon ${
                activeTcpStatus.running
                  ? 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20'
                  : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title={activeTcpStatus.running ? 'Stop TCP Server' : 'Start TCP Server'}
            >
              {activeTcpStatus.running ? <Power size={20} /> : <PowerOff size={20} />}
            </button>

            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

            <button onClick={toggleDarkMode} className="btn-icon" title="Toggle dark mode">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>

        {/* Navigation & Toolbar */}
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-1.5 dark:border-gray-800">
          <nav className="flex gap-1">
            <button
              onClick={() => setActiveTab('printer')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                activeTab === 'printer'
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <Printer size={16} />
              Printer
            </button>
            <button
              onClick={() => setActiveTab('designer')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                activeTab === 'designer'
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <PenTool size={16} />
              Label Designer
            </button>
          </nav>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowTest(true)}
              className="btn-ghost text-xs"
              title="Test Printer"
            >
              <FlaskConical size={15} />
              Test
            </button>
            <button
              onClick={() => setShowErrors(true)}
              className="btn-ghost text-xs text-red-600 dark:text-red-400"
              title="Errors & Warnings"
            >
              <AlertTriangle size={15} />
              Errors
            </button>
            <button
              onClick={handleClearLabels}
              className="btn-ghost text-xs"
              title="Clear Labels"
            >
              <Trash2 size={15} />
              Clear
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="btn-ghost text-xs"
              title="Settings"
            >
              <Settings size={15} />
              Settings
            </button>
          </div>
        </div>

        {/* Printer Sub-Tabs */}
        {activeTab === 'printer' && printers.length > 0 && (
          <div className="flex items-center gap-1 border-t border-gray-100 px-4 py-1 dark:border-gray-800">
            {printers.map((p) => {
              const status = tcpStatuses[p.id] || {};
              return (
                <button
                  key={p.id}
                  onClick={() => setActivePrinterId(p.id)}
                  className={`flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    p.id === activePrinterId
                      ? 'bg-white border border-b-0 border-gray-200 text-brand-700 dark:bg-gray-900 dark:border-gray-700 dark:text-brand-400'
                      : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      status.running ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                  {p.name}
                  <span className="text-[10px] text-gray-400">:{p.port}</span>
                  {printers.length > 1 && (
                    <span
                      onClick={(e) => handleRemovePrinter(e, p.id)}
                      className="ml-0.5 rounded p-0.5 text-gray-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30"
                    >
                      <X size={10} />
                    </span>
                  )}
                </button>
              );
            })}
            <button
              onClick={handleAddPrinter}
              className="ml-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-emerald-600 dark:hover:bg-gray-800"
              title="Add Printer"
            >
              <Plus size={14} />
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Modals */}
      {showSettings && <SettingsModal printerId={activePrinterId} onClose={() => setShowSettings(false)} />}
      {showTest && <TestModal printerId={activePrinterId} onClose={() => setShowTest(false)} />}
      {showErrors && <ErrorsWarningsModal printerId={activePrinterId} onClose={() => setShowErrors(false)} />}
    </div>
  );
}
