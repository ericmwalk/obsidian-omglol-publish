// ======= Initialization and Processing ======= 

import { App, Plugin, Notice } from "obsidian";
import { getDailyNote, createDailyNote, getAllDailyNotes } from "obsidian-daily-notes-interface";
import { CombinedSettings, DEFAULT_SETTINGS } from "./types";
import { SettingsTab } from "./settingstab";
import { WeblogPublisher } from "./weblogpublisher";
import { StatusPublisher } from "./statuspublisher";
import { PicsUploader } from "./picsuploader";
import { PastebinPublisher } from "./pastebinpublisher";
import { PasteModal } from "./pastemodal";
import { PicUploadModal } from "./picsuploadmodal";


export default class OmglolPublish extends Plugin {
  settings: CombinedSettings;
  dailyPluginAvailable: boolean = false;
  statusPublisher: StatusPublisher | null = null;
  weblogPublisher: WeblogPublisher | null = null;
  picsUploader: PicsUploader | null = null;
  pastebinPublisher: PastebinPublisher | null = null;

  async onload() {
    await this.loadSettings();

    this.dailyPluginAvailable =
      (this.app as any).internalPlugins?.getPluginById("daily-notes")?.enabled ||
      (this.app as any).plugins?.enabledPlugins?.has("periodic-notes");

    // === Status.lol ===
    if (this.settings.enableStatusPoster) {
      this.statusPublisher = new StatusPublisher(this.app, this.settings, this);
      this.addRibbonIcon("megaphone", "Post to status.lol", () => {
        this.statusPublisher?.showStatusModal();
      });
    }

    // === Weblog.lol ===
    if (this.settings.enableWeblog) {
      this.weblogPublisher = new WeblogPublisher(this.app, this.settings, this);
      this.addRibbonIcon("send", "Publish to omg.lol Weblog", () => {
        this.weblogPublisher?.publishCurrentNote?.();
      });
    }

    // === some.pics ===
    if (this.settings.enablePics) {
      this.picsUploader = new PicsUploader(this.app, this.settings, this);

      this.addRibbonIcon("images", "Upload images in note to some.pics", () => {
        this.picsUploader?.uploadAllEmbedsInNote();
      });

      this.addCommand({
        id: "upload-all-pics",
        name: "Upload all image embeds in note to some.pics",
        callback: () => this.picsUploader?.uploadAllEmbedsInNote(),
      });
      
      this.addRibbonIcon("image-plus", "Upload photo to some.pics", () => {
        const file = this.picsUploader?.resolveImageFromContext();
        if (file) {
          new PicUploadModal(this.app, this.picsUploader!, file).open();
        } else {
          new Notice("Select an image file or place cursor on an image embed in a note.");
        }
      });

      this.addCommand({
        id: "upload-pic",
        name: "Upload image to some.pics",
        checkCallback: (checking) => {
          const file = this.picsUploader?.resolveImageFromContext();
          if (file) {
            if (!checking) {
              new PicUploadModal(this.app, this.picsUploader!, file).open();
            }
            return true;
          }
          return false;
        },
      });
    }

    // === paste.lol (Pastebin) ===
    if (this.settings.enablePastebin) {
      this.pastebinPublisher = new PastebinPublisher(
        this.app,
        this.settings.token,
        this.settings.username
      );

      // Ribbon icon for publishing current note to paste.lol
      this.addRibbonIcon("clipboard", "Publish to paste.lol", () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.pastebinPublisher?.publishCurrentNote(file);
        } else {
          new Notice("No active note to publish.");
        }
      });

      // Command: Publish current note
      this.addCommand({
        id: "publish-to-pastebin",
        name: "Publish note to paste.lol",
        checkCallback: (checking) => {
          const file = this.app.workspace.getActiveFile();
          if (file) {
            if (!checking) {
              this.pastebinPublisher?.publishCurrentNote(file);
            }
            return true;
          }
          return false;
        },
      });

      // Command: Delete paste
      this.addCommand({
        id: "delete-pastebin-entry",
        name: "Delete paste.lol entry",
        checkCallback: (checking) => {
          const file = this.app.workspace.getActiveFile();
          if (file) {
            if (!checking) {
              this.pastebinPublisher?.deletePaste(file);
            }
            return true;
          }
          return false;
        },
      });
    }

    // === Settings ===
    this.addSettingTab(new SettingsTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

export { OmglolPublish };
