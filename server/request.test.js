const test = require("node:test");
const assert = require("node:assert/strict");
const ChatRequest = require("./models/ChatRequest");
const Message = require("./models/Message");
const User = require("./modules/User");
const push = require("./services/pushService");
const socketAuth = require("./utils/socketAuth");

const sender = "sender@example.com";
const recipient = "recipient@example.com";
const stranger = "stranger@example.com";
const requestId = "507f1f77bcf86cd799439011";
const secondId = "507f1f77bcf86cd799439012";
const record = (overrides = {}) => ({
  _id: requestId, from: sender, to: recipient, status: "pending",
  createdAt: new Date(0), ...overrides,
});
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

// Stateful model doubles check the effects of authorization predicates, not just
// whether a particular Mongoose method was called. No database or push service runs.
const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === "$or") return value.some((part) => matches(row, part));
  if (value && typeof value === "object") {
    if ("$in" in value) return value.$in.includes(row[key]);
    if ("$ne" in value) return row[key] !== value.$ne;
  }
  return row[key] === value;
});

const harness = (t, initial = [], actor = sender) => {
  const rows = initial.map((row) => ({ ...row }));
  const events = [];
  const io = { to: (email) => ({ emit: (event, data) => events.push({ email, event, data }) }) };
  const query = (result) => ({
    sort(order) {
      const [key, direction] = Object.entries(order)[0];
      result.sort((a, b) => direction * (a[key] - b[key]));
      return this;
    },
    lean: async () => result,
  });
  const remove = (filter, all = false) => {
    const removed = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      if (matches(rows[i], filter)) {
        removed.push(...rows.splice(i, 1));
        if (!all) break;
      }
    }
    return removed;
  };
  const update = (filter, data) => {
    const row = rows.find((item) => matches(item, filter));
    if (!row) return null;
    Object.assign(row, data.$set || data);
    return row;
  };
  const find = t.mock.method(ChatRequest, "find", (filter) => query(rows.filter((row) => matches(row, filter))));
  t.mock.method(ChatRequest, "findOne", async (filter) => rows.find((row) => matches(row, filter)) || null);
  t.mock.method(ChatRequest, "findById", (id) => query(rows.find((row) => row._id === id) || null));
  t.mock.method(ChatRequest, "findByIdAndDelete", async (id) => remove({ _id: id })[0] || null);
  t.mock.method(ChatRequest, "findOneAndDelete", async (filter) => remove(filter)[0] || null);
  t.mock.method(ChatRequest, "findByIdAndUpdate", async (id, data) => update({ _id: id }, data));
  t.mock.method(ChatRequest, "findOneAndUpdate", async (filter, data) => update(filter, data));
  t.mock.method(ChatRequest, "deleteOne", async (filter) => ({ deletedCount: remove(filter).length }));
  const deleteMany = t.mock.method(ChatRequest, "deleteMany", async (filter) => ({ deletedCount: remove(filter, true).length }));
  const create = t.mock.method(ChatRequest, "create", async (data) => {
    const row = record({ _id: secondId, ...data });
    rows.push(row);
    return row;
  });
  const deleteMessages = t.mock.method(Message, "deleteMany", async () => ({ deletedCount: 0 }));
  t.mock.method(User, "findOne", () => query({ displayName: "Test User" }));
  const notify = t.mock.method(push, "sendPushNotification", async () => true);
  const authenticate = t.mock.method(socketAuth, "getAuthenticatedEmail", () => actor);
  delete require.cache[require.resolve("./controllers/requestController")];
  delete require.cache[require.resolve("./socket/requests")];
  const controller = require("./controllers/requestController");
  const handlers = {};
  require("./socket/requests")(io, { id: "test-socket", on: (name, fn) => { handlers[name] = fn; } }, {
    [stranger]: new Set(["test-socket"]),
  });
  return {
    rows, events, find, create, deleteMany, deleteMessages, notify, authenticate,
    handlers,
    async http(method, body, params = {}) {
      const res = response();
      await controller[method]({ body, params, user: actor ? { email: actor } : undefined, app: { get: () => io } }, res);
      return res;
    },
    async socket(event, data) {
      const reply = t.mock.fn();
      await handlers[event](data, reply);
      assert.equal(reply.mock.callCount(), 1, `${event} must acknowledge once`);
      return reply.mock.calls[0].arguments[0];
    },
  };
};

