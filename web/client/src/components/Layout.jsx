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
} from 'lucide-react';

export default function Layout({ children }) {
  const { activeTab, setActiveTab, tcpStatus, configs, darkMode, toggleDarkMode, labels, clearLabels } =
    useConfigStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const handleToggleTcp = async () => {
    const endpoint = tcpStatus.running ? '/api/tcp/stop' : '/api/tcp/start';
    await fetch(endpoint, { method: 'POST' });
  };

  const handleClearLabels = async () => {
    if (labels.length === 0) return;
    if (confirm(`Remove ${labels.length} label${labels.length > 1 ? 's' : ''}?`)) {
      await fetch('/api/labels', { method: 'DELETE' });
    }
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
                className={tcpStatus.running ? 'text-emerald-500' : 'text-gray-400'}
              />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {tcpStatus.running
                  ? `${configs.host || '0.0.0.0'}:${configs.port || '9100'}`
                  : 'Offline'}
              </span>
              <span
                className={`h-2 w-2 rounded-full ${
                  tcpStatus.running ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                }`}
              />
            </div>

            {/* Toggle TCP */}
            <button
              onClick={handleToggleTcp}
              className={`btn-icon ${
                tcpStatus.running
                  ? 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20'
                  : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title={tcpStatus.running ? 'Stop TCP Server' : 'Start TCP Server'}
            >
              {tcpStatus.running ? <Power size={20} /> : <PowerOff size={20} />}
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
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Modals */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showTest && <TestModal onClose={() => setShowTest(false)} />}
      {showErrors && <ErrorsWarningsModal onClose={() => setShowErrors(false)} />}
    </div>
  );
}
