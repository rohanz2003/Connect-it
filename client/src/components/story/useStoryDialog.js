import { useEffect, useRef } from "react";

// Keep modal controls above mobile keyboards and focus inside the active dialog.
export default function useStoryDialog(dialogRef, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]'))
      .filter(element => element.type !== "hidden" && element.style.display !== "none");
    (focusable()[0] || dialog).focus();

    const handleKeyDown = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    const viewport = window.visualViewport;
    const updateViewport = () => {
      dialog.style.setProperty("--story-viewport-height", `${viewport?.height || window.innerHeight}px`);
      dialog.style.setProperty("--story-viewport-top", `${viewport?.offsetTop || 0}px`);
    };
    updateViewport();
    document.addEventListener("keydown", handleKeyDown);
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [dialogRef]);
}
