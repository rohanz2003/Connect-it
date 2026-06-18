import DOMPurify from "dompurify";

export const sanitizeText = (value, maxLength = 2000) => {
  const clean = DOMPurify.sanitize(String(value || ""), {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  }).trim();
  return clean.slice(0, maxLength);
};

export const sanitizeFileName = (value) =>
  sanitizeText(value, 255).replace(/[\\/:*?"<>|]+/g, "_");

export const sanitizeProfileText = (value, maxLength = 500) =>
  sanitizeText(value, maxLength);
