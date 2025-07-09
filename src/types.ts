export interface StatusPosterSettings {
  username: string;
  token: string;
  apiToken: string;     // <-- used by weblog publishing
  address: string;      // <-- used by weblog publishing
  skip_mastodon_post: boolean;
  default_emoji: string;
  saveToNote?: boolean;
  logNotePath?: string | null;
  alsoLogToDaily?: boolean;
  enableWeblog?: boolean;
}

export const DEFAULT_SETTINGS: StatusPosterSettings = {
  username: '',
  token: '',
  apiToken: '',
  address: '',
  skip_mastodon_post: false,
  default_emoji: '📣',
  saveToNote: false,
  logNotePath: null,
  alsoLogToDaily: false,
  enableWeblog: true,
};
