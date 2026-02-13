import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import useConfigStore from '../store/configStore';

const SOCKET_URL =
  import.meta.env.MODE === 'production' ? '' : 'http://localhost:4000';

export default function useSocket() {
  const socketRef = useRef(null);
  const store = useConfigStore;

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    // Full state sync on connect
    socket.on('printers-state', (data) => {
      store.getState().setPrintersState(data);
    });

    // Printer list changed (add/remove)
    socket.on('printers-updated', ({ printers }) => {
      store.getState().setPrinters(printers);
    });

    // Config updated for a specific printer
    socket.on('config-updated', ({ printerId, configs }) => {
      store.getState().updatePrinterConfig(printerId, configs);
    });

    // TCP status change for a specific printer
    socket.on('tcp-status', ({ printerId, ...status }) => {
      store.getState().setTcpStatus(printerId, status);
    });

    // New label for a specific printer
    socket.on('label', ({ printerId, ...label }) => {
      store.getState().addLabel(printerId, label);
    });

    // Single label removed
    socket.on('label-removed', ({ printerId, labelId }) => {
      store.getState().removeLabel(printerId, labelId);
    });

    // Labels cleared for a specific printer
    socket.on('labels-cleared', ({ printerId }) => {
      store.getState().clearLabels(printerId);
    });

    // Notifications (may or may not have printerId)
    socket.on('notification', (notification) => {
      store.getState().addNotification(notification);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return socketRef;
}
