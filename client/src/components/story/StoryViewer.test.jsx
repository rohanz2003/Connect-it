import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import StoryViewer from "./StoryViewer";
import { useStories } from "../../context/StoryContext";

jest.mock("../../context/StoryContext", () => ({ useStories: jest.fn() }));
jest.mock("../Avatar", () => () => <span />);

const makeStory = (id, extra = {}) => ({ _id: id, user: "owner@example.com", mediaType: "image", mediaUrl: `${id}.jpg`, caption: id, createdAt: "2026-01-01T12:00:00Z", comments: [], views: [], ...extra });
const first = makeStory("first");
const second = makeStory("second");
const third = makeStory("third");
const props = { userEmail: first.user, user: { email: "viewer@example.com" }, stories: [first, second, third], onClose: jest.fn() };
const loadImage = () => fireEvent.load(screen.getByRole("img", { name: "Story" }));
const advance = milliseconds => act(() => jest.advanceTimersByTime(milliseconds));

beforeEach(() => {
  jest.useFakeTimers("modern");
  jest.clearAllMocks();
  useStories.mockReturnValue({ viewStory: jest.fn().mockResolvedValue(), reactToStory: jest.fn(), commentOnStory: jest.fn() });
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test("waits for media, advances all equal-duration stories, then closes once", () => {
  render(<StoryViewer {...props} />);
  advance(10000);
  expect(screen.getByText("first")).toBeInTheDocument();
  for (const caption of ["first", "second", "third"]) {
    expect(screen.getByText(caption)).toBeInTheDocument();
    loadImage();
    advance(5000);
  }
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test("pause and resume preserve remaining playback time and navigation works while paused", () => {
  render(<StoryViewer {...props} />);
  loadImage();
  advance(2000);
  fireEvent.click(screen.getByRole("button", { name: "Pause story" }));
  advance(20000);
  fireEvent.click(screen.getByRole("button", { name: "Resume story" }));
  advance(2900);
  expect(screen.getByText("first")).toBeInTheDocument();
  advance(100);
  expect(screen.getByText("second")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Pause story" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous story" }));
  expect(screen.getByText("first")).toBeInTheDocument();
});

test("keeps the active story when live data is reordered without restarting its timer", () => {
  const { rerender } = render(<StoryViewer {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Next story" }));
  loadImage();
  advance(2000);
  rerender(<StoryViewer {...props} stories={[third, { ...second, views: [{ viewer: "someone@example.com" }] }, first]} />);
  expect(screen.getByText("second")).toBeInTheDocument();
  advance(3000);
  expect(screen.getByText("first")).toBeInTheDocument();
});

test("pauses while composing, retains failed drafts, and displays successfully sent comments", async () => {
  const commentOnStory = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce([{ user: props.user.email, text: "Nice photo!" }]);
  useStories.mockReturnValue({ viewStory: jest.fn(), reactToStory: jest.fn(), commentOnStory });
  render(<StoryViewer {...props} />);
  loadImage();
  const input = screen.getByRole("textbox", { name: "Comment on story" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Nice photo!" } });
  advance(20000);
  expect(screen.getByText("first")).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send comment" })));
  expect(input).toHaveValue("Nice photo!");
  expect(screen.getByRole("alert")).toHaveTextContent("Could not send your comment");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send comment" })));
  expect(input).toHaveValue("");
  expect(screen.getByLabelText("Story comments")).toHaveTextContent("Nice photo!");
  expect(commentOnStory).toHaveBeenLastCalledWith("first", "Nice photo!");
});

test("ignores a delayed comment response after navigating to another story", async () => {
  let resolveComment;
  const commentOnStory = jest.fn(() => new Promise(resolve => { resolveComment = resolve; }));
  useStories.mockReturnValue({ viewStory: jest.fn(), reactToStory: jest.fn(), commentOnStory });
  render(<StoryViewer {...props} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "First comment" } });
  fireEvent.click(screen.getByRole("button", { name: "Send comment" }));
  fireEvent.click(screen.getByRole("button", { name: "Next story" }));
  await act(async () => resolveComment([{ user: props.user.email, text: "First comment" }]));
  expect(screen.getByText("second")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Comments (0)" })).toBeInTheDocument();
  expect(screen.queryByText("First comment")).not.toBeInTheDocument();
});

test("pauses for reactions, displays the confirmed reaction, and lets owners read comments", async () => {
  const reactToStory = jest.fn().mockResolvedValue([{ viewer: props.user.email, reaction: "❤️" }]);
  useStories.mockReturnValue({ viewStory: jest.fn(), commentOnStory: jest.fn(), reactToStory });
  const { unmount } = render(<StoryViewer {...props} />);
  loadImage();
  fireEvent.click(screen.getByRole("button", { name: "React to story" }));
  advance(10000);
  expect(screen.getByText("first")).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Heart" })));
  expect(screen.getByRole("button", { name: "Change reaction ❤️" })).toBeInTheDocument();
  unmount();
  render(<StoryViewer {...props} user={{ email: first.user }} stories={[makeStory("own", { comments: [{ user: props.user.email, text: "Great story" }] })]} />);
  fireEvent.click(screen.getByRole("button", { name: "Comments (1)" }));
  expect(screen.getByText("Great story")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

test("an expired story list closes the viewer instead of leaving an invisible modal", () => {
  const { rerender } = render(<StoryViewer {...props} />);
  rerender(<StoryViewer {...props} stories={[]} />);
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
