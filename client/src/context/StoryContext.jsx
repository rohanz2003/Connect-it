import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import authAxios from "../services/authAxios";
import { SocketContext } from "./SocketContext";

const StoryContext = createContext(null);

export function StoryProvider({ children, user }) {
  const socket = useContext(SocketContext);
  const [stories, setStories] = useState([]);
  const [viewingStory, setViewingStory] = useState(null);
  const [storyUploading, setStoryUploading] = useState(false);
  const storiesRef = useRef(stories);
  storiesRef.current = stories;

  const fetchStories = useCallback(async () => {
    if (!user?.email) return;
    try {
      const res = await authAxios.get("/api/stories");
      if (res.data?.success) {
        setStories(res.data.stories);
      }
    } catch (err) {
      console.warn("Failed to fetch stories:", err.message);
    }
  }, [user]);

  const uploadStory = useCallback(async (file, privacy, caption) => {
    if (!user?.email) return null;
    setStoryUploading(true);
    try {
      const mediaUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await authAxios.post("/api/stories", {
        mediaUrl,
        mediaType: file.type.startsWith("video") ? "video" : "image",
        privacy: privacy || "public",
        caption: caption || "",
      });

      if (res.data?.success) {
        await fetchStories();
        return res.data.story;
      }
      return null;
    } catch (err) {
      console.error("Failed to upload story:", err.message);
      return null;
    } finally {
      setStoryUploading(false);
    }
  }, [user, fetchStories]);

  const viewStory = useCallback(async (storyId) => {
    try {
      await authAxios.post(`/api/stories/${storyId}/view`);
    } catch (err) {
      console.warn("Failed to record story view:", err.message);
    }
  }, []);

  const reactToStory = useCallback(async (storyId, reaction) => {
    try {
      await authAxios.post(`/api/stories/${storyId}/react`, { reaction });
    } catch (err) {
      console.warn("Failed to react to story:", err.message);
    }
  }, []);

  const commentOnStory = useCallback(async (storyId, text) => {
    try {
      const res = await authAxios.post(`/api/stories/${storyId}/comment`, { text });
      return res.data?.comments || [];
    } catch (err) {
      console.warn("Failed to comment on story:", err.message);
      return [];
    }
  }, []);

  const deleteStory = useCallback(async (storyId) => {
    try {
      await authAxios.delete(`/api/stories/${storyId}`);
      await fetchStories();
    } catch (err) {
      console.warn("Failed to delete story:", err.message);
    }
  }, [fetchStories]);

  useEffect(() => {
    if (user?.email) {
      fetchStories();
    }
  }, [user, fetchStories]);

  useEffect(() => {
    if (!socket) return;
    const handleNewStory = () => {
      fetchStories();
    };
    socket.on("new-story", handleNewStory);
    return () => { socket.off("new-story", handleNewStory); };
  }, [socket, fetchStories]);

  const value = {
    stories,
    viewingStory,
    setViewingStory,
    storyUploading,
    uploadStory,
    viewStory,
    reactToStory,
    commentOnStory,
    deleteStory,
    fetchStories,
  };

  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}

export function useStories() {
  const ctx = useContext(StoryContext);
  if (!ctx) throw new Error("useStories must be used within StoryProvider");
  return ctx;
}
