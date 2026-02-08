import { useEffect } from 'react';
import useSocket from './hooks/useSocket';
import useConfigStore from './store/configStore';
import Layout from './components/Layout';
import PrinterTab from './components/PrinterTab';
import DesignerTab from './components/DesignerTab';
import ToastContainer from './components/ToastContainer';

export default function App() {
  useSocket();
  const { activeTab, darkMode } = useConfigStore();

  useEffect(() => {
    // Fetch initial labels
    fetch('/api/labels')
      .then((r) => r.json())
      .then((labels) => useConfigStore.getState().setLabels(labels))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  return (
    <div className="h-full">
      <Layout>
        {activeTab === 'printer' ? <PrinterTab /> : <DesignerTab />}
      </Layout>
      <ToastContainer />
    </div>
  );
}
