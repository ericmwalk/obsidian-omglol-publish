export interface StatusPosterSettings {
  skip_mastodon_post: boolean;
  default_emoji: string;
  saveToNote?: boolean;
  logNotePath?: string | null;
  alsoLogToDaily?: boolean;
  enableStatusPoster?: boolean;
}

export interface WeblogPublisherSettings {
  enableWeblog?: boolean;
  enableRenaming: boolean;
  renamePages: boolean;
  slugWordCount: number;
}

export interface PicsUploaderSettings {
  enablePics?: boolean;
  defaultPicsTags: string; 
  chatgptApiKey?: string; // for future alt text generation
  deleteAfterUpload?: boolean;
  maintainPicsLog?: boolean;
  picsLogPath?: string;

}
export interface PastebinSettings {
  enablePastebin: boolean;
}

export interface SharedOmgSettings {
  username: string;
  token: string;
  apiToken: string; // still shared across modules
  address: string;
}

export interface CombinedSettings
  extends SharedOmgSettings,
    StatusPosterSettings,
    WeblogPublisherSettings,
    PicsUploaderSettings,
    PastebinSettings {}

export const DEFAULT_SETTINGS: CombinedSettings = {
  username: "",
  token: "",
  apiToken: "",
  address: "",

  // Status defaults
  skip_mastodon_post: true,
  default_emoji: "💬",
  saveToNote: true,
  logNotePath: "",
  alsoLogToDaily: false,
  enableStatusPoster: true,

  // Weblog defaults
  enableWeblog: true,
  enableRenaming: true,
  renamePages: false,
  slugWordCount: 5,

  // Pics defaults
  enablePics: false,
  defaultPicsTags: "omgPublish",
  chatgptApiKey: "",
  deleteAfterUpload: false,
  maintainPicsLog: false,
  picsLogPath: "_pics-upload-log.md",

  // Pastebin
  enablePastebin: true,

};
