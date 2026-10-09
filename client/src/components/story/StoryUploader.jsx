import React, { useState, useRef, useEffect } from "react";
import { X, Image, Film, Globe, Lock, Send } from "lucide-react";
import { useStories } from "../../context/StoryContext";
import useStoryDialog from "./useStoryDialog";

export default function StoryUploader({ onClose }) {
  const { uploadStory, storyUploading } = useStories();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [privacy, setPrivacy] = useState("public");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const dialogRef = useRef(null);
  const uploadingRef = useRef(false);
  const busy = submitting || storyUploading;
  const close = () => { if (!uploadingRef.current && !storyUploading) onClose(); };
  useStoryDialog(dialogRef, close);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const selectFile = selected => {
    if (!selected || busy) return;
    if (!/^(image|video)\//.test(selected.type)) {
      setError("Choose a photo or video file.");
      return;
    }
    if (!selected.size) {
      setError("This file is empty. Choose another photo or video.");
      return;
    }
    // Base64 expands by a third; leave room for JSON below the API's 5 MB cap.
    if (selected.size > 3 * 1024 * 1024) {
      setError("Choose a photo or video of 3MB or less. Trim or compress larger videos first.");
      return;
    }
    setError("");
    setFile(selected);
  };

  const handleFileSelect = (e) => {
    selectFile(e.target.files?.[0]);
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!file || uploadingRef.current || storyUploading) return;
    uploadingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const result = await uploadStory(file, privacy, caption.trim());
      if (result) onClose();
      else setError("Your story could not be posted. Please try again.");
    } catch {
      setError("Your story could not be posted. Please try again.");
    } finally {
      uploadingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    selectFile(e.dataTransfer?.files?.[0]);
  };

  return (
    <div ref={dialogRef} className="story-uploader-overlay" role="dialog" aria-modal="true" aria-labelledby="story-uploader-title" tabIndex={-1} onClick={close}>
      <div className="story-uploader-modal" onClick={e => e.stopPropagation()} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
        <button className="story-uploader-close" onClick={close} aria-label="Close uploader" disabled={busy}><X size={20} /></button>
        <h3 id="story-uploader-title" className="story-uploader-title">Create Story</h3>

        {!preview ? (
          <button type="button" className="story-uploader-dropzone" onClick={() => fileInputRef.current?.click()}>
            <div className="story-uploader-drop-icon">
              <Image size={40} />
              <Film size={40} />
            </div>
            <span>Tap to choose a photo or video</span>
            <span className="story-uploader-hint">or drag & drop here</span>
            <span className="story-uploader-hint">Photos and videos up to 3MB</span>
          </button>
        ) : (
          <div className="story-uploader-preview-wrap">
            {file?.type?.startsWith("video") ? (
              <video src={preview} className="story-uploader-preview" autoPlay muted loop playsInline />
            ) : (
              <img src={preview} alt="Preview" className="story-uploader-preview" />
            )}
          </div>
        )}

        <input ref={fileInputRef} type="file" aria-label="Story photo or video" accept="image/*,video/*" disabled={busy} onChange={handleFileSelect} style={{ display: "none" }} />
        {error && <p className="story-upload-error" role="alert">{error}</p>}

        {preview && (
          <>
            <button className="story-uploader-change" onClick={() => fileInputRef.current?.click()} disabled={busy}>Choose another photo or video</button>
            <div className="story-uploader-caption-wrap">
              <input
                className="story-uploader-caption"
                aria-label="Story caption"
                disabled={busy}
                placeholder="Write a caption..."
                value={caption}
                onChange={e => setCaption(e.target.value)}
                maxLength={150}
              />
            </div>

            <div className="story-uploader-privacy">
              <button
                className={`story-privacy-btn ${privacy === "public" ? "active" : ""}`}
                disabled={busy}
                aria-pressed={privacy === "public"}
                onClick={() => setPrivacy("public")}
              >
                <Globe size={16} /> Public
              </button>
              <button
                className={`story-privacy-btn ${privacy === "private" ? "active" : ""}`}
                disabled={busy}
                aria-pressed={privacy === "private"}
                onClick={() => setPrivacy("private")}
              >
                <Lock size={16} /> Private
              </button>
            </div>

            <button
              className="story-uploader-submit"
              onClick={handleUpload}
              disabled={busy}
            >
              {busy ? "Uploading..." : <><Send size={18} /> Post Story</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
