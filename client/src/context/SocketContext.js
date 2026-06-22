import { createContext, useEffect, useState } from "react";
import socket, { connectSocket } from "../services/socketService";
import { auth } from "../firebase";

export const SocketContext = createContext(socket);

export function SocketProvider({ children }) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        connectSocket().then(() => setConnected(true));
      } else {
        if (socket.connected) {
          socket.disconnect();
        }
        setConnected(false);
      }
    });

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      unsubscribe();
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}