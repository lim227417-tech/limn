export {
  default as RecentNotes,
  filterListedPages,
  isTagPageSlug,
  isFolderPageSlug,
  resolveDefaultDateType,
  withResolvedDateType,
} from "./components/RecentNotes";
export type { RecentNotesOptions } from "./components/RecentNotes";

// Re-export shared types from @quartz-community/types
export type {
  QuartzComponent,
  QuartzComponentProps,
  StringResource,
} from "@quartz-community/types";
