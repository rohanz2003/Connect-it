const test = require("node:test");
const assert = require("node:assert/strict");
const Story = require("./models/Story");
const ChatRequest = require("./models/ChatRequest");
const Message = require("./models/Message");
const controller = require("./controllers/storyController");

const owner = "owner@example.com";
const viewer = "viewer@example.com";
const storyId = "507f1f77bcf86cd799439011";
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const request = (body, email = viewer, io) => ({
  body, user: { email }, params: { storyId }, app: { get: () => io },
});
const storyDocument = (data = {}) => ({
  _id: storyId, user: owner, privacy: "private", views: [], comments: [],
  expiresAt: new Date(Date.now() + 60000), ...data,
  async save() {},
});

test("story creation rejects missing bodies and invalid field types/enums", async (t) => {
  const create = t.mock.method(Story, "create", async (data) => {
    const story = new Story(data);
    await story.validate();
    return story;
  });
  for (const body of [
    undefined,
    { mediaUrl: {}, mediaType: "image" },
    { mediaUrl: " ", mediaType: "image" },
    { mediaUrl: "image.png", mediaType: "audio" },
    { mediaUrl: "image.png", mediaType: "image", privacy: "friends" },
    { mediaUrl: "image.png", mediaType: "image", caption: {} },
  ]) {
    const res = response();
    await controller.createStory(request(body), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(create.mock.callCount(), 0);
});

test("default-public creation broadcasts without looking up private recipients", async (t) => {
  t.mock.method(Story, "create", async (data) => new Story(data));
  const chats = t.mock.method(ChatRequest, "find", () => ({ lean: async () => [] }));
  const events = [];
  const res = response();
  await controller.createStory(request({ mediaUrl: "image.png", mediaType: "image" }, owner, {
    emit: (...args) => events.push(args),
  }), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(events, [["new-story", { user: owner }]]);
  assert.equal(chats.mock.callCount(), 0);
});

test("notification failures do not turn a saved story into a failed upload", async (t) => {
  const create = t.mock.method(Story, "create", async (data) => new Story(data));
  t.mock.method(ChatRequest, "find", () => ({ lean: async () => { throw new Error("offline"); } }));
  const res = response();
  await controller.createStory(request({ mediaUrl: "image.png", mediaType: "image", privacy: "private" }, owner, {}), res);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
});

test("private notifications target accepted partners and the owner's devices once", async (t) => {
  t.mock.method(Story, "create", async (data) => new Story(data));
  t.mock.method(ChatRequest, "find", () => ({ lean: async () => [
    { from: owner, to: viewer }, { from: viewer, to: owner },
  ] }));
  const recipients = [];
  const res = response();
  await controller.createStory(request({ mediaUrl: "image.png", mediaType: "image", privacy: "private" }, owner, {
    to: (email) => ({ emit: () => recipients.push(email) }),
  }), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(recipients.sort(), [owner, viewer].sort());
});

test("private stories reject non-partners on every interaction endpoint", async (t) => {
  const story = storyDocument();
  t.mock.method(Story, "findById", async () => story);
  const saves = t.mock.method(story, "save");
  const messages = t.mock.method(Message, "create", async () => ({}));
  t.mock.method(ChatRequest, "exists", async () => null);
  for (const action of ["viewStory", "reactToStory", "commentOnStory"]) {
    const res = response();
    await controller[action](request({ reaction: "❤️", text: "hello" }), res);
    assert.equal(res.statusCode, 404, action);
  }
  assert.equal(saves.mock.callCount(), 0);
  assert.equal(messages.mock.callCount(), 0);
});

test("expired stories cannot be viewed, reacted to, or commented on before TTL cleanup", async (t) => {
  const story = storyDocument({ privacy: "public", expiresAt: new Date(0) });
  t.mock.method(Story, "findById", async () => story);
  const saves = t.mock.method(story, "save");
  t.mock.method(Message, "create", async () => ({}));
  for (const action of ["viewStory", "reactToStory", "commentOnStory"]) {
    const res = response();
    await controller[action](request({ reaction: "❤️", text: "hello" }), res);
    assert.equal(res.statusCode, 404, action);
  }
  assert.equal(saves.mock.callCount(), 0);
});

test("accepted partners can interact but do not receive other viewers or private replies", async (t) => {
  const story = storyDocument({
    views: [{ viewer: "other@example.com" }],
    comments: [{ user: "other@example.com", text: "private reply" }],
  });
  t.mock.method(Story, "findById", async () => story);
  t.mock.method(ChatRequest, "exists", async (filter) => {
    assert.deepEqual(filter, {
      status: "accepted", $or: [{ from: viewer, to: owner }, { from: owner, to: viewer }],
    });
    return { _id: "accepted" };
  });
  t.mock.method(Message, "create", async (data) => data);
  for (const action of ["viewStory", "reactToStory", "commentOnStory"]) {
    const res = response();
    await controller[action](request({ reaction: "❤️", text: "hello" }), res);
    assert.equal(res.statusCode, 200, action);
    if (res.body.views) assert.ok(res.body.views.every((v) => v.viewer === viewer));
    if (res.body.comments) assert.ok(res.body.comments.every((c) => c.user === viewer));
  }
  assert.equal(story.views.length, 2);
  assert.equal(story.comments.length, 2);
});

test("reaction and comment validation returns 400 before querying stories", async (t) => {
  const find = t.mock.method(Story, "findById", async () => null);
  for (const [action, bodies] of [
    ["reactToStory", [undefined, { reaction: {} }, { reaction: " " }]],
    ["commentOnStory", [undefined, { text: {} }, { text: 42 }]],
  ]) {
    for (const body of bodies) {
      const res = response();
      await controller[action](request(body), res);
      assert.equal(res.statusCode, 400, action);
    }
  }
  assert.equal(find.mock.callCount(), 0);
});

test("feed query excludes inaccessible media and filters response metadata per viewer", async (t) => {
  t.mock.method(ChatRequest, "find", () => ({ lean: async () => [{ from: viewer, to: owner }] }));
  const find = t.mock.method(Story, "find", () => ({ sort: () => ({ lean: async () => [
    { ...storyDocument(), views: [{ viewer }, { viewer: owner }], comments: [{ user: owner, text: "private" }] },
    { ...storyDocument({ user: viewer }), views: [{ viewer: owner }], comments: [{ user: owner, text: "visible to owner" }] },
  ] }) }));
  const res = response();
  await controller.getStories(request(), res);
  const filter = find.mock.calls[0].arguments[0];
  assert.deepEqual(filter.$or, [
    { user: viewer }, { privacy: "public" }, { privacy: "private", user: { $in: [owner] } },
  ]);
  assert.ok(filter.expiresAt.$gt instanceof Date);
  const others = res.body.stories.find((group) => group.user === owner);
  const own = res.body.stories.find((group) => group.user === viewer);
  assert.deepEqual(others.stories[0].views, [{ viewer }]);
  assert.deepEqual(others.stories[0].comments, []);
  assert.equal(others.hasUnseen, false);
  assert.equal(own.stories[0].views.length, 1);
  assert.equal(own.stories[0].comments.length, 1);
});

test("story schema declares exactly one TTL index", () => {
  assert.equal(Story.schema.indexes().filter(([keys]) => keys.expiresAt === 1).length, 1);
});
