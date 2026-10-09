const test = require("node:test");
const assert = require("node:assert/strict");
const firebase = require("./config/firebase");
const User = require("./modules/User");

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const loadAuth = () => {
  delete require.cache[require.resolve("./middleware/firebaseAuth")];
  return require("./middleware/firebaseAuth");
};
const forgedToken = `header.${Buffer.from(JSON.stringify({ email: "owner@example.com", sub: "fake" })).toString("base64url")}.signature`;

test("unconfigured Firebase returns 503 instead of accepting unsigned identities", async (t) => {
  t.mock.method(firebase, "isFirebaseConfigured", () => false);
  const upsert = t.mock.method(User, "findOneAndUpdate", async () => ({}));
  const next = t.mock.fn();
  const res = response();
  await loadAuth()({ header: () => `Bearer ${forgedToken}` }, res, next);
  assert.equal(res.statusCode, 503);
  assert.equal(next.mock.callCount(), 0);
  assert.equal(upsert.mock.callCount(), 0);
});

test("failed token verification cannot fall back to an unverified payload", async (t) => {
  t.mock.method(firebase, "isFirebaseConfigured", () => true);
  t.mock.method(firebase, "verifyFirebaseToken", async () => { throw new Error("invalid signature"); });
  const next = t.mock.fn();
  const res = response();
  await loadAuth()({ header: () => `Bearer ${forgedToken}` }, res, next);
  assert.equal(res.statusCode, 401);
  assert.equal(next.mock.callCount(), 0);
});

test("verified tokens require a string email before reaching controllers", async (t) => {
  t.mock.method(firebase, "isFirebaseConfigured", () => true);
  const verify = t.mock.method(firebase, "verifyFirebaseToken", async () => ({ uid: "verified" }));
  for (const email of [undefined, {}, " "]) {
    verify.mock.mockImplementation(async () => ({ uid: "verified", email }));
    const next = t.mock.fn();
    const res = response();
    await loadAuth()({ header: () => "Bearer verified-token" }, res, next);
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.callCount(), 0);
  }
});

test("verified users continue with normalized email", async (t) => {
  t.mock.method(firebase, "isFirebaseConfigured", () => true);
  t.mock.method(firebase, "verifyFirebaseToken", async () => ({ uid: "verified", email: " Viewer@Example.com " }));
  const upsert = t.mock.method(User, "findOneAndUpdate", async () => ({}));
  const next = t.mock.fn();
  const req = { header: () => "Bearer verified-token" };
  await loadAuth()(req, response(), next);
  assert.deepEqual(req.user, { uid: "verified", email: "viewer@example.com" });
  assert.equal(next.mock.callCount(), 1);
  assert.deepEqual(upsert.mock.calls[0].arguments[0], { email: "viewer@example.com" });
});
