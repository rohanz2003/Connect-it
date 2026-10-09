import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Send, Heart, Eye, PlusCircle, Pause, Play, MessageCircle } from "lucide-react";
import Avatar from "../Avatar";
import { useStories } from "../../context/StoryContext";
import { formatMessageTime } from "../../utils/timeFormatter";
import useStoryDialog from "./useStoryDialog";

const REACTIONS = [
  { emoji: "❤️", label: "Heart" },
  { emoji: "😆", label: "Laugh" },
  { emoji: "😍", label: "Love" },
  { emoji: "🔥", label: "Flame" },
  { emoji: "⭐", label: "Star" },
];
const normalizeEmail = email => (email || "").toLowerCase().trim();

export default function StoryViewer({ stories = [], onClose, ...props }) {
  // Follow the story's identity if a refresh inserts, removes, or reorders stories.
  const [currentId, setCurrentId] = useState(stories[0]?._id);
  const currentIndex = Math.max(0, stories.findIndex(story => story._id === currentId));
  const story = stories[currentIndex];
  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) setCurrentId(stories[currentIndex + 1]._id);
    else onClose();
  }, [currentIndex, stories, onClose]);
  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentId(stories[currentIndex - 1]._id);
  }, [currentIndex, stories]);

  useEffect(() => {
    if (!story) onClose();
    else if (story._id !== currentId) setCurrentId(story._id);
  }, [story, currentId, onClose]);

  if (!story) return null;
  return <StorySlide key={story._id} {...props} story={story} stories={stories} currentIndex={currentIndex} onNext={goNext} onPrev={goPrev} onClose={onClose} />;
}

