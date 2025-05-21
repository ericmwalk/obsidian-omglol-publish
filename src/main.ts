// ======= Initialization and Processing ======= 

import {
  App,
  ButtonComponent,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  addIcon,
  requestUrl,
  moment
} from "obsidian";

import {
  getDailyNote,
  createDailyNote,
  getAllDailyNotes
} from "obsidian-daily-notes-interface";

import GraphemeSplitter from "grapheme-splitter";

const momentInstance = (moment as any);

interface StatusPosterSettings {
  username: string;
  token: string;
  skip_mastodon_post: boolean;
  default_emoji: string;
  saveToNote?: boolean;
  logNotePath?: string | null;
  alsoLogToDaily?: boolean;
}

const DEFAULT_SETTINGS: StatusPosterSettings = {
  username: '',
  token: '',
  skip_mastodon_post: false,
  default_emoji: '📣',
  saveToNote: false,
  logNotePath: null,
  alsoLogToDaily: false,
};

export default class StatusPosterPlugin extends Plugin {
  settings: StatusPosterSettings;
  dailyPluginAvailable: boolean = false;

  async onload() {
    await this.loadSettings();

    this.dailyPluginAvailable =
      (this.app as any).internalPlugins?.getPluginById("daily-notes")?.enabled ||
      (this.app as any).plugins?.enabledPlugins?.has("periodic-notes");

    this.addRibbonIcon("megaphone", "Post to status.lol", () => {
      new StatusPostModal(this.app, this, this.settings, this.handleStatusPost.bind(this)).open();
    });

    this.addSettingTab(new StatusPosterSettingTab(this.app, this));
  }

  async handleStatusPost(status: string, skipMastodon: boolean) {
    const emojiData = this.getDataToPost(status, skipMastodon);

    try {
      const res = await requestUrl({
        url: `https://api.omg.lol/address/${this.settings.username}/statuses/`,
        method: 'POST',
        body: emojiData,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.settings.token
        }
      });
      const response = res.json.response;
      new Notice('🎉 Published!');

      if (this.settings.saveToNote && this.settings.logNotePath) {
        await this.appendToNote(this.settings.logNotePath, status, response.url);
      } else if (this.settings.saveToNote && !this.settings.logNotePath) {
        new Notice("Log note path is not set.");
      }

      if (this.settings.alsoLogToDaily && this.dailyPluginAvailable) {
        const daily = getDailyNote(momentInstance(), getAllDailyNotes()) ?? await createDailyNote(momentInstance());
        await this.appendToNote(daily.path.replace(/\.md$/, ''), status, response.url);
      }
    } catch (error) {
      console.error('Post failed:', error);
      new Notice('Failed to post status. Saving locally.');
      const fallbackPath = `Failed Status - ${momentInstance().format("YYYY-MM-DD HH-mm")}-${Math.floor(Math.random() * 1000)}`;
      await this.app.vault.create(fallbackPath + '.md', `Failed to post:\n\n${status}`);
    }
  }

  async appendToNote(notePath: string, status: string, url: string) {
    const fullPath = `${notePath}.md`;
    const timestamp = momentInstance().format("YYYY-MM-DD HH:mm");
    const safeStatus = status.replace(/[\[\]]/g, "\\$&");
    const content = `\n- **${timestamp}**: [${safeStatus}](${url || '#'})`;
    const file = this.app.vault.getAbstractFileByPath(fullPath);
    if (file instanceof TFile) {
      await this.app.vault.append(file, content);
    } else {
      await this.app.vault.create(fullPath, content);
    }
  }

  getDataToPost(text: string, skipMastodon: boolean) {
    const trimmed = text.trim();
    const splitter = new GraphemeSplitter();
    const graphemes = splitter.splitGraphemes(trimmed);

    let emojiGraphemes = [];
    for (const g of graphemes) {
      if (/\p{Extended_Pictographic}/u.test(g) || g === '\u200d') {
        emojiGraphemes.push(g);
      } else {
        break;
      }
    }

    const hasEmoji = emojiGraphemes.length > 0;
    const emoji = hasEmoji ? emojiGraphemes.join('') : this.settings.default_emoji;
    const content = hasEmoji ? trimmed.slice(emoji.length).trim() : trimmed;

    const payload = {
      content,
      emoji,
      skip_mastodon_post: skipMastodon
    };

    return JSON.stringify(payload);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// ======= POSTING AND OUTPUT =======

class StatusPostModal extends Modal {
  statusText: string = "";
  sharePublicly: boolean = true;
  onSubmit: (status: string, share: boolean) => void;

  constructor(app: App, public plugin: StatusPosterPlugin, settings: StatusPosterSettings, onSubmit: (status: string, share: boolean) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h2", { text: "Post to status.lol" });

    const textarea = contentEl.createEl("textarea", { cls: "status-input" });
    textarea.rows = 4;

    textarea.addEventListener("input", () => {
      this.statusText = textarea.value;
    });

    textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        this.submit();
      }
    });

    setTimeout(() => textarea.focus(), 100);

    new Setting(contentEl)
      .setName("Post to social.lol")
      .addToggle((toggle) =>
        toggle.setValue(true).onChange((val) => {
          this.sharePublicly = val;
        })
      );

    new ButtonComponent(contentEl)
      .setButtonText("Post")
      .setCta()
      .onClick(() => this.submit());
  }

  submit() {
    const text = this.statusText.trim();
    if (!text) {
      new Notice("Please enter a status.");
      return;
    }
    this.onSubmit(text, !this.sharePublicly);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class StatusPosterSettingTab extends PluginSettingTab {
  plugin: StatusPosterPlugin;

  constructor(app: App, plugin: StatusPosterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Username')
      .setDesc('Your omg.lol username')
      .addText(text =>
        text.setValue(this.plugin.settings.username)
          .onChange(async (value) => {
            this.plugin.settings.username = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('API token')
      .setDesc('Your omg.lol API token')
      .addText(text => {
        text.inputEl.type = 'password';
        text.setValue(this.plugin.settings.token)
          .onChange(async (value) => {
            this.plugin.settings.token = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Default emoji')
      .setDesc('Used if no emoji is provided at the start of your status')
      .addText(text =>
        text.setValue(this.plugin.settings.default_emoji)
          .onChange(async (value) => {
            this.plugin.settings.default_emoji = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Save to daily note")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.alsoLogToDaily ?? false)
          .onChange(async (value) => {
            this.plugin.settings.alsoLogToDaily = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName("Save to custom note")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.saveToNote ?? false)
          .onChange(async (value) => {
            this.plugin.settings.saveToNote = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.saveToNote) {
      new Setting(containerEl)
        .setName("Log note path")
        .setDesc("Example: logs/status-log")
        .addText(text =>
          text.setValue(this.plugin.settings.logNotePath || '')
            .onChange(async (value) => {
              this.plugin.settings.logNotePath = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }
  }
}
