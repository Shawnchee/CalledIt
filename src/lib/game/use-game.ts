"use client";

import { useEffect, useState } from "react";
import { GameEngine, type GameMode } from "./engine";
import { LiveGameController } from "@/lib/txline/live-feed";
import type { GameState } from "./types";

export interface LiveOptions {
  /** Real TxLINE fixture id — stamped onto on-chain receipts for provenance. */
  fixtureId?: number;
  /** Call window in seconds (defaults to the free-tier "next 10 minutes"). */
  windowSec?: number;
}

/**
 * Mounts a single GameEngine and subscribes React to its state. `mode` is fixed
 * for the life of the engine (it's read at construction), which is exactly what
 * we want — the room decides replay vs live before mounting this hook.
 */
export function useGame(mode: GameMode = "replay", live: LiveOptions = {}) {
  const { fixtureId, windowSec } = live;
  const [engine] = useState(() => new GameEngine(mode));
  const [state, setState] = useState<GameState>(() => engine.getState());

  useEffect(() => {
    const unsub = engine.subscribe(setState);
    return () => {
      unsub();
      engine.stop();
    };
  }, [engine]);

  // Live mode: drive the engine from the real TxLINE feeds. Inert in replay.
  useEffect(() => {
    if (mode !== "live") return;
    const controller = new LiveGameController(engine, fixtureId, windowSec);
    controller.start();
    return () => controller.stop();
  }, [engine, mode, fixtureId, windowSec]);

  return { engine, state };
}
