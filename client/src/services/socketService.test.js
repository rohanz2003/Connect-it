import { act, cleanup, render } from "@testing-library/react";
import { auth } from "../firebase";
import { SocketProvider } from "../context/SocketContext";
import socket, { connectSocket, disconnectSocket } from "./socketService";

jest.mock("../firebase", () => ({
  auth: { currentUser: null, onAuthStateChanged: jest.fn() },
}));

jest.mock("socket.io-client", () => ({
  io: jest.fn(() => {
    const emitter = () => {
      const handlers = new Map();
      return {
        on(event, handler) {
          handlers.set(event, [...(handlers.get(event) || []), handler]);
          return this;
        },
        off(event, handler) {
          handlers.set(event, (handlers.get(event) || []).filter(item => item !== handler));
          return this;
        },
        listeners(event) { return [...(handlers.get(event) || [])]; },
        dispatch(event, ...args) {
          this.listeners(event).forEach(handler => handler(...args));
        },
      };
    };
    const client = {
      ...emitter(),
      io: emitter(),
      connected: false,
      active: false,
      auth: {},
      sendBuffer: [],
      receiveBuffer: [],
      handshakes: [],
      connect: jest.fn(),
      disconnect: jest.fn(),
      // Socket.IO calls auth again whenever a transport opens, including retries.
      handshake() {
        if (typeof this.auth === "function") {
          this.auth(payload => this.handshakes.push(payload));
        } else {
          this.handshakes.push(this.auth);
        }
      },
      receive(event, ...args) {
        if (event === "connect") this.connected = true;
        if (event === "disconnect") this.connected = false;
        this.dispatch(event, ...args);
      },
    };
    return client;
  }),
}));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const makeUser = (uid = "alice") => ({
  uid,
  email: `${uid}@example.com`,
  getIdToken: jest.fn().mockResolvedValue(`${uid}-token`),
});
const resultOf = promise => promise.then(
  value => ({ value }),
  error => ({ error })
);
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const listenerCounts = () => ["connect", "connect_error", "disconnect"].map(
  event => socket.listeners(event).length
);
let authChanged;
let unsubscribe;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  localStorage.clear();
  socket.handshakes.length = 0;
  socket.connect.mockImplementation(() => {
    socket.active = true;
    socket.handshake();
    return socket;
  });
  socket.disconnect.mockImplementation(() => {
    const wasConnected = socket.connected;
    socket.active = false;
    socket.connected = false;
    // Real Socket.IO emits no disconnect event for a pending connection.
    if (wasConnected) socket.dispatch("disconnect", "io client disconnect");
    return socket;
  });
  auth.currentUser = makeUser();
  unsubscribe = jest.fn();
  auth.onAuthStateChanged.mockImplementation(callback => {
    authChanged = callback;
    return unsubscribe;
  });
});

afterEach(() => {
  cleanup();
  if (disconnectSocket) disconnectSocket();
  auth.currentUser = null;
  jest.restoreAllMocks();
});

test("token failure never falls back to an email-only handshake", async () => {
  const error = new Error("Token refresh failed");
  auth.currentUser.getIdToken.mockRejectedValue(error);
  const result = resultOf(connectSocket());
  await flush();

  expect(socket.handshakes).toEqual([]);
  expect(await result).toEqual({ error });
  expect(socket.active).toBe(false);
});

test("duplicate calls share one token request and connection without adding listeners", async () => {
  const token = deferred();
  const user = auth.currentUser;
  user.getIdToken.mockReturnValue(token.promise);
  localStorage.setItem("deviceId", "device-123");
  const counts = listenerCounts();
  const first = connectSocket();
  const second = connectSocket();
  token.resolve("fresh-token");
  await flush();

  expect(user.getIdToken).toHaveBeenCalledTimes(1);
  expect(user.getIdToken).toHaveBeenCalledWith(true);
  expect(socket.connect).toHaveBeenCalledTimes(1);
  expect(socket.handshakes).toEqual([{ idToken: "fresh-token", deviceId: "device-123" }]);
  socket.receive("connect");
  await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  expect(listenerCounts()).toEqual(counts);
  await connectSocket();
  expect(socket.connect).toHaveBeenCalledTimes(1);
});

