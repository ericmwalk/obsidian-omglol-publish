import { App, PluginSettingTab, Setting } from "obsidian";
import { StatusPosterPlugin } from "./main";
import { StatusPosterSettings } from "./types";

export class SettingsTab extends PluginSettingTab {
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

    new Setting(containerEl)
      .setName("Enable weblog publishing")
      .setDesc("Allow publishing notes to your omg.lol weblog")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableWeblog ?? true)
          .onChange(async (value) => {
            this.plugin.settings.enableWeblog = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );
  }
}
