import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Send, Heart, Smile, Laugh, Flame, Star, Eye, PlusCircle } from "lucide-react";
import Avatar from "../Avatar";
import { useStories } from "../../context/StoryContext";
import { formatMessageTime } from "../../utils/timeFormatter";

const REACTIONS = [
  { emoji: "\u2764\uFE0F", label: "Heart", icon: <Heart size={18} /> },
  { emoji: "\uD83D\uDE06", label: "Laugh", icon: <Smile size={18} /> },
  { emoji: "\uD83D\uDE0D", label: "Love", icon: <Laugh size={18} /> },
  { emoji: "\uD83D\uDD25", label: "Flame", icon: <Flame size={18} /> },
  { emoji: "\u2B50", label: "Star", icon: <Star size={18} /> },
];

export default function StoryViewer({ userEmail, stories, userProfiles, getDisplayName, user, onClose, onAddStory }) {
  const { viewStory, reactToStory, commentOnStory } = useStories();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showReactions, setShowReactions] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState([]);
  const [showViewers, setShowViewers] = useState(false);
  const timerRef = useRef(null);
  const story = stories[currentIndex];

  const isOwner = user?.email === story?.user;

  const duration = story?.mediaType === "video" ? 8000 : 5000;

  const markViewed = useCallback(async () => {
    if (story?._id) {
      await viewStory(story._id);
    }
  }, [story, viewStory]);

  useEffect(() => {
    if (!story?._id) return;
    markViewed();
    setProgress(0);
    setComments(story.comments || []);
    setShowReactions(false);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timerRef.current);
        goNext();
      }
    }, 50);

    return () => { clearInterval(timerRef.current); };
  }, [currentIndex, story?._id]);

  const goNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
    }
  };

  const handleReaction = async (emoji) => {
    if (!story?._id) return;
    await reactToStory(story._id, emoji);
    setShowReactions(false);
  };

  const handleCommentSend = async () => {
    if (!commentText.trim() || !story?._id) return;
    const updated = await commentOnStory(story._id, commentText.trim());
    if (updated.length > 0) setComments(updated);
    setCommentText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCommentSend();
    }
  };

  if (!story || !userEmail) return null;

  const viewerList = story.views || [];
  const myView = viewerList.find(v => v.viewer === user?.email);

  return (
    <div className="story-viewer-overlay" onClick={onClose}>
      <div className="story-viewer-container" onClick={e => e.stopPropagation()}>
        <button className="story-viewer-close" onClick={onClose}><X size={22} /></button>

        <div className="story-progress-bar">
          {stories.map((s, i) => (
            <div key={s._id} className="story-progress-segment">
              <div
                className="story-progress-fill"
                style={{
                  width: i < currentIndex ? "100%" : i === currentIndex ? `${progress}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>

        <div className="story-viewer-header">
          <div className="story-viewer-user">
            <Avatar src={userProfiles?.[userEmail]} email={userEmail} size={36} />
            <div className="story-viewer-user-info">
              <span className="story-viewer-username">{getDisplayName?.(userEmail) || userEmail?.split("@")[0]}</span>
              <span className="story-viewer-time">{formatMessageTime(story.createdAt)}</span>
            </div>
          </div>
          <div className="story-viewer-actions-header">
            {isOwner && onAddStory && (
              <button className="story-viewer-action-btn" onClick={onAddStory} title="Add story">
                <PlusCircle size={18} />
              </button>
            )}
            <button className="story-viewer-action-btn" onClick={() => setShowViewers(!showViewers)} title="Views">
              <Eye size={18} />
              <span>{viewerList.length}</span>
            </button>
          </div>
        </div>

        <div className="story-viewer-media">
          {story.mediaType === "video" ? (
            <video src={story.mediaUrl} autoPlay muted className="story-viewer-video" />
          ) : (
            <img src={story.mediaUrl} alt="Story" className="story-viewer-image" />
          )}
          {story.caption && <p className="story-viewer-caption">{story.caption}</p>}
        </div>

        {currentIndex > 0 && (
          <button className="story-nav-btn story-nav-prev" onClick={goPrev}><ChevronLeft size={28} /></button>
        )}
        {currentIndex < stories.length - 1 && (
          <button className="story-nav-btn story-nav-next" onClick={goNext}><ChevronRight size={28} /></button>
        )}

        {/* Bottom: owner sees viewer list; others see comment input + reactions */}
        {isOwner ? (
          <div className="story-viewer-bottom">
            <div className="story-viewer-views-footer">
              <Eye size={16} />
              <span>Viewed by {viewerList.length > 0 ? viewerList.map(v => getDisplayName?.(v.viewer) || v.viewer?.split("@")[0]).join(", ") : "no one yet"}</span>
            </div>
          </div>
        ) : (
          <div className="story-viewer-bottom">
            <div className="story-viewer-input-wrap">
              <input
                className="story-viewer-input"
                placeholder="Send a message..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button className="story-viewer-send-btn" onClick={handleCommentSend} disabled={!commentText.trim()}>
                <Send size={18} />
              </button>
            </div>
            <div className="story-viewer-reactions-wrap">
              <button className="story-viewer-emoji-btn" onClick={() => setShowReactions(!showReactions)}>
                {myView?.reaction ? <span style={{ fontSize: 22 }}>{myView.reaction}</span> : <Heart size={20} />}
              </button>
              {showReactions && (
                <div className="story-reactions-popup">
                  {REACTIONS.map(r => (
                    <button key={r.emoji} className="story-reaction-btn" onClick={() => handleReaction(r.emoji)} title={r.label}>
                      {r.emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Viewers panel (togglable for everyone) */}
        {showViewers && (
          <div className="story-viewers-panel">
            <div className="story-viewers-header">
              <span>Viewed by {viewerList.length}</span>
              <button onClick={() => setShowViewers(false)}><X size={16} /></button>
            </div>
            <div className="story-viewers-list">
              {viewerList.length > 0 ? viewerList.map((v, i) => (
                <div key={i} className="story-viewer-item">
                  <Avatar src={userProfiles?.[v.viewer]} email={v.viewer} size={28} />
                  <span>{getDisplayName?.(v.viewer) || v.viewer?.split("@")[0]}</span>
                  {v.reaction && <span style={{ marginLeft: "auto", fontSize: 18 }}>{v.reaction}</span>}
                </div>
              )) : (
                <div className="story-viewer-item" style={{ opacity: 0.5 }}>No views yet</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
