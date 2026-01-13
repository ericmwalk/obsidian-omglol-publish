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

export class NowPagePublisher {
  constructor(
    private app: App,
    private settings: CombinedSettings,
    private plugin: Plugin
  ) {
    this.addCommand();
  }

  private addCommand() {
    this.plugin.addCommand({
      id: "publish-now-page",
      name: "Publish /now Page",
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

    // Check that this is a Now Page
    if (fm?.type !== "profile" || fm?.entry !== "now") {
      new Notice(
        "This note is not marked as a /now entry (type: profile, entry: now)"
      );
      return;
    }

    const source = await this.app.vault.read(file);
    const content = this.extractMarkdown(source);

  // ======= fenced data to publish in markdown block ======= 
    if (!content) {
      new Notice("No ```markdown``` block found for /now content");
      return;
    }

    const confirmed = await this.confirmPublish();
    if (!confirmed) return;

    await this.publish(content);
  }

  private extractMarkdown(source: string): string {
    const match = source.match(/```markdown\n([\s\S]*?)```/);
    return match ? match[1].trim() : "";
  }

  private async confirmPublish(): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);

      modal.titleEl.setText("Confirm /now Page Publish");

      modal.contentEl.createEl("p", {
        text: "This will immediately replace your live omg.lol /now page.",
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
        .setButtonText("Publish")
        .setCta()
        .onClick(() => {
          modal.close();
          resolve(true);
        });

      modal.open();
    });
  }

  private async publish(content: string) {
    try {
      new Notice("Publishing /now page…");

      await requestUrl({
        method: "POST",
        url: `https://api.omg.lol/address/${this.settings.username}/now`,
        headers: {
          Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          listed: "1",
        }),
      });

      new Notice("/now page published successfully");
    } catch (error) {
      console.error("Now page publish failed:", error);
      new Notice("Failed to publish /now page");
    }
  }
}