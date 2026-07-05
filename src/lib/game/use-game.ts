"use client";

import { useEffect, useState } from "react";
import { GameEngine } from "./engine";
import type { GameState } from "./types";

/** Mounts a single GameEngine and subscribes React to its state. */
export function useGame() {
  const [engine] = useState(() => new GameEngine());
  const [state, setState] = useState<GameState>(() => engine.getState());

  useEffect(() => {
    const unsub = engine.subscribe(setState);
    return () => {
      unsub();
      engine.stop();
    };
  }, [engine]);

  return { engine, state };
}
