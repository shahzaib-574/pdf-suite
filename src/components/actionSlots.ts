import { createContext } from "react";

/**
 * The element left of a tool's main button in its bottom action row. A file
 * grid portals its reorder control into it, so the control sits beside the
 * button instead of above the files.
 */
export type ActionSlots = {
  start: HTMLElement | null;
};

export const ActionSlotsContext = createContext<ActionSlots | null>(null);
