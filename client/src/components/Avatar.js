import React, { useEffect, useState } from "react";

const AVATAR_COLORS = [
  "#1e88e5", "#43a047", "#e53935", "#8e24aa", "#fb8c00",
  "#00acc1", "#d81b60", "#546e7a", "#6d4c41", "#3949ab",
  "#00897b", "#c0ca33", "#f4511e", "#7b1fa2", "#039be5",
];

function getInitials(email) {
  if (!email) return "?";
  const name = email.split("@")[0];
  const parts = name.split(/[.\-_]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}

function getColorByEmail(email) {
  if (!email) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Avatar({ src, email, size = 40, className = "", onClick, style = {} }) {
  const [imgError, setImgError] = useState(false);

  const initials = getInitials(email);
  const bgColor = getColorByEmail(email);

  useEffect(() => {
    // If src changes, allow the new image to render again.
    setImgError(false);
  }, [src]);

  const commonStyle = {
    width: size,
    height: size,
    borderRadius: "50%",
    cursor: onClick ? "pointer" : "default",
    ...style,
  };

  // If we have a src but it fails to load (broken URL / blocked / invalid base64),
  // show initials fallback instead of hiding the avatar entirely.
  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={email || "User"}
        className={className}
        style={{ ...commonStyle, objectFit: "cover" }}
        onClick={onClick}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        ...commonStyle,
        backgroundColor: bgColor,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {initials}
    </div>
  );
}

export default Avatar;
