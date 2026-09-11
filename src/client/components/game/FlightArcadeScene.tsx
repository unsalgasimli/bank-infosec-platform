import React, { useEffect, useRef } from "react";
import { createFlight3DScene } from "../auth/garden/GardenFlight3D.js";
import type { BirdFlight } from "../auth/garden/garden-bird-game.js";

/** Thin mount for the shared Garden Flight 3D scene; renders one canvas
 *  for the lifetime of the component and pushes game state into it. */
export default function FlightArcadeScene({ flight }: { flight: BirdFlight }) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createFlight3DScene> | null>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;

    const sceneCtrl = createFlight3DScene(container);
    controller.current = sceneCtrl;

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      sceneCtrl.resize(width, height);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      sceneCtrl.dispose();
      controller.current = null;
    };
  }, []);

  useEffect(() => {
    controller.current?.update(flight);
  }, [flight]);

  return <div ref={host} className="gfa__scene" />;
}
