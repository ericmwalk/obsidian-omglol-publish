import {
  App,
  MarkdownView,
  Notice,
  Plugin,
  requestUrl,
  Modal,
  ButtonComponent,
} from "obsidian";

import { CombinedSettings } from "./types";

export class WeblogConfigurationPublisher {
  constructor(
    private app: App,
    private settings: CombinedSettings,
    private plugin: Plugin
  ) {
    this.addCommand();
  }

  private addCommand() {
    this.plugin.addCommand({
      id: "publish-weblog-configuration",
      name: "Update Weblog Configuration",
      callback: () => this.publishActiveNote(),
    });
  }

  private async publishActiveNote() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice("No active note to publish");
      return;
    }

    const file = view.file;
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;

    // === Guardrails ===
    if (fm?.type !== "weblog" || fm?.entry !== "configuration") {
      new Notice(
        "This note is not marked as a weblog configuration entry (type: weblog, entry: configuration)"
      );
      return;
    }

    const source = await this.app.vault.read(file);
    const config = this.extractConfiguration(source);

    if (!config) {
      new Notice("No ```text``` block found for weblog configuration");
      return;
    }

    const confirmed = await this.confirmPublish();
    if (!confirmed) return;

    await this.publish(config);
  }

  // ======= fenced data to published ======= 

  private extractConfiguration(source: string): string {
    const match = source.match(/```text\n([\s\S]*?)```/);
    return match ? match[1].trim() : "";
  }

  /**
   * Confirmation modal — weblog config changes are immediate
   */
  private async confirmPublish(): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);

      modal.titleEl.setText("Confirm Weblog Configuration Update");

      modal.contentEl.createEl("p", {
        text: "This will immediately replace your weblog configuration.",
      });

      modal.contentEl.createEl("p", {
        text: "Incorrect settings may affect how your weblog renders.",
      });

      modal.contentEl.createEl("p", {
        text: "Continue?",
      });

     const buttonRow = modal.contentEl.createDiv({
        cls: "modal-button-container",
      });

      new ButtonComponent(buttonRow)
        .setButtonText("Cancel")
        .onClick(() => {
          modal.close();
          resolve(false);
        });

      new ButtonComponent(buttonRow)
        .setButtonText("Update Configuration")
        .setCta()
        .onClick(() => {
          modal.close();
          resolve(true);
        });

      modal.open();
    });
  }

  private async publish(config: string) {
    try {
      new Notice("Updating weblog configuration…");

      await requestUrl({
        method: "POST",
        url: `https://api.omg.lol/address/${this.settings.username}/weblog/configuration`,
        headers: {
          Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
          "Content-Type": "text/plain",
        },
        body: config, // sent verbatim
      });

      new Notice("Weblog configuration updated successfully");
    } catch (error) {
      console.error("Weblog configuration update failed:", error);
      new Notice("Failed to update weblog configuration");
    }
  }
}
