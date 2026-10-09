import { isSameMessage } from "./messageIdentity";

test("missing temporary IDs cannot match unrelated persisted messages", () => {
  expect(isSameMessage({ _id: "first" }, { _id: "second" })).toBe(false);
  expect(isSameMessage({}, {})).toBe(false);
  expect(isSameMessage({ tempId: null }, { tempId: null })).toBe(false);
});

test("server receipts match either a real ID or the optimistic temporary ID", () => {
  expect(isSameMessage({ _id: "first" }, { _id: "first" })).toBe(true);
  expect(isSameMessage({ _id: "temporary", tempId: "client-id" }, { _id: "saved", tempId: "client-id" })).toBe(true);
  expect(isSameMessage(null, { _id: "first" })).toBe(false);
});
