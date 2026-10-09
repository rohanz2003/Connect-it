import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import Chat from "./Chat";
import { fetchMessages } from "../services/messageService";
import { useStories } from "../context/StoryContext";
import { useCall } from "../context/CallContext";
import useSocket from "../hooks/useSocket";
import { useNavigate } from "react-router-dom";

jest.mock("react-router-dom", () => ({ useNavigate: jest.fn() }));
jest.mock("../firebase", () => ({ auth: {} }));
jest.mock("../hooks/useSocket", () => jest.fn());
jest.mock("../context/CallContext", () => ({ useCall: jest.fn() }));
jest.mock("../context/StoryContext", () => ({ useStories: jest.fn() }));
jest.mock("../utils/pushHelper", () => ({ subscribeToPush: jest.fn() }));
jest.mock("../utils/crossTabNotifications", () => ({ broadcastEvent: jest.fn(), onBroadcastEvent: () => () => {} }));
jest.mock("../services/authAxios", () => ({ get: () => Promise.resolve({ data: { success: false } }) }));
jest.mock("../services/messageService", () => ({ fetchMessages: jest.fn(), fetchRecentChats: () => Promise.resolve([]) }));
jest.mock("../services/requestService", () => ({
  fetchAllUsers: () => Promise.resolve({ success: true, users: [
    { email: "first@example.com", displayName: "Alice" },
    { email: "second@example.com", displayName: "Bob" },
  ] }),
  fetchPendingRequests: () => Promise.resolve({ success: true, requests: [] }),
  fetchSentRequests: () => Promise.resolve({ success: true, requests: [] }),
  fetchRequestStatuses: () => Promise.resolve({ success: true, statuses: {
    "first@example.com": { status: "accepted" }, "second@example.com": { status: "accepted" },
  } }),
  fetchAcceptedChatsWithMessages: () => Promise.resolve([
    { userEmail: "first@example.com" }, { userEmail: "second@example.com" },
  ]),
}));
jest.mock("emoji-picker-react", () => () => null);
jest.mock("./ProfileViewer", () => () => null);
jest.mock("./NotificationBell", () => () => null);
jest.mock("./LastSeen", () => () => <span>Offline</span>);

const user = { email: "me@example.com", uid: "me" };
let listeners;
let socket;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  useNavigate.mockReturnValue(jest.fn());
  listeners = {};
  socket = { connected: true, emit: jest.fn(), on: jest.fn((name, handler) => { listeners[name] = handler; }), off: jest.fn() };
  useSocket.mockReturnValue(socket);
  useCall.mockReturnValue({ callHistory: [], callState: "idle", startCall: jest.fn() });
  useStories.mockReturnValue({ stories: [], viewingStory: null, fetchStories: jest.fn(), setViewingStory: jest.fn() });
  fetchMessages.mockResolvedValue([]);
  window.innerWidth = 375;
  Element.prototype.scrollIntoView = jest.fn();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const mountChat = async () => {
  let result;
  await act(async () => { result = render(<Chat user={user} />); });
  return result;
};

test("mobile sidebar selection opens the conversation and Back returns to recent chats", async () => {
  const { container, unmount } = await mountChat();
  expect(container.querySelector("main")).toHaveClass("mobile-hidden");
  await act(async () => fireEvent.click(within(container.querySelector(".sidebar-list")).getByText("Alice")));
  expect(container.querySelector("main")).not.toHaveClass("mobile-hidden");
  expect(within(container.querySelector("main")).getByRole("heading", { name: "Alice" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back", exact: true }));
  expect(container.querySelector("main")).toHaveClass("mobile-hidden");
  unmount();
  expect(socket.off).toHaveBeenCalledWith("friend-removed", expect.any(Function));
});

test("a failed history request for the previous conversation cannot replace the current chat", async () => {
  let rejectFirst;
  fetchMessages.mockImplementation((_me, partner) => partner === "first@example.com"
    ? new Promise((_resolve, reject) => { rejectFirst = reject; })
    : Promise.resolve([{ _id: "b", sender: "second@example.com", receiver: user.email, text: "Bob's message", timestamp: new Date().toISOString() }]));
  localStorage.setItem(`chatHistory_${user.email}`, JSON.stringify({
    "first@example.com": [{ _id: "a", sender: "first@example.com", receiver: user.email, text: "Alice's cached message", timestamp: new Date().toISOString() }],
  }));
  const { container } = await mountChat();
  const sidebar = container.querySelector(".sidebar-list");
  await act(async () => fireEvent.click(within(sidebar).getByText("Alice")));
  fireEvent.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("button", { name: "Recent" }));
  await act(async () => fireEvent.click(within(container.querySelector(".mobile-page")).getByText("Bob")));
  await act(async () => rejectFirst(new Error("old request failed")));
  expect(within(container.querySelector("main")).getByText("Bob's message")).toBeInTheDocument();
  expect(within(container.querySelector("main")).queryByText("Alice's cached message")).not.toBeInTheDocument();
});

test("resizing a mobile conversation to desktop restores the sidebar list", async () => {
  const { container } = await mountChat();
  await act(async () => fireEvent.click(within(container.querySelector(".sidebar-list")).getByText("Alice")));
  window.innerWidth = 1024;
  fireEvent(window, new Event("resize"));
  expect(within(container.querySelector(".sidebar-list")).getByText("Bob")).toBeInTheDocument();
  expect(within(container.querySelector("main")).getByRole("heading", { name: "Alice" })).toBeInTheDocument();
});
