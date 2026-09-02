import { useEffect, useState } from 'react';

export interface TypewriterOptions {
  lines: string[];
  /** Milliseconds per character. */
  speed?: number;
  /** Pause inserted between finished lines. */
  linePause?: number;
  /** Delay before the first character. */
  startDelay?: number;
  /** When true the full text is shown immediately and nothing animates. */
  disabled?: boolean;
}

export interface TypewriterState {
  /** Progressively revealed text, one entry per source line. */
  rendered: string[];
  /** Index of the line currently being typed, or -1 once finished. */
  activeLine: number;
  done: boolean;
}

/**
 * One-shot typewriter. Runs exactly once per mount, never loops, and resolves to
 * the complete text immediately for reduced-motion visitors.
 */
export function useTypewriter({
  lines,
  speed = 45,
  linePause = 420,
  startDelay = 500,
  disabled = false,
}: TypewriterOptions): TypewriterState {
  const [state, setState] = useState<TypewriterState>(() =>
    disabled
      ? { rendered: lines, activeLine: -1, done: true }
      : { rendered: lines.map(() => ''), activeLine: 0, done: false },
  );

  useEffect(() => {
    if (disabled) {
      setState({ rendered: lines, activeLine: -1, done: true });
      return;
    }

    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const rendered = lines.map(() => '');

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(setTimeout(resolve, ms));
      });

    const run = async () => {
      setState({ rendered: [...rendered], activeLine: 0, done: false });
      await wait(startDelay);
      for (let line = 0; line < lines.length; line += 1) {
        if (cancelled) return;
        setState({ rendered: [...rendered], activeLine: line, done: false });
        for (let char = 0; char < lines[line].length; char += 1) {
          if (cancelled) return;
          await wait(speed);
          if (cancelled) return;
          rendered[line] = lines[line].slice(0, char + 1);
          setState({ rendered: [...rendered], activeLine: line, done: false });
        }
        if (line < lines.length - 1) await wait(linePause);
      }
      if (cancelled) return;
      setState({ rendered: [...rendered], activeLine: -1, done: true });
    };

    void run();

    return () => {
      cancelled = true;
      for (const timer of timers) clearTimeout(timer);
    };
    // `lines` is a stable module constant; re-running on identity change would
    // restart the animation, which must happen only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, speed, linePause, startDelay]);

  return state;
}
