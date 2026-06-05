import React from "react";
import "./Avatar.css";

const Avatar = React.memo(({ email, name, src, size = "md", onClick }) => {
  const firstLetter = (name || email || "?").charAt(0).toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name || email}
        className={`user-avatar avatar-${size}`}
        onClick={onClick}
        style={{ cursor: onClick ? "pointer" : "default" }}
      />
    );
  }

  return (
    <div 
      className={`letter-avatar avatar-${size}`} 
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <span>{firstLetter}</span>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.email === nextProps.email &&
         prevProps.name === nextProps.name &&
         prevProps.src === nextProps.src &&
         prevProps.size === nextProps.size;
});

export default Avatar;
