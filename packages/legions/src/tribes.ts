// Every tribe there is, by id. A new tribe is added here.
import { epoch } from "./epoch";
import { staunton } from "./staunton";
import { stormcourt } from "./stormcourt";
import { thornwood } from "./thornwood";
import type { Tribe } from "./tribe";

export const TRIBES: Record<string, Tribe> = { staunton, stormcourt, thornwood, "epoch-drifters": epoch };
export const tribe = (id: string) => TRIBES[id] ?? staunton;
