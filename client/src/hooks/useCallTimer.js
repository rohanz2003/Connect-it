import { useState, useEffect, useRef } from "react";
import { formatCallDuration } from "../utils/callHelpers";

export default function useCallTimer(isActive) {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive]);

  const reset = () => setSeconds(0);

  return { duration: formatCallDuration(seconds), seconds, reset };
}
