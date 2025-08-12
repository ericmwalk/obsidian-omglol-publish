import { App, PluginSettingTab, Setting, setIcon } from "obsidian";
import WeblogPublisher from "./main";

export class SettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: WeblogPublisher) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "omg.lol Plugin Settings" });

    // === Shared OMG Settings ===
    new Setting(containerEl)
      .setName("OMG.lol Username")
      .setDesc("Your omg.lol username")
      .addText(text =>
        text
          .setPlaceholder("username")
          .setValue(this.plugin.settings.username || "")
          .onChange(async (value) => {
            this.plugin.settings.username = value.trim(); // ← trim spaces
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
        this.plugin.settings.token = value.trim(); // trim spaces
        await this.plugin.saveSettings();
      });

    // Start masked
    // @ts-ignore
    text.inputEl.type = "password";

    // Create clickable icon element
    const eyeIcon = containerEl.createEl("div", {
      cls: "clickable-icon",
    });
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

    // Append the icon right next to the input
    text.inputEl.parentElement?.appendChild(eyeIcon);

    return text;
  });

    // === Status.lol Feature Toggle ===
    new Setting(containerEl)
      .setName("Enable status.lol features")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableStatusPoster ?? true)
          .onChange(async (value) => {
            this.plugin.settings.enableStatusPoster = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    // === Weblog Feature Toggle ===
    new Setting(containerEl)
      .setName("Enable weblog.lol features")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableWeblog ?? true)
          .onChange(async (value) => {
            this.plugin.settings.enableWeblog = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

// === Weblog Settings ===
if (this.plugin.settings.enableWeblog) {
  containerEl.createEl("h3", { text: "Weblog Settings" });

  new Setting(containerEl)
    .setName("Enable automatic renaming")
    .setDesc("Rename note to use slug after publishing")
    .addToggle(toggle =>
      toggle
        .setValue(this.plugin.settings.enableRenaming)
        .onChange(async (value) => {
          this.plugin.settings.enableRenaming = value;

          // If main rename is turned off, force pages too off
          if (!value) {
            this.plugin.settings.renamePages = false;
          }

          await this.plugin.saveSettings();
          this.display(); // re-render so dependent toggle appears/disappears
        })
    );

  // Only show "Rename Pages" if renaming is enabled
  if (this.plugin.settings.enableRenaming) {
    new Setting(containerEl)
      .setName("Rename Pages")
      .setDesc("If frontmatter has `type: page` (case-insensitive), rename it as well. Leave off to keep pages’ filenames stable.")
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

    // === Status Settings ===
    if (this.plugin.settings.enableStatusPoster) {
      containerEl.createEl("h3", { text: "Status Settings" });

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
  }
}