test.each([undefined, "", "   "])("an invalid token (%p) closes the pending connection", async token => {
  auth.currentUser.getIdToken.mockResolvedValue(token);
  const result = await resultOf(connectSocket());
  expect(result.error).toBeInstanceOf(Error);
  expect(socket.handshakes).toEqual([]);
  expect(socket.active).toBe(false);
});

test("connection rejection settles all callers and a later call can retry cleanly", async () => {
  const counts = listenerCounts();
  const first = resultOf(connectSocket());
  const duplicate = resultOf(connectSocket());
  await flush();
  const error = new Error("Invalid authentication token");
  socket.active = false; // Server middleware rejection disables automatic retries.
  socket.receive("connect_error", error);
  expect(await first).toEqual({ error });
  expect(await duplicate).toEqual({ error });
  expect(listenerCounts()).toEqual(counts);

  auth.currentUser.getIdToken.mockResolvedValue("retry-token");
  const retry = connectSocket();
  await flush();
  expect(socket.handshakes[1].idToken).toBe("retry-token");
  socket.receive("connect");
  await expect(retry).resolves.toBeUndefined();
  expect(socket.connect).toHaveBeenCalledTimes(2);
  expect(listenerCounts()).toEqual(counts);
});

test("automatic reconnection obtains a fresh token for every handshake", async () => {
  const first = connectSocket();
  await flush();
  socket.receive("connect");
  await first;

  socket.receive("disconnect", "transport close");
  auth.currentUser.getIdToken.mockResolvedValue("refreshed-token");
  socket.handshake();
  await flush();
  expect(socket.handshakes.map(payload => payload.idToken)).toEqual(["alice-token", "refreshed-token"]);
  expect(auth.currentUser.getIdToken.mock.calls).toEqual([[true], [true]]);
  expect(socket.connect).toHaveBeenCalledTimes(1);
});

test("transient connection errors settle callers while automatic reconnect stays available", async () => {
  const attempt = resultOf(connectSocket());
  await flush();
  const error = new Error("Network unavailable");
  socket.receive("connect_error", error);
  expect(await attempt).toEqual({ error });
  expect(socket.active).toBe(true);

  const retry = connectSocket();
  expect(socket.connect).toHaveBeenCalledTimes(1);
  auth.currentUser.getIdToken.mockResolvedValue("network-retry-token");
  socket.handshake();
  await flush();
  socket.receive("connect");
  await retry;
  expect(socket.handshakes[1].idToken).toBe("network-retry-token");
});

test("token failure during automatic reconnect stops reconnecting without an unauthenticated handshake", async () => {
  const first = connectSocket();
  await flush();
  socket.receive("connect");
  await first;
  socket.receive("disconnect", "transport close");
  auth.currentUser.getIdToken.mockRejectedValue(new Error("Refresh unavailable"));
  socket.handshake();
  await flush();
  expect(socket.handshakes).toHaveLength(1);
  expect(socket.active).toBe(false);
});

test("logout cancels token retrieval immediately and discards buffered account events", async () => {
  const token = deferred();
  auth.currentUser.getIdToken.mockReturnValue(token.promise);
  const result = resultOf(connectSocket());
  socket.sendBuffer.push({ data: ["send-message", "old-account"] });
  socket.receiveBuffer.push(["receive-message", "old-account"]);
  auth.currentUser = null;
  disconnectSocket();
  expect((await result).error.name).toBe("AbortError");
  expect(socket.active).toBe(false);
  expect(socket.sendBuffer).toEqual([]);
  expect(socket.receiveBuffer).toEqual([]);
  token.resolve("late-token");
  await flush();
  expect(socket.handshakes).toEqual([]);
  await connectSocket();
  expect(socket.connect).toHaveBeenCalledTimes(1);
});

