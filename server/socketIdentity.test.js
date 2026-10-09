const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Load only the modules under test; Firebase, MongoDB, timers, and config are mocked.
const loadModule = (file, mocks = {}, globals = {}) => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve(file), "utf8"), {
    module,
    exports: module.exports,
    require: (id) => {
      assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency: ${id}`);
      return mocks[id];
    },
    console: { log() {}, warn() {}, error() {} },
    Set,
    Map,
    Buffer,
    Date,
    ...globals,
  }, { filename: file });
  return module.exports;
};

const makeSocket = (id, auth = {}) => {
  const handlers = new Map();
  const socket = {
    id,
    data: {},
    handshake: { auth, address: "127.0.0.1" },
    rooms: new Set([id]),
    emitted: [],
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(handler);
    },
    emit(event, payload) { this.emitted.push({ event, payload }); },
    join(room) { this.rooms.add(room); },
    leave(room) { this.rooms.delete(room); },
    async receive(event, ...args) {
      for (const handler of handlers.get(event) || []) await handler(...args);
    },
  };
  return socket;
};

const makeIo = () => ({
  emitted: [],
  sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
  emit(event, payload) { this.emitted.push({ event, payload }); },
  to(room) {
    return { emit: (event, payload) => this.emitted.push({ room, event, payload }) };
  },
});

const emptyQuery = () => ({
  sort() { return this; },
  limit() { return this; },
  lean: async () => [],
});

const presenceHarness = (authUtils) => {
  const lastSeen = [];
  const profileWrites = [];
  const handlePresence = loadModule("./socket/presence", {
    "../utils/socketAuth": authUtils,
    "../modules/User": {
      findOne: () => ({ lean: async () => null }),
      findOneAndUpdate: async (...args) => { profileWrites.push(args); },
    },
    "../models/Message": { find: emptyQuery },
    "../models/ClearedChat": { find: emptyQuery },
    "../models/Device": { findOneAndUpdate: async () => ({}) },
    "../models/ChatRequest": { find: emptyQuery },
    "../utils/messageCrypto": { decryptMessageDoc: (doc) => doc },
    "../controllers/userController": { updateLastSeen: (email) => lastSeen.push(email) },
  });
  return { handlePresence, lastSeen, profileWrites };
};

const serverHarness = ({ configured = true, verify = async () => ({ email: "Owner@Example.com" }) } = {}) => {
  const authUtils = loadModule("./utils/socketAuth");
  const { handlePresence } = presenceHarness(authUtils);
  const io = makeIo();
  const lastSeen = [];
  let clock = 1000;
  let sweep;
  let users;
  const initSocket = loadModule("./socket/socket", {
    "socket.io": { Server: class {
      constructor() { return io; }
    } },
    "./presence": (...args) => { users = args[2]; handlePresence(...args); },
    "./typing": () => {},
    "./message": () => {},
    "./call": () => {},
    "./requests": () => {},
    "../config/env": { getCorsOrigins: () => [] },
    "../utils/socketAuth": authUtils,
    "../controllers/userController": { updateLastSeen: (email) => lastSeen.push(email) },
    "../config/firebase": { isFirebaseConfigured: () => configured, verifyFirebaseToken: verify },
    "../models/Device": { findOneAndUpdate: async () => ({}) },
    crypto: { randomBytes: () => ({ toString: () => "test-device" }) },
  }, {
    Date: class extends Date { static now() { return clock; } },
    setInterval: (callback) => { sweep = callback; },
  });
  io.use = (handler) => { io.middleware = handler; };
  io.on = (event, handler) => { if (event === "connection") io.connect = handler; };
  initSocket({});
  return {
    io,
    authUtils,
    lastSeen,
    get users() { return users; },
    sweep: (now) => { clock = now; sweep(); },
    async authenticate(socket) {
      let result;
      let calls = 0;
      await io.middleware(socket, (error) => { result = error; calls++; });
      assert.equal(calls, 1);
      return result;
    },
    async connect(socket) {
      assert.equal(await this.authenticate(socket), undefined);
      io.sockets.sockets.set(socket.id, socket);
      await io.connect(socket);
    },
  };
};

const forgedToken = `header.${Buffer.from(JSON.stringify({ email: "victim@example.com" })).toString("base64url")}.signature`;

test("socket authentication rejects unsigned tokens when Firebase is unavailable or verification fails", async () => {
  for (const options of [
    { configured: false },
    { verify: async () => { throw new Error("invalid signature"); } },
  ]) {
    const harness = serverHarness(options);
    const socket = makeSocket("forged", { idToken: forgedToken, email: "victim@example.com", userId: "victim@example.com" });
    const error = await harness.authenticate(socket);
    assert.ok(error, "forged token must not authenticate");
    assert.equal(socket.data.authEmail, undefined);
    assert.equal(harness.authUtils.getAuthenticatedEmail(socket, {}), null);
  }
});

test("socket authentication rejects raw identities and malformed token/email claims", async () => {
  let verified = 0;
  const harness = serverHarness({ verify: async () => { verified++; return { email: "owner@example.com" }; } });
  for (const auth of [{}, { email: "owner@example.com" }, { userId: "owner@example.com" }, { idToken: {} }, { idToken: " " }]) {
    assert.ok(await harness.authenticate(makeSocket("invalid", auth)));
  }
  assert.equal(verified, 0);
  for (const email of [undefined, null, {}, [], 42, "", " "]) {
    const invalidClaim = serverHarness({ verify: async () => ({ email }) });
    const socket = makeSocket("invalid-claim", { idToken: "verified-token", email: "fallback@example.com" });
    assert.ok(await invalidClaim.authenticate(socket));
    assert.equal(socket.data.authEmail, undefined);
  }
});

test("verified connections register before join, use the verified email, and unregister on disconnect", async () => {
  const harness = serverHarness({ verify: async () => ({ email: " Owner@Example.com " }) });
  const socket = makeSocket("owner", { idToken: "verified-token", email: "victim@example.com" });
  await harness.connect(socket);
  assert.equal(socket.data.authEmail, "owner@example.com");
  assert.equal(harness.authUtils.getAuthenticatedEmail(socket, {}), "owner@example.com");
  await socket.receive("join", " OWNER@example.com ");
  assert.ok(harness.users["owner@example.com"].has(socket.id));
  assert.ok(socket.rooms.has("owner@example.com"));
  assert.ok(socket.emitted.some(({ event }) => event === "device-registered"));
  await socket.receive("disconnect");
  assert.equal(harness.authUtils.getAuthenticatedEmail(socket, {}), null);
  assert.equal(harness.users["owner@example.com"], undefined);
});

test("socket identity cannot be inferred from presence maps", () => {
  const authUtils = loadModule("./utils/socketAuth");
  const socket = makeSocket("unregistered");
  assert.equal(authUtils.getAuthenticatedEmail(socket, { "victim@example.com": new Set([socket.id]) }), null);
  authUtils.registerSocket(socket.id, " Owner@Example.com ");
  assert.equal(authUtils.getAuthenticatedEmail(socket, { "victim@example.com": socket.id }), "owner@example.com");
  authUtils.unregisterSocket(socket.id);
  assert.equal(authUtils.getAuthenticatedEmail(socket, {}), null);
});

test("join/leave reject spoofed and malformed identities while preserving other sessions", async () => {
  const authUtils = loadModule("./utils/socketAuth");
  const { handlePresence, lastSeen, profileWrites } = presenceHarness(authUtils);
  const io = makeIo();
  const users = { "victim@example.com": new Set(["victim"]), "owner@example.com": new Set(["other-device"]) };
  const socket = makeSocket("owner");
  socket.data.authEmail = "owner@example.com";
  authUtils.registerSocket(socket.id, socket.data.authEmail);
  handlePresence(io, socket, users, {}, {}, {});
  for (const payload of ["victim@example.com", { email: "victim@example.com" }, { email: {} }, { email: 42 }, null]) {
    await socket.receive("join", payload);
    await socket.receive("leave", payload);
  }
  assert.deepEqual([...users["victim@example.com"]], ["victim"]);
  assert.deepEqual([...users["owner@example.com"]], ["other-device"]);
  assert.equal(io.emitted.length, 0);
  assert.equal(profileWrites.length, 0);
  await socket.receive("join", " OWNER@example.com ");
  assert.deepEqual([...users["owner@example.com"]], ["other-device", "owner"]);
  await socket.receive("leave", { email: "Owner@Example.com" });
  assert.deepEqual([...users["owner@example.com"]], ["other-device"]);
  assert.equal(socket.rooms.has("owner@example.com"), false);
  assert.deepEqual(lastSeen, []);
  await socket.receive("join", "owner@example.com");
  users["owner@example.com"].delete("other-device");
  await socket.receive("leave", "owner@example.com");
  assert.equal(users["owner@example.com"], undefined);
  assert.deepEqual(lastSeen, ["owner@example.com"]);
});

test("heartbeat cannot create or update presence for a supplied identity, including after leave", async () => {
  const harness = serverHarness();
  const socket = makeSocket("owner", { idToken: "verified-token" });
  await harness.connect(socket);
  await socket.receive("heartbeat", "victim@example.com");
  await socket.receive("heartbeat", { email: "victim@example.com" });
  harness.sweep(100000);
  assert.deepEqual(harness.lastSeen, []);
  await socket.receive("join", "owner@example.com");
  await socket.receive("heartbeat", "victim@example.com");
  await socket.receive("heartbeat", "owner@example.com");
  harness.io.sockets.sockets.delete(socket.id);
  harness.sweep(200000);
  assert.deepEqual(harness.lastSeen, ["owner@example.com"]);

  await socket.receive("join", "owner@example.com");
  await socket.receive("leave", "owner@example.com");
  await socket.receive("heartbeat", "victim@example.com");
  await socket.receive("heartbeat", "owner@example.com");
  harness.sweep(300000);
  assert.deepEqual(harness.lastSeen, ["owner@example.com"]);
});

test("a heartbeat cannot keep a different stale user online", async () => {
  const harness = serverHarness({ verify: async (token) => ({ email: `${token}@example.com` }) });
  const owner = makeSocket("owner", { idToken: "owner" });
  const victim = makeSocket("victim", { idToken: "victim" });
  for (const socket of [owner, victim]) {
    await harness.connect(socket);
    await socket.receive("join", `${socket.id}@example.com`);
    await socket.receive("heartbeat", `${socket.id}@example.com`);
  }
  harness.io.sockets.sockets.delete(victim.id);
  harness.sweep(80000);
  await owner.receive("heartbeat", "victim@example.com");
  harness.sweep(100000);
  assert.deepEqual(harness.lastSeen, ["victim@example.com"]);
  assert.equal(harness.users["victim@example.com"], undefined);
  assert.ok(harness.users["owner@example.com"].has(owner.id));
});

test("typing events cannot impersonate another user and verified typing still broadcasts", async () => {
  const authUtils = loadModule("./utils/socketAuth");
  const handleTyping = loadModule("./socket/typing", { "../utils/socketAuth": authUtils });
  const io = makeIo();
  const socket = makeSocket("owner");
  authUtils.registerSocket(socket.id, "owner@example.com");
  handleTyping(io, socket, { "target@example.com": new Set(["target"]) });
  for (const event of ["typing", "stop-typing"]) {
    for (const payload of [{ from: "victim@example.com", to: "target@example.com" }, { from: {}, to: "target@example.com" }, null]) {
      await socket.receive(event, payload);
    }
    assert.equal(io.emitted.length, 0);
    await socket.receive(event, { from: " Owner@Example.com ", to: " Target@Example.com " });
    assert.equal(io.emitted.length, 1);
    assert.equal(io.emitted[0].room, "target@example.com");
    assert.equal(io.emitted[0].event, event);
    assert.equal(io.emitted[0].payload.from, "owner@example.com");
    io.emitted.length = 0;
  }
});

test("profile events only change the registered user's profile", async () => {
  const authUtils = loadModule("./utils/socketAuth");
  const { handlePresence, profileWrites } = presenceHarness(authUtils);
  const socket = makeSocket("owner");
  const io = makeIo();
  const profiles = {};
  socket.data.authEmail = "owner@example.com";
  authUtils.registerSocket(socket.id, socket.data.authEmail);
  handlePresence(io, socket, {}, profiles, {}, {});
  for (const event of ["update-profile", "remove-profile-pic"]) {
    for (const email of ["victim@example.com", {}, 42, null]) {
      await socket.receive(event, { email, profilePic: "avatar" });
    }
    assert.equal(profileWrites.length, 0);
    assert.equal(io.emitted.length, 0);
  }
  await socket.receive("update-profile", { email: " Owner@Example.com ", profilePic: "avatar" });
  await socket.receive("remove-profile-pic", { email: "owner@example.com" });
  assert.equal(profileWrites.length, 2);
  assert.ok(profileWrites.every(([filter]) => filter.email === "owner@example.com"));
  assert.equal(profiles["owner@example.com"], null);
  assert.equal(profiles["victim@example.com"], undefined);
});

test("message and call handlers use registered identity before presence join", async () => {
  const authUtils = loadModule("./utils/socketAuth");
  const socket = makeSocket("owner");
  const io = makeIo();
  const users = { "target@example.com": new Set(["target"]) };
  authUtils.registerSocket(socket.id, "owner@example.com");
  const savedMessages = [];
  const handleMessages = loadModule("./socket/message", {
    "../utils/socketAuth": authUtils,
    "../models/Message": { create: async (message) => { savedMessages.push(message); return { ...message, _id: "saved" }; } },
    "../models/ClearedChat": {},
    "../models/ChatRequest": { findOne: async () => ({ status: "accepted" }) },
    "../utils/messageCrypto": { encryptPayload: (text) => `encrypted:${text}`, decryptMessageDoc: (doc) => doc },
    "../config/database": { isDatabaseConnected: () => true },
    "../services/pushService": { sendPushNotification() {} },
  });
  const handleCalls = loadModule("./socket/call", { "../utils/socketAuth": authUtils });
  // Message delivery chains target rooms; keep this small mock chainable.
  io.to = (room) => ({
    to() { return this; },
    emit(event, payload) { io.emitted.push({ room, event, payload }); },
  });
  handleMessages(io, socket, users, {}, {});
  handleCalls(io, socket, users);
  await socket.receive("join-room", { user1: "victim@example.com", user2: "target@example.com" });
  assert.equal(socket.rooms.size, 1);
  await socket.receive("join-room", { user1: "owner@example.com", user2: "target@example.com" });
  assert.ok(socket.rooms.has("owner@example.com_target@example.com"));
  let result;
  await socket.receive("send-message", { sender: "victim@example.com", receiver: "target@example.com", text: "spoofed" }, (value) => { result = value; });
  assert.equal(result.ok, false);
  assert.equal(savedMessages.length, 0);
  await socket.receive("send-message", { sender: "owner@example.com", receiver: "target@example.com", text: "hello" }, (value) => { result = value; });
  assert.equal(result.ok, true);
  assert.equal(savedMessages.length, 1);
  assert.equal(savedMessages[0].sender, "owner@example.com");
  await socket.receive("call-user", { userToCall: "target@example.com", from: "victim@example.com", signalData: "offer", type: "audio" });
  const incoming = io.emitted.find(({ event }) => event === "incoming-call");
  assert.equal(incoming.payload.from, "owner@example.com");
  assert.equal(incoming.room, "target");
});
