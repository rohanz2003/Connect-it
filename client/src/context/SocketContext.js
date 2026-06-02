import { createContext } from "react";
import socket from "../services/socketService";

export const SocketContext = createContext(socket);