test("account switch cancels the old pending token and connects only the new user", async () => {
  const token = deferred();
  auth.currentUser.getIdToken.mockReturnValue(token.promise);
  const previous = resultOf(connectSocket());
  auth.currentUser = makeUser("bob");
  const next = connectSocket();
  expect((await previous).error.name).toBe("AbortError");
  token.resolve("alice-late-token");
  await flush();
  expect(socket.handshakes).toEqual([{ idToken: "bob-token", deviceId: undefined }]);
  socket.receive("connect");
  await next;
});

test("an already-connected socket is replaced on account switch", async () => {
  const first = connectSocket();
  await flush();
  socket.receive("connect");
  await first;
  auth.currentUser = makeUser("bob");
  const next = connectSocket();
  await flush();
  expect(socket.disconnect).toHaveBeenCalledTimes(1);
  expect(socket.connected).toBe(false);
  expect(socket.handshakes[1].idToken).toBe("bob-token");
  socket.receive("connect");
  await next;
});

test("a delayed auth callback from a closed transport cannot send an old token", async () => {
  const oldToken = deferred();
  auth.currentUser.getIdToken.mockReturnValueOnce(oldToken.promise).mockResolvedValue("new-transport-token");
  const initial = resultOf(connectSocket());
  socket.receive("disconnect", "transport close");
  expect((await initial).error).toBeInstanceOf(Error);
  socket.handshake();
  await flush();
  oldToken.resolve("obsolete-transport-token");
  await flush();
  expect(socket.handshakes.map(payload => payload.idToken)).toEqual(["new-transport-token"]);
});

test("token completion checks the current Firebase identity before sending credentials", async () => {
  const token = deferred();
  auth.currentUser.getIdToken.mockReturnValue(token.promise);
  const result = resultOf(connectSocket());
  auth.currentUser = makeUser("bob");
  token.resolve("alice-token");
  expect((await result).error.name).toBe("AbortError");
  expect(socket.handshakes).toEqual([]);
  expect(socket.active).toBe(false);
});

test("exhausted reconnection attempts reject a waiting caller and allow a new attempt", async () => {
  const result = resultOf(connectSocket());
  await flush();
  socket.io.dispatch("reconnect_failed");
  expect((await result).error).toBeInstanceOf(Error);
  expect(socket.active).toBe(false);
  const next = connectSocket();
  await flush();
  socket.receive("connect");
  await next;
  expect(socket.connect).toHaveBeenCalledTimes(2);
});

test("SocketProvider cancels a not-yet-connected socket on signout", async () => {
  const token = deferred();
  auth.currentUser.getIdToken.mockReturnValue(token.promise);
  render(<SocketProvider><div>Chat</div></SocketProvider>);
  await act(async () => { authChanged(auth.currentUser); });
  expect(socket.active).toBe(true);
  expect(socket.connected).toBe(false);
  await act(async () => { auth.currentUser = null; authChanged(null); });
  expect(socket.active).toBe(false);
  await act(async () => { token.resolve("late-token"); });
  expect(socket.handshakes).toEqual([]);
});

test("SocketProvider handles an account switch without reusing the connected account", async () => {
  render(<SocketProvider><div>Chat</div></SocketProvider>);
  await act(async () => { authChanged(auth.currentUser); });
  await act(async () => { socket.receive("connect"); });
  await act(async () => { auth.currentUser = makeUser("bob"); authChanged(auth.currentUser); });
  expect(socket.connected).toBe(false);
  expect(socket.handshakes.map(payload => payload.idToken)).toEqual(["alice-token", "bob-token"]);
  await act(async () => { socket.receive("connect"); });
});

test("SocketProvider handles connection failure and cancels pending work on unmount", async () => {
  const counts = listenerCounts();
  const { unmount } = render(<SocketProvider><div>Chat</div></SocketProvider>);
  await act(async () => { authChanged(auth.currentUser); });
  await act(async () => { socket.receive("connect_error", new Error("offline")); });
  const token = deferred();
  auth.currentUser.getIdToken.mockReturnValue(token.promise);
  socket.handshake();
  unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(socket.active).toBe(false);
  token.resolve("unmounted-token");
  await flush();
  expect(socket.handshakes).toHaveLength(1);
  expect(listenerCounts()).toEqual(counts);
});
