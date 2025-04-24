import {
  Plugin,
  PluginSettingTab,
  App,
  Modal,
  Setting,
  TextComponent,
  ToggleComponent,
  Notice,
  TFile,
  requestUrl,
  moment
} from "obsidian";

import { getDailyNote, createDailyNote, getAllDailyNotes } from "obsidian-daily-notes-interface";
import GraphemeSplitter from "grapheme-splitter";

interface StatusLolPluginSettings {
  apiKey: string;
  address: string;
  saveToNote: boolean;
  logNotePath: string | null;
  alsoLogToDaily: boolean;
}

const DEFAULT_SETTINGS: StatusLolPluginSettings = {
  apiKey: "",
  address: "",
  saveToNote: false,
  logNotePath: null,
  alsoLogToDaily: false,
};

export default class StatusLolPlugin extends Plugin {
  settings: StatusLolPluginSettings;
  dailyPluginAvailable: boolean = false;

  async onload() {
    await this.loadSettings();

    this.dailyPluginAvailable =
      (this.app as any).internalPlugins?.getPluginById("daily-notes")?.enabled ||
      (this.app as any).plugins?.enabledPlugins?.has("periodic-notes");

    this.addRibbonIcon("megaphone", "Post to status.lol", () => {
      new StatusPostModal(this.app, this.settings, this.handleStatusPost.bind(this)).open();
    });

    this.addCommand({
      id: "post-status-to-statuslol",
      name: "Post to status.lol",
      callback: () => {
        new StatusPostModal(this.app, this.settings, this.handleStatusPost.bind(this)).open();
      },
    });

    this.addSettingTab(new StatusLolSettingTab(this.app, this));
  }

  async handleStatusPost(status: string, sharePublicly: boolean) {
    let response;
    try {
      response = await this.postStatus(status, sharePublicly);
    } catch (err) {
      console.error("Post failed entirely:", err);
    }

    if (response?.url) {
      new Notice("Status posted!");
      if (this.settings.saveToNote && this.settings.logNotePath) {
        await this.saveStatusToLogNote(status, response.url);
      }
      if (this.settings.alsoLogToDaily && this.dailyPluginAvailable) {
        await this.saveStatusToDailyNote(status, response.url);
      }
    } else {
      new Notice("Failed to post status. Saving locally.");
      if (this.settings.alsoLogToDaily && this.dailyPluginAvailable) {
        await this.saveStatusToDailyNote(status, "");
      } else {
        await this.saveStatusToFallbackNote(status);
      }
    }
  }