test("HTTP rejects claimed identities that differ from the authenticated actor", async (t) => {
  const h = harness(t, [record()]);
  for (const [method, body, params] of [
    ["sendRequest", { from: stranger, to: recipient }],
    ["removeFriend", { user: stranger, friend: recipient }],
    ...["getPendingRequests", "getSentRequests", "getAcceptedChats", "getRequestStatuses"]
      .map((method) => [method, undefined, { email: stranger }]),
  ]) {
    const res = await h.http(method, body, params);
    assert.equal(res.statusCode, 403, method);
  }
  assert.equal(h.rows.length, 1);
  assert.equal(h.create.mock.callCount(), 0);
  assert.equal(h.deleteMessages.mock.callCount(), 0);
  assert.equal(h.find.mock.callCount(), 0);
  assert.deepEqual(h.events, []);
});

for (const transport of ["http", "socket"]) {
  const invoke = (h, action, body) => transport === "socket"
    ? h.socket({ send: "send-request", unsend: "unsend-request", respond: "respond-request", remove: "remove-friend" }[action], body)
    : h.http({ send: "sendRequest", unsend: "unsendRequest", respond: "respondToRequest", remove: "removeFriend" }[action], body,
      action === "unsend" ? { requestId: body?.requestId } : undefined).then((res) => res.body);

  test(`${transport}: every mutation requires an authenticated actor`, async (t) => {
    const h = harness(t, [record()], null);
    for (const [action, body] of [
      ["send", { from: sender, to: stranger }],
      ["unsend", { requestId }],
      ["respond", { requestId, action: "accepted" }],
      ["remove", { user: sender, friend: recipient }],
    ]) assert.ok((await invoke(h, action, body)).error, action);
    assert.deepEqual(h.rows, [record()]);
    assert.equal(h.deleteMessages.mock.callCount(), 0);
    assert.deepEqual(h.events, []);
  });

  test(`${transport}: sending uses normalized identity and preserves notifications`, async (t) => {
    const h = harness(t, [], " SENDER@EXAMPLE.COM ");
    const result = await invoke(h, "send", { from: " SENDER@EXAMPLE.COM ", to: " RECIPIENT@EXAMPLE.COM " });
    assert.equal(result.success, true);
    assert.equal(result.request.from, sender);
    assert.equal(result.request.to, recipient);
    assert.equal(result.request.status, "pending");
    assert.equal(h.events[0].email, recipient);
    assert.equal(h.events[0].event, "new-request");
    if (transport === "socket") assert.ok(h.authenticate.mock.callCount() > 0);
  });

  test(`${transport}: spoofed send/removal identities cannot alter another pair`, async (t) => {
    const h = harness(t, [record({ from: stranger, status: "accepted" })]);
    assert.ok((await invoke(h, "send", { from: stranger, to: recipient })).error);
    assert.ok((await invoke(h, "remove", { user: stranger, friend: recipient })).error);
    assert.equal(h.rows.length, 1);
    assert.equal(h.create.mock.callCount(), 0);
    assert.equal(h.deleteMessages.mock.callCount(), 0);
    assert.deepEqual(h.events, []);
  });

  test(`${transport}: reverse-direction pending/accepted requests prevent duplicates`, async (t) => {
    const h = harness(t);
    for (const status of ["pending", "accepted"]) {
      h.rows.splice(0, h.rows.length, record({ from: recipient, to: sender, status }));
      const result = await invoke(h, "send", { from: sender, to: recipient });
      assert.ok(result.error, status);
      assert.equal(h.rows[0].status, status);
      assert.equal(h.rows.length, 1);
    }
    assert.equal(h.create.mock.callCount(), 0);
  });

  test(`${transport}: rejected/removed pairs can receive a fresh pending request`, async (t) => {
    const h = harness(t, [record({ status: "rejected" }), record({ _id: secondId, from: recipient, to: sender, status: "removed" })]);
    const result = await invoke(h, "send", { from: sender, to: recipient });
    assert.equal(result.success, true);
    assert.equal(h.rows.length, 1);
    assert.equal(h.rows[0].status, "pending");
  });

  test(`${transport}: only a pending request's sender can cancel it`, async (t) => {
    const h = harness(t);
    for (const row of [record({ from: stranger }), record({ from: recipient, to: sender }), record({ status: "accepted" }), record({ status: "rejected" })]) {
      h.rows.splice(0, h.rows.length, row);
      assert.ok((await invoke(h, "unsend", { requestId })).error);
      assert.equal(h.rows.length, 1);
    }
    assert.deepEqual(h.events, []);
    h.rows.splice(0, h.rows.length, record());
    assert.deepEqual(await invoke(h, "unsend", { requestId }), { success: true });
    assert.equal(h.rows.length, 0);
    assert.deepEqual(h.events, [{ email: recipient, event: "request-unsent", data: { requestId, from: sender } }]);
  });

  test(`${transport}: only a pending request's recipient can respond`, async (t) => {
    const h = harness(t, [], recipient);
    for (const row of [record({ to: stranger }), record({ from: recipient, to: sender }), record({ status: "accepted" }), record({ status: "rejected" })]) {
      h.rows.splice(0, h.rows.length, row);
      assert.ok((await invoke(h, "respond", { requestId, action: "accepted" })).error);
      assert.equal(h.rows[0].status, row.status);
    }
    assert.deepEqual(h.events, []);
    assert.equal(h.notify.mock.callCount(), 0);
    for (const action of ["accepted", "rejected"]) {
      h.rows.splice(0, h.rows.length, record());
      const result = await invoke(h, "respond", { requestId, action });
      assert.equal(result.success, true);
      assert.equal(h.rows[0].status, action);
      assert.ok(h.rows[0].respondedAt instanceof Date);
      assert.ok((await invoke(h, "respond", { requestId, action })).error, "cannot replay a settled response");
    }
    assert.equal(h.notify.mock.callCount(), 1);
    assert.equal(h.events.length, 2);
    assert.ok(h.events.every((event) => event.email === sender && event.event === "request-response"));
  });

  test(`${transport}: malformed inputs and self-requests have no effects`, async (t) => {
    const h = harness(t, [record()]);
    for (const body of [undefined, null, [], "text", { from: {}, to: recipient }, { from: sender, to: {} }, { from: sender, to: " " }, { from: sender, to: sender }]) {
      assert.ok((await invoke(h, "send", body)).error);
    }
    for (const id of [undefined, null, {}, [], 1, "bad-id", "507f1f77bcf86cd79943901Z"]) {
      assert.ok((await invoke(h, "unsend", { requestId: id })).error);
      assert.ok((await invoke(h, "respond", { requestId: id, action: "accepted" })).error);
    }
    for (const action of [undefined, null, {}, [], "pending", "ACCEPTED"]) {
      assert.ok((await invoke(h, "respond", { requestId, action })).error);
    }
    for (const body of [undefined, null, { user: {}, friend: recipient }, { user: sender, friend: {} }, { user: sender, friend: sender }]) {
      assert.ok((await invoke(h, "remove", body)).error);
    }
    assert.deepEqual(h.rows, [record()]);
    assert.equal(h.deleteMessages.mock.callCount(), 0);
    assert.deepEqual(h.events, []);
  });

  test(`${transport}: friendship removal is restricted to the actor's pair in either direction`, async (t) => {
    const unrelated = record({ _id: "507f1f77bcf86cd799439013", from: stranger, status: "accepted" });
    const h = harness(t, [record({ status: "accepted" }), record({ _id: secondId, from: recipient, to: sender, status: "accepted" }), unrelated]);
    assert.deepEqual(await invoke(h, "remove", { user: sender, friend: recipient }), { success: true });
    assert.deepEqual(h.rows, [unrelated]);
    assert.deepEqual(h.deleteMessages.mock.calls[0].arguments[0], {
      $or: [{ sender, receiver: recipient }, { sender: recipient, receiver: sender }],
    });
    assert.deepEqual(h.events, [{ email: recipient, event: "friend-removed", data: { by: sender } }]);
  });
}

