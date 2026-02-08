import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import useConfigStore from '../store/configStore';

const SOCKET_URL =
  import.meta.env.MODE === 'production' ? '' : 'http://localhost:4000';

export default function useSocket() {
  const socketRef = useRef(null);
  const { setConfigs, setTcpStatus, addLabel, addNotification, clearLabels } =
    useConfigStore();

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('config-updated', (configs) => {
      setConfigs(configs);
    });

    socket.on('tcp-status', (status) => {
      setTcpStatus(status);
    });

    socket.on('label', (label) => {
      addLabel(label);
    });

    socket.on('labels-cleared', () => {
      clearLabels();
    });

    socket.on('notification', (notification) => {
      addNotification(notification);
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
