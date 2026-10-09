const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const http = require("node:http");
const express = require("express");
const database = require("./config/database");
const firebase = require("./config/firebase");
const User = require("./modules/User");
const Story = require("./models/Story");

// Exercise the real index middleware without opening external services or reading .env.
const loadApp = async (t, storyRoutes = express.Router()) => {
  let app;
  const expressFactory = Object.assign(() => { app = express(); return app; }, express);
  const echo = express.Router();
  echo.post("/", (req, res) => res.json(req.body));
  const startupServer = { listen: (_port, callback) => { callback(); return { on() {} }; } };
  const mocks = {
    express: expressFactory,
    http: { createServer: () => startupServer },
    "./config/env": { getCorsOrigins: () => ["http://localhost:3000"], logEnvironmentDiagnostics() {}, validateRequiredEnv: () => true },
    "./config/database": { connectDatabase: async () => {}, isDatabaseConnected: () => true },
    "./config/firebase": { isFirebaseConfigured: () => false },
    "./socket/socket": () => ({}),
    "./services/pushService": { initPush() {} },
    "./routes/userRoutes": echo,
    "./routes/messageRoutes": express.Router(),
    "./routes/feedbackRoutes": express.Router(),
    "./routes/adminRoutes": express.Router(),
    "./routes/requestRoutes": express.Router(),
    "./routes/storyRoutes": storyRoutes,
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("./index"), "utf8"), {
    require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id),
    process: { env: {}, on() {}, exit: (code) => { throw new Error(`Unexpected process exit: ${code}`); } },
    console: { log() {}, warn() {}, error() {} },
  }, { filename: "server/index.js" });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
};

test("API parses before sanitizing and returns 400/413 for malformed/oversized JSON", async (t) => {
  const url = await loadApp(t);
  const headers = { "Content-Type": "application/json", Origin: "http://localhost:3000" };
  let res = await fetch(`${url}/api/users`, {
    method: "POST", headers, body: '{"safe":{"$ne":null,"name":"ok"},"__proto__":{"polluted":true}}',
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { safe: { name: "ok" } });
  res = await fetch(`${url}/api/users`, { method: "POST", headers, body: "{" });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Invalid JSON body" });
  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:3000");
  res = await fetch(`${url}/api/users`, {
    method: "POST", headers, body: JSON.stringify({ mediaUrl: "a".repeat(5 * 1024 * 1024) }),
  });
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: "Request body too large" });
});

test("rate-limited API responses retain CORS headers", async (t) => {
  const url = await loadApp(t);
  let res;
  for (let i = 0; i <= 200; i++) {
    res = await fetch(`${url}/api/health`, { headers: { Origin: "http://localhost:3000" } });
    await res.json();
  }
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:3000");
});

test("story API rejects disconnected databases and malformed IDs before issuing queries", async (t) => {
  let connected = false;
  t.mock.method(database, "isDatabaseConnected", () => connected);
  t.mock.method(firebase, "isFirebaseConfigured", () => true);
  t.mock.method(firebase, "verifyFirebaseToken", async () => ({ uid: "user", email: "viewer@example.com" }));
  const upsert = t.mock.method(User, "findOneAndUpdate", async () => ({}));
  const find = t.mock.method(Story, "findById", async () => null);
  delete require.cache[require.resolve("./middleware/firebaseAuth")];
  delete require.cache[require.resolve("./routes/storyRoutes")];
  const url = await loadApp(t, require("./routes/storyRoutes"));
  const headers = { Authorization: "Bearer verified-token" };
  let res = await fetch(`${url}/api/stories`, { headers });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "Database unavailable" });
  assert.equal(upsert.mock.callCount(), 0);
  connected = true;
  for (const [method, path] of [["POST", "/view"], ["POST", "/react"], ["POST", "/comment"], ["DELETE", ""]]) {
    res = await fetch(`${url}/api/stories/invalid${path}`, { method, headers });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid story ID" });
  }
  assert.equal(find.mock.callCount(), 0);
  res = await fetch(`${url}/api/stories/507f1f77bcf86cd799439011/view`, { method: "POST" });
  assert.equal(res.status, 401);
  await res.json();
  res = await fetch(`${url}/api/stories/507f1f77bcf86cd799439011/view`, { method: "POST", headers });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Story not found" });
});