function StorySlide({ story, stories, currentIndex, userEmail, userProfiles, getDisplayName, user, onClose, onAddStory, onNext, onPrev }) {
  const { viewStory, reactToStory, commentOnStory } = useStories();
  const [progress, setProgress] = useState(0);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [duration, setDuration] = useState(story.mediaType === "video" ? 8000 : 5000);
  const [showReactions, setShowReactions] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentFocused, setCommentFocused] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState(story.comments || []);
  const [views, setViews] = useState(story.views || []);
  const [sending, setSending] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [error, setError] = useState("");
  const elapsedRef = useRef(0);
  const videoRef = useRef(null);
  const dialogRef = useRef(null);
  const mountedRef = useRef(true);
  const sendingRef = useRef(false);
  const reactingRef = useRef(false);
  const paused = manuallyPaused || hidden || showReactions || showViewers || showComments || commentFocused || !!commentText || sending || reacting;
  const isOwner = normalizeEmail(user?.email) === normalizeEmail(story.user);
  const myView = views.find(view => normalizeEmail(view.viewer) === normalizeEmail(user?.email));

  useStoryDialog(dialogRef, () => {
    if (showViewers || showComments || showReactions) {
      setShowViewers(false); setShowComments(false); setShowReactions(false);
    } else onClose();
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => { setComments(story.comments || []); }, [story.comments]);
  useEffect(() => { setViews(story.views || []); }, [story.views]);
  useEffect(() => { if (!isOwner) viewStory(story._id); }, [story._id, isOwner, viewStory]);
  useEffect(() => {
    const handleVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (paused || !mediaReady || mediaError) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = elapsedRef.current + Date.now() - startedAt;
      setProgress(Math.min(elapsed / duration * 100, 100));
      if (elapsed >= duration) {
        clearInterval(timer);
        onNext();
      }
    }, 50);
    return () => {
      clearInterval(timer);
      // Only accumulate time actually spent playing, never time spent paused.
      elapsedRef.current += Date.now() - startedAt;
    };
  }, [paused, mediaReady, mediaError, duration, onNext]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mediaReady) return;
    if (paused) video.pause();
    else video.play()?.catch(() => setManuallyPaused(true));
  }, [paused, mediaReady]);

  const handleReaction = async emoji => {
    if (reactingRef.current) return;
    reactingRef.current = true;
    setReacting(true);
    setError("");
    try {
      const updated = await reactToStory(story._id, emoji);
      if (!mountedRef.current) return;
      if (!Array.isArray(updated)) throw new Error("reaction failed");
      setViews(updated);
      setShowReactions(false);
    } catch {
      if (mountedRef.current) setError("Could not send your reaction. Please try again.");
    } finally {
      reactingRef.current = false;
      if (mountedRef.current) setReacting(false);
    }
  };

  const handleCommentSend = async event => {
    event.preventDefault();
    if (!commentText.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      const updated = await commentOnStory(story._id, commentText.trim());
      if (!mountedRef.current) return;
      if (!Array.isArray(updated)) throw new Error("comment failed");
      setComments(updated);
      setCommentText("");
      setShowComments(true);
    } catch {
      if (mountedRef.current) setError("Could not send your comment. Your draft is saved here; please try again.");
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) setSending(false);
    }
  };

  return (
    <div ref={dialogRef} className="story-viewer-overlay" role="dialog" aria-modal="true" aria-label="Story viewer" tabIndex={-1} onClick={onClose}>
      <div className="story-viewer-container" onClick={event => event.stopPropagation()}>
        <div className="story-progress-bar" aria-label={`Story ${currentIndex + 1} of ${stories.length}`}>
          {stories.map((item, index) => (
            <div key={item._id} className="story-progress-segment">
              <div className={`story-progress-fill ${paused ? "paused" : ""}`} style={{ width: index < currentIndex ? "100%" : index === currentIndex ? `${progress}%` : "0%" }} />
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
            <button className="story-viewer-action-btn" aria-label={manuallyPaused ? "Resume story" : "Pause story"} onClick={() => setManuallyPaused(value => !value)}>
              {manuallyPaused ? <Play size={18} /> : <Pause size={18} />}
            </button>
            {isOwner && onAddStory && <button className="story-viewer-action-btn" onClick={onAddStory} aria-label="Add story"><PlusCircle size={18} /></button>}
            <button className="story-viewer-close" onClick={onClose} aria-label="Close story"><X size={22} /></button>
          </div>
        </div>

        <div className="story-viewer-media" onClick={() => setManuallyPaused(value => !value)}>
          {mediaError ? <p className="story-media-status" role="alert">This story could not be loaded. Use Next to continue.</p> : story.mediaType === "video" ? (
            <video ref={videoRef} src={story.mediaUrl} muted playsInline preload="metadata" className="story-viewer-video"
              onLoadedMetadata={event => { const seconds = event.currentTarget.duration; if (Number.isFinite(seconds) && seconds > 0) setDuration(seconds * 1000); }}
              onCanPlay={() => setMediaReady(true)} onWaiting={() => setMediaReady(false)} onError={() => setMediaError(true)} />
          ) : <img src={story.mediaUrl} alt="Story" className="story-viewer-image" onLoad={() => setMediaReady(true)} onError={() => setMediaError(true)} />}
          {!mediaReady && !mediaError && <span className="story-media-status" role="status">Loading story…</span>}
          {story.caption && <p className="story-viewer-caption">{story.caption}</p>}
          {currentIndex > 0 && <button className="story-nav-btn story-nav-prev" aria-label="Previous story" onClick={event => { event.stopPropagation(); onPrev(); }}><ChevronLeft size={28} /></button>}
          <button className="story-nav-btn story-nav-next" aria-label="Next story" onClick={event => { event.stopPropagation(); onNext(); }}><ChevronRight size={28} /></button>
        </div>

        <div className="story-viewer-details">
          {isOwner && <button className="story-viewer-views-footer" onClick={() => setShowViewers(true)}><Eye size={16} /><span>{views.length ? `Viewed by ${views.length}` : "No views yet"}</span></button>}
          <button className="story-viewer-views-footer" aria-expanded={showComments} onClick={() => setShowComments(value => !value)}><MessageCircle size={16} /><span>Comments ({comments.length})</span></button>
        </div>
        {showComments && (
          <section className="story-comments-panel" aria-label="Story comments">
            <div className="story-comments-header"><span>Comments</span><button aria-label="Close comments" onClick={() => setShowComments(false)}><X size={18} /></button></div>
            <div className="story-comments-list">
              {comments.length ? comments.map((comment, index) => <div className="story-comment-item" key={comment._id || `${comment.createdAt}-${index}`}><strong>{getDisplayName?.(comment.user) || comment.user?.split("@")[0]}</strong><span>{comment.text}</span></div>) : <p className="story-viewers-popup-empty">No comments yet</p>}
            </div>
          </section>
        )}
        {error && <p className="story-action-error" role="alert">{error}</p>}
        {!isOwner && (
          <div className="story-viewer-bottom">
            <form className="story-viewer-input-wrap" onSubmit={handleCommentSend}>
              <input className="story-viewer-input" aria-label="Comment on story" placeholder="Add a comment…" value={commentText} readOnly={sending}
                onChange={event => setCommentText(event.target.value)} onFocus={() => setCommentFocused(true)} onBlur={() => setCommentFocused(false)}
                onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} />
              <button className="story-viewer-send-btn" aria-label="Send comment" disabled={!commentText.trim() || sending}><Send size={18} /></button>
            </form>
            <div className="story-viewer-reactions-wrap">
              <button className="story-viewer-emoji-btn" aria-label={myView?.reaction ? `Change reaction ${myView.reaction}` : "React to story"} aria-expanded={showReactions} onClick={() => setShowReactions(value => !value)}>
                {myView?.reaction ? <span>{myView.reaction}</span> : <Heart size={20} />}
              </button>
              {showReactions && <div className="story-reactions-popup" aria-label="Reactions">{REACTIONS.map(reaction => <button key={reaction.emoji} className="story-reaction-btn" aria-label={reaction.label} onClick={() => handleReaction(reaction.emoji)} disabled={reacting}>{reaction.emoji}</button>)}</div>}
            </div>
          </div>
        )}
        {showViewers && (
          <div className="story-viewers-overlay" onClick={() => setShowViewers(false)}>
            <section className="story-viewers-popup" aria-label="Story viewers" onClick={event => event.stopPropagation()}>
              <div className="story-viewers-popup-header"><span>Viewed by {views.length}</span><button aria-label="Close viewers" onClick={() => setShowViewers(false)}><X size={18} /></button></div>
              <div className="story-viewers-popup-list">
                {views.length ? views.map(view => <div key={view.viewer} className="story-viewers-popup-item"><Avatar src={userProfiles?.[view.viewer]} email={view.viewer} size={32} /><span className="story-viewers-popup-name">{getDisplayName?.(view.viewer) || view.viewer?.split("@")[0]}</span>{view.reaction && <span className="story-viewers-popup-reaction">{view.reaction}</span>}</div>) : <div className="story-viewers-popup-empty">No views yet</div>}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
