import { useEffect } from "react";

export default function useAutoScrollToBottom(ref, dependencies = [], enabled = true) {
  useEffect(() => {
    if (!enabled || !ref?.current) return undefined;

    const frame = requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.scrollTop = ref.current.scrollHeight;
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [ref, enabled, ...dependencies]);
}
