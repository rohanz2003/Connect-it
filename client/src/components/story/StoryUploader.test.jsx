import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import StoryUploader from "./StoryUploader";
import { useStories } from "../../context/StoryContext";

jest.mock("../../context/StoryContext", () => ({ useStories: jest.fn() }));

beforeEach(() => {
  URL.createObjectURL = jest.fn(file => `blob:${file.name}`);
  URL.revokeObjectURL = jest.fn();
  useStories.mockReturnValue({ uploadStory: jest.fn().mockResolvedValue(null), storyUploading: false });
});

test("validates dropped files and releases previews when replaced or closed", () => {
  const { unmount } = render(<StoryUploader onClose={jest.fn()} />);
  fireEvent.drop(screen.getByText("Create Story"), { dataTransfer: { files: [new File(["text"], "notes.txt", { type: "text/plain" })] } });
  expect(screen.getByRole("alert")).toHaveTextContent("Choose a photo or video");
  const input = screen.getByLabelText("Story photo or video");
  fireEvent.change(input, { target: { files: [new File(["photo"], "first.png", { type: "image/png" })] } });
  expect(screen.getByAltText("Preview")).toHaveAttribute("src", "blob:first.png");
  fireEvent.change(input, { target: { files: [new File(["photo"], "next.png", { type: "image/png" })] } });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first.png");
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:next.png");
});

test("keeps upload failures editable and prevents duplicate posts while awaiting completion", async () => {
  let resolveUpload;
  const uploadStory = jest.fn().mockResolvedValueOnce(null).mockImplementationOnce(() => new Promise(resolve => { resolveUpload = resolve; }));
  useStories.mockReturnValue({ uploadStory, storyUploading: false });
  const onClose = jest.fn();
  render(<StoryUploader onClose={onClose} />);
  const file = new File(["photo"], "photo.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Story photo or video"), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("Story caption"), { target: { value: "My caption" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Post Story" })));
  expect(screen.getByRole("alert")).toHaveTextContent("could not be posted");
  expect(screen.getByLabelText("Story caption")).toHaveValue("My caption");
  fireEvent.click(screen.getByRole("button", { name: "Post Story" }));
  fireEvent.click(screen.getByRole("button", { name: "Uploading..." }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(uploadStory).toHaveBeenCalledTimes(2);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => resolveUpload({ _id: "new-story" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(uploadStory).toHaveBeenLastCalledWith(file, "public", "My caption");
});

test("rejects files that cannot fit the base64 API request before preview or upload", () => {
  render(<StoryUploader onClose={jest.fn()} />);
  const file = new File([new Uint8Array(3 * 1024 * 1024 + 1)], "large.mp4", { type: "video/mp4" });
  fireEvent.change(screen.getByLabelText("Story photo or video"), { target: { files: [file] } });
  expect(screen.getByRole("alert")).toHaveTextContent("3MB or less");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Post Story" })).not.toBeInTheDocument();
});
