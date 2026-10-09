import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import authAxios from "./services/authAxios";
import App from "./App";

jest.mock("firebase/auth", () => ({ onAuthStateChanged: jest.fn() }));
jest.mock("./firebase", () => ({ auth: {} }));
jest.mock("./services/authAxios", () => ({ get: jest.fn() }));
jest.mock("./components/Login", () => () => <h1>Sign in</h1>);
jest.mock("./components/Landing", () => () => <h1>Connect It</h1>);
jest.mock("./components/Chat", () => ({ user }) => <h1>Chat for {user.email}</h1>);
jest.mock("./components/Feedback", () => () => null);
jest.mock("./components/Admin", () => () => null);
jest.mock("./components/call/GlobalCallOverlay", () => () => null);
jest.mock("./context/SocketContext", () => ({ SocketProvider: ({ children }) => children }));
jest.mock("./context/CallContext", () => ({ CallProvider: ({ children }) => children }));
jest.mock("./context/StoryContext", () => ({ StoryProvider: ({ children }) => children }));

let authChanged;
const unsubscribe = jest.fn();
const currentUser = { email: "person@example.com", uid: "person" };
const renderRoute = (path = "/chat") => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
const flush = async callback => act(async () => { callback(); });

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  onAuthStateChanged.mockImplementation((_auth, callback) => {
    authChanged = callback;
    return unsubscribe;
  });
});

test("signed-out visitors are redirected from chat to login", async () => {
  renderRoute();
  expect(screen.getByText("Loading Security Session...")).toBeInTheDocument();
  await flush(() => authChanged(null));
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
});

test("authenticated users can open chat after their profile loads", async () => {
  authAxios.get.mockResolvedValue({ data: { success: true, user: { displayName: "Person" } } });
  const { unmount } = renderRoute();
  await flush(() => authChanged(currentUser));
  expect(await screen.findByRole("heading", { name: "Chat for person@example.com" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("user")).displayName).toBe("Person");
  unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test("profile failure does not leave the security session loading forever", async () => {
  authAxios.get.mockRejectedValue(new Error("offline"));
  renderRoute();
  await flush(() => authChanged(currentUser));
  expect(await screen.findByRole("heading", { name: "Chat for person@example.com" })).toBeInTheDocument();
});

test.each(["resolve", "reject"])("a late profile %s cannot restore a signed-out session", async outcome => {
  let complete;
  authAxios.get.mockImplementation(() => new Promise((resolve, reject) => {
    complete = outcome === "resolve" ? () => resolve({ data: { success: true, user: {} } }) : () => reject(new Error("offline"));
  }));
  renderRoute();
  await flush(() => authChanged(currentUser));
  await flush(() => authChanged(null));
  await flush(complete);
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  expect(localStorage.getItem("user")).toBeNull();
});

test("unknown URLs recover to the home page", () => {
  renderRoute("/missing-page");
  expect(screen.getByRole("heading", { name: "Connect It" })).toBeInTheDocument();
});
