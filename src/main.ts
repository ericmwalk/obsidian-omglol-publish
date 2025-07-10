// ======= Initialization and Processing ======= 

import { App, Plugin } from "obsidian";
import { getDailyNote, createDailyNote, getAllDailyNotes } from "obsidian-daily-notes-interface";
import { CombinedSettings, DEFAULT_SETTINGS } from "./types";
import { SettingsTab } from "./settingstab";
import { WeblogPublisher } from "./weblogpublisher";
import { StatusPublisher } from "./statuspublisher";

export default class StatusPosterPlugin extends Plugin {
  settings: CombinedSettings;
  dailyPluginAvailable: boolean = false;
  statusPublisher: StatusPublisher | null = null;
  weblogPublisher: WeblogPublisher | null = null;

  async onload() {
    await this.loadSettings();

    this.dailyPluginAvailable =
      (this.app as any).internalPlugins?.getPluginById("daily-notes")?.enabled ||
      (this.app as any).plugins?.enabledPlugins?.has("periodic-notes");

    if (this.settings.enableStatusPoster) {
      this.statusPublisher = new StatusPublisher(this.app, this.settings, this);
      this.addRibbonIcon("megaphone", "Post to status.lol", () => {
        this.statusPublisher?.showStatusModal();
      });
    }

    if (this.settings.enableWeblog) {
      this.weblogPublisher = new WeblogPublisher(this.app, this.settings, this);
      this.addRibbonIcon("send", "Publish to omg.lol Weblog", () => {
        this.weblogPublisher?.publishCurrentNote?.();
      });
    }

    this.addSettingTab(new SettingsTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

export { StatusPosterPlugin };
