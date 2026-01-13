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

type StatusBioBlocks = {
  markdown: string;
  css?: string;
  head?: string;
};

export class StatusBioPublisher {
  constructor(
    private app: App,
    private settings: CombinedSettings,
    private plugin: Plugin
  ) {
    this.addCommand();
  }

  private addCommand() {
    this.plugin.addCommand({
      id: "publish-status-bio",
      name: "Update Status.lol Bio",
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

     // Check that this is a status.lol bio page
    if (fm?.type !== "status" || fm?.entry !== "bio") {
      new Notice(
        "This note is not marked as a status bio entry (type: status, entry: bio)"
      );
      return;
    }

    const source = await this.app.vault.read(file);
    const blocks = this.extractBlocks(source);

    if (!blocks.markdown) {
      new Notice("No ```markdown``` block found for bio content");
      return;
    }

    const confirmed = await this.confirmPublish();
    if (!confirmed) return;

    await this.publish(blocks);
  }

  // ======= fenced data to published ======= 
  /**
   * - ```markdown``` → content
   * - ```css``` → css (optional)
   * - ```html head``` → head (optional)
   */
  private extractBlocks(source: string): StatusBioBlocks {
    const blocks: StatusBioBlocks = {
      markdown: "",
      css: undefined,
      head: undefined,
    };

    const fenceRegex =
      /```(\w+)(?:\s+([\w-]+))?\n([\s\S]*?)```/g;

    let match: RegExpExecArray | null;

    while ((match = fenceRegex.exec(source)) !== null) {
      const lang = match[1];
      const tag = match[2];
      const body = match[3].trim();

      if (lang === "markdown") {
        blocks.markdown = body;
      }

      if (lang === "css") {
        blocks.css = this.normalizeCss(body);
      }

      if (lang === "html" && tag === "head") {
        blocks.head = body;
      }
    }

    return blocks;
  }

  /**
   * Strip <style> wrappers if present
   */
  private normalizeCss(css: string): string {
    return css
      .replace(/^<style[^>]*>/i, "")
      .replace(/<\/style>$/i, "")
      .trim();
  }

  /**
   * Confirmation — bio updates are immediate
   */
  private async confirmPublish(): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);

      modal.titleEl.setText("Confirm Status Bio Update");

      modal.contentEl.createEl("p", {
        text: "This will immediately update your status.lol bio.",
      });

      modal.contentEl.createEl("p", {
        text: "There is no draft mode or undo. Continue?",
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
        .setButtonText("Update Bio")
        .setCta()
        .onClick(() => {
          modal.close();
          resolve(true);
        });

      modal.open();
    });
  }

  private async publish(blocks: StatusBioBlocks) {
    try {
      new Notice("Updating status.lol bio…");

      await requestUrl({
        method: "POST",
        url: `https://api.omg.lol/address/${this.settings.username}/statuses/bio`,
        headers: {
          Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: blocks.markdown,
          css: blocks.css,
          head: blocks.head,
        }),
      });

      new Notice("Status.lol bio updated successfully");
    } catch (error: any) {
      console.error("Status bio update failed:", error);
      new Notice("Failed to update status.lol bio");
    }
  }
}
