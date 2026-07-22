import React, { useState, useRef } from "react";
import { X, Image, Film, Globe, Lock, Send } from "lucide-react";
import { useStories } from "../../context/StoryContext";

export default function StoryUploader({ onClose }) {
  const { uploadStory, storyUploading } = useStories();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [privacy, setPrivacy] = useState("public");
  const [caption, setCaption] = useState("");
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    const result = await uploadStory(file, privacy, caption);
    if (result) {
      setFile(null);
      setPreview(null);
      setCaption("");
      setPrivacy("public");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  return (
    <div className="story-uploader-overlay" onClick={onClose}>
      <div className="story-uploader-modal" onClick={e => e.stopPropagation()} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
        <button className="story-uploader-close" onClick={(e) => { e.stopPropagation(); onClose(); }}><X size={20} /></button>
        <h3 className="story-uploader-title">Create Story</h3>

        {!preview ? (
          <div className="story-uploader-dropzone" onClick={() => fileInputRef.current?.click()}>
            <div className="story-uploader-drop-icon">
              <Image size={40} />
              <Film size={40} />
            </div>
            <p>Tap to choose a photo or video</p>
            <p className="story-uploader-hint">or drag & drop here</p>
          </div>
        ) : (
          <div className="story-uploader-preview-wrap">
            {file?.type?.startsWith("video") ? (
              <video src={preview} className="story-uploader-preview" autoPlay muted loop />
            ) : (
              <img src={preview} alt="Preview" className="story-uploader-preview" />
            )}
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} style={{ display: "none" }} />

        {preview && (
          <>
            <div className="story-uploader-caption-wrap">
              <input
                className="story-uploader-caption"
                placeholder="Write a caption..."
                value={caption}
                onChange={e => setCaption(e.target.value)}
                maxLength={150}
              />
            </div>

            <div className="story-uploader-privacy">
              <button
                className={`story-privacy-btn ${privacy === "public" ? "active" : ""}`}
                onClick={() => setPrivacy("public")}
              >
                <Globe size={16} /> Public
              </button>
              <button
                className={`story-privacy-btn ${privacy === "private" ? "active" : ""}`}
                onClick={() => setPrivacy("private")}
              >
                <Lock size={16} /> Private
              </button>
            </div>

            <button
              className="story-uploader-submit"
              onClick={handleUpload}
              disabled={storyUploading}
            >
              {storyUploading ? "Uploading..." : <><Send size={18} /> Post Story</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