  async postStatus(status: string, share: boolean): Promise<any> {
    const endpoint = `https://api.omg.lol/address/${this.settings.address}/statuses/`;
    try {
      const res = await requestUrl({
        url: endpoint,
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          skip_mastodon_post: !share
        }),
      });
      return res.json.response;
    } catch (err) {
      console.error("Status.lol Post Error:", err);
      return null;
    }
  }

  async saveStatusToLogNote(status: string, url: string) {
    const fullPath = `${this.settings.logNotePath}.md`;
    const timestamp = moment.default().format("YYYY-MM-DD HH:mm");
    const content = `\n- **${timestamp}**: [${status}](${url || "#"})`;
    const file = this.app.vault.getAbstractFileByPath(fullPath);
    if (file && file instanceof TFile) {
      await this.app.vault.append(file, content);
    }
  }

  async saveStatusToDailyNote(status: string, url: string) {
    const daily = getDailyNote(moment.default(), getAllDailyNotes());
    const note = daily ?? await createDailyNote(moment.default());
    const timestamp = moment.default().format("HH:mm");
    const content = `\n- **${timestamp}**: [${status}](${url || "#"})`;
    await this.app.vault.append(note, content);
  }

  async saveStatusToFallbackNote(status: string) {
    const filename = `Failed Status - ${moment.default().format("YYYY-MM-DD HH-mm")}.md`;
    const file = await this.app.vault.create(filename, `Failed to post:\n\n${status}`);
    new Notice(`Saved fallback status to ${filename}`);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class StatusLolSettingTab extends PluginSettingTab {
  plugin: StatusLolPlugin;

  constructor(app: App, plugin: StatusLolPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Status.lol Plugin Settings" });

    new Setting(containerEl)
      .setName("API Key")
      .addText((text: TextComponent) =>
        text
          .setPlaceholder("Enter your omg.lol API key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value: string) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("omg.lol Address")
      .addText((text: TextComponent) =>
        text
          .setPlaceholder("e.g. ericmwalk")
          .setValue(this.plugin.settings.address)
          .onChange(async (value: string) => {
            this.plugin.settings.address = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Save to Daily Note")
      .setDesc(this.plugin.dailyPluginAvailable
        ? "Appends to today's Daily Note if enabled"
        : "Enable Daily Notes or Periodic Notes plugin to use this")
      .addToggle((toggle: ToggleComponent) => {
        const enabled = this.plugin.dailyPluginAvailable;
        toggle.setDisabled(!enabled);

        if (!enabled) {
          toggle.setValue(false);
          this.plugin.settings.alsoLogToDaily = false;
          this.plugin.saveSettings();
        } else {
          toggle
            .setValue(this.plugin.settings.alsoLogToDaily)
            .onChange(async (value: boolean) => {
              this.plugin.settings.alsoLogToDaily = value;
              await this.plugin.saveSettings();
            });
        }
      });

    new Setting(containerEl)
      .setName("Save to a custom note")
      .addToggle((toggle: ToggleComponent) =>
        toggle
          .setValue(this.plugin.settings.saveToNote)
          .onChange(async (value: boolean) => {
            this.plugin.settings.saveToNote = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Note name to save posts")
      .setDesc("Enter note path (e.g. 'Status.lol Posts' or 'logs/status') — omit the .md")
      .addText((text: TextComponent) =>
        text
          .setPlaceholder("e.g. logs/status")
          .setValue(this.plugin.settings.logNotePath ?? "")
          .onChange(async (value: string) => {
            this.plugin.settings.logNotePath = value.trim() || null;
            await this.plugin.saveSettings();
          })
      );
  }
}

class StatusPostModal extends Modal {
  statusText: string = "";
  sharePublicly: boolean = true;
  onSubmit: (status: string, share: boolean) => void;

  constructor(app: App, settings: StatusLolPluginSettings, onSubmit: (status: string, share: boolean) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Post to status.lol" });

    const textarea = contentEl.createEl("textarea", { cls: "status-input" });
    textarea.style.width = "100%";
    textarea.style.boxSizing = "border-box";
    textarea.rows = 4;
    textarea.maxLength = 300;

    const counter = contentEl.createEl("div", { text: "0/300", cls: "char-count" });

    textarea.addEventListener("input", () => {
      this.statusText = textarea.value;
      counter.setText(`${this.statusText.length}/300`);
    });

    this.containerEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        this.submitStatus();
      }
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Post")
          .setCta()
          .onClick(() => this.submitStatus())
      );

    new Setting(contentEl)
      .setName("Post to social.lol")
      .addToggle((toggle) =>
        toggle.setValue(true).onChange((val) => {
          this.sharePublicly = val;
        })
      );
  }

  submitStatus() {
    let raw = this.statusText.trim();
    if (raw.length === 0) {
      new Notice("Please enter a status message.");
      return;
    }

    const splitter = new GraphemeSplitter();
    const graphemes = splitter.splitGraphemes(raw);
    const firstGrapheme = graphemes[0];
    const secondChar = graphemes[1] ?? "";

    const emojiRegex = /^\p{Extended_Pictographic}/u;
    if (emojiRegex.test(firstGrapheme) && secondChar !== " " && !/[\s.,!?]/.test(secondChar)) {
      raw = `${firstGrapheme} ${graphemes.slice(1).join("")}`;
    }

    const fixed = raw.normalize("NFC");
    this.onSubmit(fixed, this.sharePublicly);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
