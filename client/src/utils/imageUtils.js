const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const validateImageFile = (file) => {
  if (!file) return { valid: false, error: "No file selected" };
  if (!file.type || !file.type.startsWith("image/")) {
    return { valid: false, error: "Please select an image file" };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: "Image must be under 5MB" };
  }
  return { valid: true };
};

export const compressImage = (file, maxDimension = 500, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const originalDataUrl = e?.target?.result;

      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          let { width, height } = img;

          if (!width || !height) {
            // Corrupted image or dimensions could not be read
            resolve(originalDataUrl);
            return;
          }

          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round((height / width) * maxDimension);
              width = maxDimension;
            } else {
              width = Math.round((width / height) * maxDimension);
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(originalDataUrl);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        } catch (err) {
          // Never hard-fail profile image; fall back to original.
          resolve(originalDataUrl);
        }
      };

      img.onerror = () => {
        // If the image cannot be decoded, fall back to original data URL.
        // (Some images load fine as data URL but fail during decode in certain browsers)
        resolve(originalDataUrl);
      };

      img.src = originalDataUrl;
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
};
