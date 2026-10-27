// Every tribe there is, by id. A new tribe is added here.
import { staunton } from "./staunton";
import { stormcourt } from "./stormcourt";
import type { Tribe } from "./tribe";

export const TRIBES: Record<string, Tribe> = { staunton, stormcourt };
export const tribe = (id: string) => TRIBES[id] ?? staunton;
