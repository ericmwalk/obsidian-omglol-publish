export interface StatusPosterSettings {
  skip_mastodon_post: boolean;
  default_emoji: string;
  saveToNote?: boolean;
  logNotePath?: string | null;
  alsoLogToDaily?: boolean;
  enableStatusPoster?: boolean; // ← NEW toggle
}

export interface WeblogPublisherSettings {
  enableWeblog?: boolean; // ← existing toggle
  enableRenaming: boolean;
  renamePages: boolean;
  slugWordCount: number;
}

export interface SharedOmgSettings {
  username: string;
  token: string;
  apiToken: string;
  address: string;
}

export interface CombinedSettings extends SharedOmgSettings, StatusPosterSettings, WeblogPublisherSettings {}

export const DEFAULT_SETTINGS: CombinedSettings = {
  username: "",
  token: "",
  apiToken: "",
  address: "",
  skip_mastodon_post: true,
  default_emoji: "💬",
  saveToNote: true,
  logNotePath: "",
  alsoLogToDaily: false,
  enableStatusPoster: true,
  enableWeblog: true,
  enableRenaming: true,
  renamePages: false,
  slugWordCount: 5,
};
