import { App, PluginSettingTab, Setting, setIcon } from "obsidian";
import OmglolPublish from "./main";

export class SettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: OmglolPublish) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h1", { text: "omg.lol Plugin Settings" });

    // === Shared OMG Settings ===
    new Setting(containerEl)
      .setName("OMG.lol Username")
      .setDesc("Your omg.lol username")
      .addText(text =>
        text
          .setPlaceholder("username")
          .setValue(this.plugin.settings.username || "")
          .onChange(async (value) => {
            this.plugin.settings.username = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Token")
      .setDesc("Your omg.lol API token")
      .addText(text => {
        text
          .setPlaceholder("token")
          .setValue(this.plugin.settings.token || "")
          .onChange(async (value) => {
            this.plugin.settings.token = value.trim();
            await this.plugin.saveSettings();
          });

        // Start masked
        // @ts-ignore
        text.inputEl.type = "password";

        // Eye toggle
        const eyeIcon = containerEl.createEl("div", { cls: "clickable-icon" });
        setIcon(eyeIcon, "eye");
        eyeIcon.style.cursor = "pointer";
        eyeIcon.style.marginLeft = "8px";
        eyeIcon.style.display = "flex";
        eyeIcon.style.alignItems = "center";

        let visible = false;
        eyeIcon.onclick = () => {
          visible = !visible;
          // @ts-ignore
          text.inputEl.type = visible ? "text" : "password";
          setIcon(eyeIcon, visible ? "eye-off" : "eye");
        };

        text.inputEl.parentElement?.appendChild(eyeIcon);

        return text;
      });

    containerEl.createEl("h3", { text: "omg.lol Modules Enabled" });
    // === Status.lol ===
    new Setting(containerEl)
      .setName("Status.lol")
      .setDesc("Enable posting to status.lol")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableStatusPoster ?? true)
          .onChange(async (value) => {
            this.plugin.settings.enableStatusPoster = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );
    // === Weblog.lol ===
    new Setting(containerEl)
      .setName("Weblog.lol")
      .setDesc("Enable publishing to weblog.lol")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableWeblog ?? true)
          .onChange(async (value) => {
            this.plugin.settings.enableWeblog = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );
    // === some.pics ===
    new Setting(containerEl)
      .setName("some.pics")
      .setDesc("Enable image uploads to some.pics")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enablePics ?? true)
          .onChange(async (value) => {
            this.plugin.settings.enablePics = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );
      // === Pastebin ===
      new Setting(containerEl)
        .setName("paste.lol")
        .setDesc("Enable publishing to paste.lol")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enablePastebin)
            .onChange(async (value) => {
              this.plugin.settings.enablePastebin = value;
              await this.plugin.saveSettings();
            })
        );

    // === Status.lol Settings ===
    if (this.plugin.settings.enableStatusPoster) {
      containerEl.createEl("h4", { text: "Status Settings" });

      new Setting(containerEl)
        .setName("Default emoji")
        .setDesc("Emoji to prepend if none is given")
        .addText(text =>
          text.setPlaceholder("💬")
            .setValue(this.plugin.settings.default_emoji)
            .onChange(async (value) => {
              this.plugin.settings.default_emoji = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Skip Mastodon post")
        .setDesc("Prevent cross-posting to Mastodon")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.skip_mastodon_post)
            .onChange(async (value) => {
              this.plugin.settings.skip_mastodon_post = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Save to note")
        .setDesc("Save status to a log note")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.saveToNote ?? true)
            .onChange(async (value) => {
              this.plugin.settings.saveToNote = value;
              await this.plugin.saveSettings();
              this.display();
            })
        );

      if (this.plugin.settings.saveToNote) {
        new Setting(containerEl)
          .setName("Log note path")
          .setDesc("Path to the log note where statuses will be saved")
          .addText(text =>
            text.setPlaceholder("path/to/statuslog.md")
              .setValue(this.plugin.settings.logNotePath || "")
              .onChange(async (value) => {
                this.plugin.settings.logNotePath = value;
                await this.plugin.saveSettings();
              })
          );
      }

      new Setting(containerEl)
        .setName("Also log to Daily Note")
        .setDesc("Append status to today's Daily Note as well")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.alsoLogToDaily ?? false)
            .onChange(async (value) => {
              this.plugin.settings.alsoLogToDaily = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // === Weblog.lol Settings===
    if (this.plugin.settings.enableWeblog) {
      containerEl.createEl("h4", { text: "Weblog Settings" });

      new Setting(containerEl)
        .setName("Enable automatic renaming")
        .setDesc("Rename note to use slug after publishing")
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableRenaming)
            .onChange(async (value) => {
              this.plugin.settings.enableRenaming = value;
              if (!value) this.plugin.settings.renamePages = false;
              await this.plugin.saveSettings();
              this.display();
            })
        );

      if (this.plugin.settings.enableRenaming) {
        new Setting(containerEl)
          .setName("Rename Pages")
          .setDesc("If frontmatter has `type: page`, rename those too")
          .addToggle(toggle =>
            toggle
              .setValue(this.plugin.settings.renamePages ?? false)
              .onChange(async (value) => {
                this.plugin.settings.renamePages = value;
                await this.plugin.saveSettings();
              })
          );
      }

      new Setting(containerEl)
        .setName("Slug word count")
        .setDesc("Number of words to use in auto-generated slug")
        .addText(text =>
          text.setPlaceholder("5")
            .setValue(this.plugin.settings.slugWordCount.toString())
            .onChange(async (value) => {
              const num = parseInt(value);
              if (!isNaN(num) && num > 0) {
                this.plugin.settings.slugWordCount = num;
                await this.plugin.saveSettings();
              }
            })
        );
    }

    // === some.pics Settings===
    if (this.plugin.settings.enablePics) {
      containerEl.createEl("h4", { text: "some.pics Settings" });

      new Setting(containerEl)
        .setName("Default tags")
        .setDesc("Tags to apply to all uploaded images (comma or space separated)")
        .addText(text =>
          text
            .setPlaceholder("obsidian upload")
            .setValue(this.plugin.settings.defaultPicsTags || "")
            .onChange(async (value) => {
              this.plugin.settings.defaultPicsTags = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("ChatGPT API key (for alt text)")
        .setDesc("Optional: provide an API key to auto-generate alt text for images")
        .addText(text => {
          text
            .setPlaceholder("sk-...")
            .setValue(this.plugin.settings.chatgptApiKey || "")
            .onChange(async (value) => {
              this.plugin.settings.chatgptApiKey = value.trim();
              await this.plugin.saveSettings();
            });

          // Start masked
          // @ts-ignore
          text.inputEl.type = "password";

          // Eye toggle
          const eyeIcon = containerEl.createEl("div", { cls: "clickable-icon" });
          setIcon(eyeIcon, "eye");
          eyeIcon.style.cursor = "pointer";
          eyeIcon.style.marginLeft = "8px";
          eyeIcon.style.display = "flex";
          eyeIcon.style.alignItems = "center";

          let visible = false;
          eyeIcon.onclick = () => {
            visible = !visible;
            // @ts-ignore
            text.inputEl.type = visible ? "text" : "password";
            setIcon(eyeIcon, visible ? "eye-off" : "eye");
          };

          text.inputEl.parentElement?.appendChild(eyeIcon);

          return text;
        });

      new Setting(containerEl)
        .setName("Maintain upload log")
        .setDesc("Save a record of each uploaded picture in a log note")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.maintainPicsLog ?? false)
            .onChange(async (value) => {
              this.plugin.settings.maintainPicsLog = value;
              await this.plugin.saveSettings();
              this.display();
            })
        );
      new Setting(containerEl)
        .setName("Monthly log rotation")
        .setDesc("Split some.pics logs into monthly files with an index")
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.monthlyPicsLogs)
            .onChange(async (value) => {
              this.plugin.settings.monthlyPicsLogs = value;
              await this.plugin.saveSettings();
            })
        );

      if (this.plugin.settings.maintainPicsLog) {
        new Setting(containerEl)
          .setName("Log note path")
          .setDesc("Path to the log note file")
          .addText(text =>
            text
              .setPlaceholder("_pics-upload-log.md")
              .setValue(this.plugin.settings.picsLogPath || "")
              .onChange(async (value) => {
                this.plugin.settings.picsLogPath = value.trim();
                await this.plugin.saveSettings();
              })
          );
      }

      new Setting(containerEl)
        .setName("Delete after upload")
        .setDesc("Remove original image file from vault after uploading")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.deleteAfterUpload ?? false)
            .onChange(async (value) => {
              this.plugin.settings.deleteAfterUpload = value;
              await this.plugin.saveSettings();
            })
        );
    }
  }
}
