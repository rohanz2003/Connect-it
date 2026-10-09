const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Every dependency is explicitly mocked: no SDK, database, services, or .env loads.
const loadController = (t, { app = { name: "synthetic-admin-app" }, failures = {} } = {}) => {
  const module = { exports: {} };
  const userRecord = { uid: "synthetic-user-id" };
  const auth = {
    getUserByEmail: t.mock.fn(async () => {
      if (failures.getUserByEmail) throw failures.getUserByEmail;
      return userRecord;
    }),
    deleteUser: t.mock.fn(async () => {
      if (failures.deleteUser) throw failures.deleteUser;
    }),
  };
  const getAuth = t.mock.fn(() => {
    if (failures.getAuth) throw failures.getAuth;
    return auth;
  });
  const initFirebase = t.mock.fn(() => {
    if (failures.initFirebase) throw failures.initFirebase;
    return app;
  });
  const models = {};
  const mocks = {
    // Reproduce v14's missing root auth() API when testing the original code.
    "firebase-admin": {},
    "firebase-admin/auth": { getAuth },
    "../config/firebase": { initFirebase },
    mongoose: {},
    "../utils/messageCrypto": {},
    "../services/pushService": {},
    "../services/emailService": {},
  };
  for (const name of ["User", "Message", "ClearedChat", "ChatRequest", "Feedback", "PushSubscription", "Device"]) {
    const method = name === "User" ? "deleteOne" : "deleteMany";
    models[name] = t.mock.fn(async () => {
      if (name === "User" && failures.database) throw failures.database;
      return { deletedCount: 1 };
    });
    mocks[`../${name === "User" ? "modules" : "models"}/${name}`] = { [method]: models[name] };
  }
  const logs = { log: t.mock.fn(), warn: t.mock.fn(), error: t.mock.fn() };
  vm.runInNewContext(fs.readFileSync(require.resolve("./controllers/adminController"), "utf8"), {
    module,
    exports: module.exports,
    require: (id) => {
      assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency: ${id}`);
      return mocks[id];
    },
    process: { env: {} },
    console: logs,
  }, { filename: "server/controllers/adminController.js" });
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const req = { params: { email: "Synthetic.User@Example.Invalid" }, adminEmail: "admin@example.invalid" };
  return { ...module.exports, app, auth, getAuth, initFirebase, models, userRecord, logs, req, res };
};

const assertResponse = (res, firebaseDeleted) => {
  assert.equal(res.statusCode, 200);
  assert.deepEqual({ ...res.body }, {
    success: true,
    message: "User synthetic.user@example.invalid deleted",
    firebaseDeleted,
  });
};

test("admin deletion uses the initialized app's Auth to look up and delete the Firebase user", async (t) => {
  const controller = loadController(t);
  await controller.adminDeleteUser(controller.req, controller.res);

  assertResponse(controller.res, true);
  assert.equal(controller.initFirebase.mock.callCount(), 1);
  assert.equal(controller.getAuth.mock.callCount(), 1);
  assert.equal(controller.getAuth.mock.calls[0].arguments[0], controller.app);
  assert.equal(controller.auth.getUserByEmail.mock.callCount(), 1);
  assert.deepEqual([...controller.auth.getUserByEmail.mock.calls[0].arguments], ["synthetic.user@example.invalid"]);
  assert.equal(controller.auth.deleteUser.mock.callCount(), 1);
  assert.deepEqual([...controller.auth.deleteUser.mock.calls[0].arguments], [controller.userRecord.uid]);
  assert.equal(controller.logs.warn.mock.callCount(), 0);

  const email = "synthetic.user@example.invalid";
  const expectedQueries = {
    User: { email },
    Message: { $or: [{ sender: email }, { receiver: email }] },
    ClearedChat: { $or: [{ user: email }, { partner: email }] },
    ChatRequest: { $or: [{ from: email }, { to: email }] },
    Feedback: { email },
    PushSubscription: { userId: email },
    Device: { userId: email },
  };
  for (const [name, query] of Object.entries(expectedQueries)) {
    const operation = controller.models[name];
    assert.equal(operation.mock.callCount(), 1, name);
    assert.deepEqual(JSON.parse(JSON.stringify(operation.mock.calls[0].arguments)), [query], name);
  }
});

test("an unavailable Firebase app skips Auth and preserves the database-only response", async (t) => {
  const controller = loadController(t, { app: null });
  await controller.adminDeleteUser(controller.req, controller.res);
  assertResponse(controller.res, false);
  assert.equal(controller.initFirebase.mock.callCount(), 1);
  assert.equal(controller.getAuth.mock.callCount(), 0);
  assert.equal(controller.auth.getUserByEmail.mock.callCount(), 0);
  assert.equal(controller.auth.deleteUser.mock.callCount(), 0);
  assert.equal(controller.logs.warn.mock.callCount(), 0);
});

test("a Firebase user missing during lookup or deletion is treated as already deleted", async (t) => {
  for (const stage of ["getUserByEmail", "deleteUser"]) {
    await t.test(stage, async (t) => {
      const error = Object.assign(new Error("Synthetic missing user"), { code: "auth/user-not-found" });
      const controller = loadController(t, { failures: { [stage]: error } });
      await controller.adminDeleteUser(controller.req, controller.res);
      assertResponse(controller.res, true);
      assert.equal(controller.auth.getUserByEmail.mock.callCount(), 1);
      assert.equal(controller.auth.deleteUser.mock.callCount(), stage === "deleteUser" ? 1 : 0);
      assert.equal(controller.logs.warn.mock.callCount(), 0);
    });
  }
});

test("Firebase failures preserve success for database cleanup and report firebaseDeleted false", async (t) => {
  for (const stage of ["initFirebase", "getAuth", "getUserByEmail", "deleteUser"]) {
    await t.test(stage, async (t) => {
      const error = new Error("Synthetic Firebase failure");
      const controller = loadController(t, { failures: { [stage]: error } });
      await controller.adminDeleteUser(controller.req, controller.res);
      assertResponse(controller.res, false);
      assert.equal(controller.auth.deleteUser.mock.callCount(), stage === "deleteUser" ? 1 : 0);
      assert.equal(controller.logs.warn.mock.callCount(), 1);
      assert.equal(controller.logs.warn.mock.calls[0].arguments[1], error.message);
      assert.equal(controller.logs.error.mock.callCount(), 0);
      assert.equal(controller.models.User.mock.callCount(), 1);
    });
  }
});

test("database failure returns 500 without attempting Firebase deletion", async (t) => {
  const controller = loadController(t, { failures: { database: new Error("Synthetic database failure") } });
  await controller.adminDeleteUser(controller.req, controller.res);
  assert.equal(controller.res.statusCode, 500);
  assert.deepEqual({ ...controller.res.body }, { error: "Failed to delete user" });
  assert.equal(controller.initFirebase.mock.callCount(), 0);
  assert.equal(controller.getAuth.mock.callCount(), 0);
  assert.equal(controller.auth.deleteUser.mock.callCount(), 0);
});

test("missing email and self-deletion are rejected before any deletion calls", async (t) => {
  for (const [email, message] of [[undefined, "Email is required"], ["ADMIN@EXAMPLE.INVALID", "Cannot delete your own admin account"]]) {
    await t.test(message, async (t) => {
      const controller = loadController(t);
      controller.req.params.email = email;
      await controller.adminDeleteUser(controller.req, controller.res);
      assert.equal(controller.res.statusCode, 400);
      assert.deepEqual({ ...controller.res.body }, { error: message });
      for (const operation of Object.values(controller.models)) {
        assert.equal(operation.mock.callCount(), 0);
      }
      assert.equal(controller.initFirebase.mock.callCount(), 0);
      assert.equal(controller.getAuth.mock.callCount(), 0);
      assert.equal(controller.auth.deleteUser.mock.callCount(), 0);
    });
  }
});