test("HTTP reads require identity and return only the actor's request data", async (t) => {
  const h = harness(t, [record(), record({ _id: secondId, from: stranger, to: sender })]);
  for (const method of ["getPendingRequests", "getSentRequests", "getAcceptedChats", "getRequestStatuses"]) {
    for (const email of [undefined, {}, [], " "]) {
      const res = await h.http(method, undefined, { email });
      assert.equal(res.statusCode, 400, method);
    }
  }
  const pending = await h.http("getPendingRequests", undefined, { email: sender.toUpperCase() });
  const sent = await h.http("getSentRequests", undefined, { email: sender });
  assert.deepEqual(pending.body.requests.map((row) => row._id), [secondId]);
  assert.deepEqual(sent.body.requests.map((row) => row._id), [requestId]);
});

test("HTTP rejects malformed payloads with 400 instead of database or type errors", async (t) => {
  const h = harness(t, [record()]);
  for (const body of [undefined, null, [], { from: sender, to: {} }, { from: sender, to: "not-an-email" }]) {
    assert.equal((await h.http("sendRequest", body)).statusCode, 400);
  }
  for (const id of [undefined, null, {}, [], 123, "bad-id"]) {
    assert.equal((await h.http("unsendRequest", undefined, { requestId: id })).statusCode, 400);
    assert.equal((await h.http("respondToRequest", { requestId: id, action: "accepted" })).statusCode, 400);
  }
  for (const body of [undefined, null, [], { requestId, action: {} }, { requestId, action: "pending" }]) {
    assert.equal((await h.http("respondToRequest", body)).statusCode, 400);
  }
  for (const body of [undefined, null, [], { user: sender, friend: {} }]) {
    assert.equal((await h.http("removeFriend", body)).statusCode, 400);
  }
  assert.deepEqual(h.rows, [record()]);
});

