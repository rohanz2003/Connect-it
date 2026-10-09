import { createContext, useEffect } from "react";
import socket, { connectSocket, disconnectSocket } from "../services/socketService";
import { auth } from "../firebase";

export const SocketContext = createContext(socket);

export function SocketProvider({ children }) {
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        connectSocket().catch(() => {
          // The service reports connection failures. Cancellation is expected
          // when the account changes or this provider unmounts.
        });
      } else {
        disconnectSocket();
      }
    });

    return () => {
      unsubscribe();
      disconnectSocket();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}
