const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Deliberately invalid key material: only mocked SDK functions receive it.
const privateKey = "-----BEGIN PRIVATE KEY-----\nsynthetic-placeholder\n-----END PRIVATE KEY-----";
const credentials = {
  FIREBASE_PROJECT_ID: "synthetic-project",
  FIREBASE_CLIENT_EMAIL: "synthetic@example.invalid",
  FIREBASE_PRIVATE_KEY: privateKey,
};

// Isolate module state and environment; never load dotenv or use real credentials.
const loadFirebase = (t, { env = credentials, apps = [], failures = {} } = {}) => {
  const module = { exports: {} };
  const app = { name: "[DEFAULT]" };
  const credential = { synthetic: true };
  const decoded = { uid: "synthetic-user", email: "user@example.invalid" };
  const sdk = {
    getApps: t.mock.fn(() => apps),
    cert: t.mock.fn(() => {
      if (failures.cert) throw failures.cert;
      return credential;
    }),
    initializeApp: t.mock.fn(() => {
      if (failures.initializeApp) throw failures.initializeApp;
      return app;
    }),
    verifyIdToken: t.mock.fn(async () => {
      if (failures.verifyIdToken) throw failures.verifyIdToken;
      return decoded;
    }),
  };
  sdk.getAuth = t.mock.fn(() => ({ verifyIdToken: sdk.verifyIdToken }));
  const mocks = {
    // Reproduce the v14 root export's missing legacy apps/auth properties.
    "firebase-admin": {},
    "firebase-admin/app": { getApps: sdk.getApps, initializeApp: sdk.initializeApp, cert: sdk.cert },
    "firebase-admin/auth": { getAuth: sdk.getAuth },
  };
  const logs = { log: t.mock.fn(), warn: t.mock.fn(), error: t.mock.fn() };
  const isolatedEnv = { ...env };
  vm.runInNewContext(fs.readFileSync(require.resolve("./config/firebase"), "utf8"), {
    module,
    exports: module.exports,
    require: (id) => {
      assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency: ${id}`);
      return mocks[id];
    },
    process: { env: isolatedEnv },
    console: logs,
  }, { filename: "server/config/firebase.js" });
  return { ...module.exports, sdk, app, credential, decoded, logs, env: isolatedEnv };
};

test("valid credentials initialize through modular SDK APIs and cache the app", (t) => {
  const firebase = loadFirebase(t);
  assert.equal(firebase.isFirebaseConfigured(), true);
  assert.equal(firebase.initFirebase(), firebase.app);
  assert.equal(firebase.initFirebase(), firebase.app);
  assert.equal(firebase.sdk.getApps.mock.callCount(), 1);
  assert.equal(firebase.sdk.cert.mock.callCount(), 1);
  assert.deepEqual({ ...firebase.sdk.cert.mock.calls[0].arguments[0] }, {
    projectId: credentials.FIREBASE_PROJECT_ID,
    clientEmail: credentials.FIREBASE_CLIENT_EMAIL,
    privateKey,
  });
  assert.equal(firebase.sdk.initializeApp.mock.callCount(), 1);
  assert.equal(firebase.sdk.initializeApp.mock.calls[0].arguments[0].credential, firebase.credential);
});

test("an existing app is reused and its Auth instance verifies tokens", async (t) => {
  const existingApp = { name: "existing-synthetic-app" };
  const firebase = loadFirebase(t, { apps: [existingApp, { name: "other-app" }] });
  assert.equal(firebase.initFirebase(), existingApp);
  assert.equal(await firebase.verifyFirebaseToken("synthetic-id-token"), firebase.decoded);
  assert.equal(firebase.sdk.getApps.mock.callCount(), 1);
  assert.equal(firebase.sdk.cert.mock.callCount(), 0);
  assert.equal(firebase.sdk.initializeApp.mock.callCount(), 0);
  assert.equal(firebase.sdk.getAuth.mock.calls[0].arguments[0], existingApp);
  assert.deepEqual([...firebase.sdk.verifyIdToken.mock.calls[0].arguments], ["synthetic-id-token"]);
});

test("missing credentials disable initialization and token verification", async (t) => {
  for (const missing of ["all", ...Object.keys(credentials)]) {
    await t.test(missing, async (t) => {
      const env = missing === "all" ? {} : { ...credentials, [missing]: "" };
      const firebase = loadFirebase(t, { env });
      assert.equal(firebase.isFirebaseConfigured(), false);
      assert.equal(firebase.initFirebase(), null);
      await assert.rejects(firebase.verifyFirebaseToken("synthetic-id-token"), /Firebase Admin not configured/);
      assert.equal(firebase.sdk.getApps.mock.callCount(), 0);
      assert.equal(firebase.sdk.cert.mock.callCount(), 0);
      assert.equal(firebase.sdk.initializeApp.mock.callCount(), 0);
      assert.equal(firebase.sdk.getAuth.mock.callCount(), 0);
    });
  }
});

test("initially missing credentials can be supplied before a later initialization", (t) => {
  const firebase = loadFirebase(t, { env: {} });
  assert.equal(firebase.initFirebase(), null);
  Object.assign(firebase.env, credentials);
  assert.equal(firebase.isFirebaseConfigured(), true);
  assert.equal(firebase.initFirebase(), firebase.app);
});

test("malformed keys are rejected before calling the SDK", async (t) => {
  for (const key of ["   ", '""', "synthetic-not-a-pem-key"]) {
    const firebase = loadFirebase(t, { env: { ...credentials, FIREBASE_PRIVATE_KEY: key } });
    // The public configuration check remains a presence check, not key validation.
    assert.equal(firebase.isFirebaseConfigured(), true);
    assert.equal(firebase.initFirebase(), null);
    await assert.rejects(firebase.verifyFirebaseToken("synthetic-id-token"), /Firebase Admin not configured/);
    assert.equal(firebase.sdk.cert.mock.callCount(), 0);
    assert.equal(firebase.sdk.initializeApp.mock.callCount(), 0);
    assert.equal(firebase.sdk.getAuth.mock.callCount(), 0);
  }
});

test("private keys preserve real newlines and normalize escaped newlines and wrapping quotes", async (t) => {
  const cases = [
    ["real newlines", privateKey],
    ["surrounding whitespace", `  ${privateKey}\n  `],
    ["escaped LF", privateKey.replace(/\n/g, "\\n")],
    ["double-quoted escaped LF", `"${privateKey.replace(/\n/g, "\\n")}"`],
    ["single-quoted escaped CRLF", `'${privateKey.replace(/\n/g, "\\r\\n")}'`],
  ];
  for (const [name, key] of cases) {
    await t.test(name, (t) => {
      const firebase = loadFirebase(t, { env: { ...credentials, FIREBASE_PRIVATE_KEY: key } });
      assert.equal(firebase.initFirebase(), firebase.app);
      assert.equal(firebase.sdk.cert.mock.calls[0].arguments[0].privateKey, privateKey);
    });
  }
});

test("SDK credential and initialization failures disable verification without repeated retries", async (t) => {
  for (const stage of ["cert", "initializeApp"]) {
    await t.test(stage, async (t) => {
      const firebase = loadFirebase(t, { failures: { [stage]: new Error("Synthetic SDK failure") } });
      assert.equal(firebase.initFirebase(), null);
      assert.equal(firebase.initFirebase(), null);
      await assert.rejects(firebase.verifyFirebaseToken("synthetic-id-token"), /Firebase Admin not configured/);
      assert.equal(firebase.sdk[stage].mock.callCount(), 1);
      assert.equal(firebase.logs.error.mock.callCount(), 1);
      assert.equal(firebase.sdk.getAuth.mock.callCount(), 0);
    });
  }
});

test("verifyFirebaseToken returns the SDK result using the initialized app", async (t) => {
  const firebase = loadFirebase(t);
  assert.equal(await firebase.verifyFirebaseToken("synthetic-id-token"), firebase.decoded);
  assert.equal(firebase.sdk.getAuth.mock.calls[0].arguments[0], firebase.app);
  assert.deepEqual([...firebase.sdk.verifyIdToken.mock.calls[0].arguments], ["synthetic-id-token"]);
});

test("empty or non-string tokens never reach Auth", async (t) => {
  const firebase = loadFirebase(t);
  for (const token of [undefined, null, "", 42, {}, []]) {
    await assert.rejects(firebase.verifyFirebaseToken(token), /Invalid token: not a string/);
  }
  assert.equal(firebase.sdk.getAuth.mock.callCount(), 0);
  assert.equal(firebase.sdk.verifyIdToken.mock.callCount(), 0);
});

test("token verification errors propagate without accepting a token", async (t) => {
  const error = new Error("Synthetic invalid signature");
  const firebase = loadFirebase(t, { failures: { verifyIdToken: error } });
  await assert.rejects(firebase.verifyFirebaseToken("synthetic-invalid-token"), (actual) => actual === error);
  assert.equal(firebase.sdk.verifyIdToken.mock.callCount(), 1);
});
