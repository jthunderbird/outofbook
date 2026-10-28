// A tribe: one set of figures and the way they act. Each tribe builds its own
// figures (colored for the side they play) and acts out its own moves and kills
// on the stage the scene gives it. A piece dies the way its taker kills, so a
// tribe's kills work on any tribe's figures through the shared Fig parts
// (root, body, materials, height).
import type { Camera, Mesh, PointLight, Scene } from "three";
import type { Fig, Role, Side } from "./figures";
import type { Clock, Particles } from "./fx";
import type { LegionsSound } from "./sound";

/** What a tribe acts on: the scene's clock, scene, effects, sounds and lights. */
export interface Stage {
  readonly clock: Clock;
  readonly scene: Scene;
  readonly fx: Particles;
  readonly sound: LegionsSound;
  /** A light for flashes (lightning, fire), dark when unused. */
  readonly flash: PointLight;
  /** The board's squares by name, for effects that open one (a pit). */
  readonly squares: Map<string, Mesh>;
  /** The camera, for effects that play to the screen (a piece thrown off into the distance). */
  readonly camera: Camera;
  /** The court being played on (courts.ts), for effects that differ on a tribe's home. */
  readonly court: string;
  /** Shakes the camera for this many ms. */
  shake: number;
}

/** One move to act out. The scene has already taken the figures off their squares. */
export interface TribeMove {
  mover: Fig;
  to: string;
  /** The piece taken, if any (on another square for en passant). */
  victim?: Fig;
  /** The mover's king, who may order the move; absent when the king moves. */
  king?: Fig;
  /** Castling: the rook and where it goes. */
  castle?: { rook: Fig; to: string };
  promotion?: boolean;
}

export interface Tribe {
  id: string;
  name: string;
  /** A figure for a piece of this tribe, in its side's colors. */
  figure(role: Role, side: Side): Fig;
  /** Loads what its figures need (models); until then figure() may give stand-ins. */
  ready?(): Promise<void>;
  /** Acts out a move (and its kill) by a figure of this tribe. */
  play(stage: Stage, move: TribeMove): Promise<void>;
}
