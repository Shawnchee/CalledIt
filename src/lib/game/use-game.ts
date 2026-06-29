"use client";

import { useEffect, useRef, useState } from "react";
import { GameEngine } from "./engine";
import type { GameState } from "./types";

/** Mounts a single GameEngine and subscribes React to its state. */
export function useGame() {
  const ref = useRef<GameEngine | null>(null);
  if (!ref.current) ref.current = new GameEngine();
  const [state, setState] = useState<GameState>(ref.current.getState());

  useEffect(() => {
    const engine = ref.current!;
    const unsub = engine.subscribe(setState);
    return () => {
      unsub();
      engine.stop();
    };
  }, []);

  return { engine: ref.current, state };
}
