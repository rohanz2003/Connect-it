import React from "react";
import { act, render, screen } from "@testing-library/react";
import { StoryProvider, useStories } from "../../context/StoryContext";
import authAxios from "../../services/authAxios";

jest.mock("../../services/authAxios", () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock("../../context/SocketContext", () => ({ SocketContext: require("react").createContext(null) }));

let api;
function StoryState() {
  api = useStories();
  return <div data-testid="stories">{JSON.stringify(api.stories)}</div>;
}
const user = { email: "viewer@example.com" };
const story = { _id: "story", user: "owner@example.com", views: [], comments: [] };
beforeEach(() => {
  jest.clearAllMocks();
  authAxios.get.mockResolvedValue({ data: { success: true, stories: [{ user: story.user, hasUnseen: true, stories: [story] }] } });
});
const mount = async () => {
  await act(async () => render(<StoryProvider user={user}><StoryState /></StoryProvider>));
};

test("a delayed view acknowledgement does not erase a confirmed reaction", async () => {
  await mount();
  let finishView;
  authAxios.post.mockImplementationOnce(() => new Promise(resolve => { finishView = resolve; }))
    .mockResolvedValueOnce({ data: { success: true, views: [{ viewer: user.email, reaction: "❤️" }] } });
  const pendingView = api.viewStory(story._id);
  await act(async () => { await api.reactToStory(story._id, "❤️"); });
  await act(async () => {
    finishView({ data: { success: true, views: [{ viewer: user.email, reaction: null }] } });
    await pendingView;
  });
  expect(api.stories[0].hasUnseen).toBe(false);
  expect(api.stories[0].stories[0].views[0].reaction).toBe("❤️");
});

test("confirmed comments update shared story data and failed actions return failure", async () => {
  await mount();
  const comments = [{ user: user.email, text: "Hello" }];
  authAxios.post.mockResolvedValueOnce({ data: { success: true, comments } });
  await act(async () => { expect(await api.commentOnStory(story._id, "Hello")).toEqual(comments); });
  expect(screen.getByTestId("stories")).toHaveTextContent("Hello");
  const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
  authAxios.post.mockRejectedValue(new Error("Offline"));
  await act(async () => {
    expect(await api.commentOnStory(story._id, "Failed draft")).toBeNull();
    expect(await api.reactToStory(story._id, "❤️")).toBeNull();
  });
  expect(api.stories[0].stories[0].comments).toEqual(comments);
  warning.mockRestore();
});