test("HTTP read endpoints reject absent authenticated identities", async (t) => {
  const h = harness(t, [record()], null);
  for (const method of ["getPendingRequests", "getSentRequests", "getAcceptedChats", "getRequestStatuses"]) {
    assert.equal((await h.http(method, undefined, { email: sender })).statusCode, 401);
  }
  assert.equal(h.find.mock.callCount(), 0);
});

test("socket malformed acknowledgements cannot throw or bypass validation", async (t) => {
  const h = harness(t, [record()]);
  for (const handler of Object.values(h.handlers)) {
    for (const callback of [undefined, {}, "not-a-function"]) {
      await assert.doesNotReject(() => handler(null, callback));
    }
  }
  assert.deepEqual(h.rows, [record()]);
  assert.deepEqual(h.events, []);
});

test("socket requests require verified registration and ignore a forged presence identity", async (t) => {
  const getVerifiedIdentity = socketAuth.getAuthenticatedEmail;
  const h = harness(t);
  h.authenticate.mock.mockImplementation(getVerifiedIdentity);
  socketAuth.unregisterSocket("test-socket");
  t.after(() => socketAuth.unregisterSocket("test-socket"));
  assert.ok((await h.socket("send-request", { from: stranger, to: recipient })).error);
  assert.equal(h.create.mock.callCount(), 0);
  socketAuth.registerSocket("test-socket", sender);
  const result = await h.socket("send-request", { from: sender, to: recipient });
  assert.equal(result.success, true);
  assert.equal(result.request.from, sender);
});

test("HTTP status views prefer accepted over pending and deduplicate reversed accepted pairs", async (t) => {
  const h = harness(t, [
    record({ status: "accepted", createdAt: new Date(100) }),
    record({ _id: secondId, from: recipient, to: sender, status: "accepted", createdAt: new Date(200) }),
    record({ _id: "507f1f77bcf86cd799439013", from: recipient, to: sender, status: "pending" }),
  ]);
  const accepted = await h.http("getAcceptedChats", undefined, { email: sender });
  assert.deepEqual(accepted.body, { success: true, partners: [recipient] });
  const statuses = await h.http("getRequestStatuses", undefined, { email: sender });
  assert.equal(statuses.body.statuses[recipient].status, "accepted");
  assert.equal(statuses.body.statuses[recipient].requestId, secondId);
  assert.equal(statuses.body.statuses[recipient].direction, "received");
});

test("HTTP status views prefer pending over newer rejected reverse records", async (t) => {
  const h = harness(t, [
    record(),
    record({ _id: secondId, from: recipient, to: sender, status: "rejected", createdAt: new Date(100) }),
  ]);
  const res = await h.http("getRequestStatuses", undefined, { email: sender });
  assert.deepEqual(res.body.statuses[recipient], { status: "pending", requestId, direction: "sent" });
});
