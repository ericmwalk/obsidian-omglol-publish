import {
  App,
  MarkdownView,
  Notice,
  Plugin,
  requestUrl,
  TFile,
  Modal,
  ButtonComponent,
} from "obsidian";
import { CombinedSettings } from "./types";

/**
 * WeblogTemplatePublisher
 *
 * IMPORTANT — READ BEFORE MODIFYING
 *
 * There are TWO fundamentally different kinds of “templates” in weblog.lol:
 *
 * 1) MAIN TEMPLATE (SPECIAL)
 *    - Already exists
 *    - MUST NEVER be created
 *    - MUST NEVER be deleted
 *    - MUST ONLY be updated
 *    - MUST use /weblog/template
 *
 * 2) ALL OTHER TEMPLATES
 *    - Are normal weblog entries with type: Template
 *    - Use /weblog/entry
 *    - Can be created, updated, or deleted
 *
 * These code paths MUST remain separate.
 */
export class WeblogTemplatePublisher {
  constructor(
    private app: App,
    private settings: CombinedSettings,
    private plugin: Plugin
  ) {
    this.addCommands();
  }

  private addCommands() {
    this.plugin.addCommand({
      id: "publish-weblog-template",
      name: "Publish Weblog Template",
      callback: () => this.publishActiveTemplate(),
    });

    this.plugin.addCommand({
      id: "delete-weblog-template",
      name: "Delete Weblog Template",
      callback: () => this.deleteActiveTemplate(),
    });
  }

  // ===========================
  // Publish
  // ===========================

  private async publishActiveTemplate() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice("No active markdown file.");
      return;
    }

    const file = view.file;
    const content = await this.app.vault.read(file);
    const metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;

    if (!metadata) {
      new Notice("Template requires frontmatter.");
      return;
    }

    const type = metadata.type;
    const title = metadata.title;
    const entry = metadata.entry;

    if (type?.toLowerCase() !== "template") {
      new Notice("This file is not marked as a template (type: Template).");
      return;
    }

    const isMainTemplate = entry === "Template";

    if (!entry && title?.trim().toLowerCase() === "template") {
      new Notice(
        "The Main Template already exists and cannot be created.\n" +
          "Add `entry: Template` to frontmatter to update it."
      );
      return;
    }

    const html = this.extractHtmlBlock(content);
    if (!html) {
      new Notice("No HTML code block found. Wrap template HTML in ```html.");
      return;
    }

    // ===== MAIN TEMPLATE =====
    if (isMainTemplate) {
      const confirmed = await this.confirmTemplateAction(
        "This will immediately replace your live weblog template for all pages."
      );

      if (!confirmed) return;

      try {
        await requestUrl({
          method: "POST",
          url: `https://api.omg.lol/address/${this.settings.username}/weblog/template`,
          headers: {
            Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
            "Content-Type": "text/plain",
          },
          body: html,
        });

        new Notice("🔁 Main weblog template updated.");
      } catch (error) {
        console.error(error);
        new Notice("❌ Failed to update main weblog template.");
      }

      return;
    }

    // ===== OTHER TEMPLATES =====

    if (!title) {
      new Notice("Templates require a title.");
      return;
    }

    if (entry) {
      const confirmed = await this.confirmTemplateAction(
        `This will overwrite the existing template "${title}".`
      );
      if (!confirmed) return;
    }

    const body = `Type: Template\nTitle: ${title}\n\n${html}`;
    const endpoint = entry
      ? `https://api.omg.lol/address/${this.settings.username}/weblog/entry/${entry}`
      : `https://api.omg.lol/address/${this.settings.username}/weblog/entry`;

    try {
      const response = await requestUrl({
        method: "POST",
        url: endpoint,
        headers: {
          Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
          "Content-Type": "text/plain",
        },
        body,
      });

      const returnedEntry = response.json?.response?.entry?.entry;

      if (!entry && returnedEntry) {
        await this.injectEntryFrontmatter(file, returnedEntry);
      }

      new Notice(entry ? "🔁 Weblog template updated." : "✅ Weblog template created.");
    } catch (error) {
      console.error(error);
      new Notice("❌ Failed to publish weblog template.");
    }
  }

    // ===== Delete =====

    private async deleteActiveTemplate() {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || !view.file) {
        new Notice("No active markdown file.");
        return;
      }

      const file = view.file;
      const metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;

      if (!metadata || metadata.type?.toLowerCase() !== "template") {
        new Notice("This file is not marked as a template.");
        return;
      }

      const entry = metadata.entry;
      const title = metadata.title ?? "this template";

      if (!entry) {
        new Notice("This template has not been published yet.");
        return;
      }

      if (entry === "Template") {
        new Notice("The Main Template cannot be deleted.");
        return;
      }

      const confirmed = await this.confirmTemplateAction(
        `This will permanently delete the template "${title}".`
      );

      if (!confirmed) return;

      try {
        const response = await requestUrl({
          method: "DELETE",
          url: `https://api.omg.lol/address/${this.settings.username}/weblog/delete/${entry}`,
          headers: {
            Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
          },
        });

        if (!response.json?.request?.success) {
          throw new Error(
            response.json?.response?.message || "Remote delete failed"
          );
        }

        // ✅ Only clean up locally AFTER confirmed remote success
        await this.removeEntryFrontmatter(file);

        new Notice("🗑️ Weblog template deleted.");
      } catch (error) {
        console.error(error);
        new Notice("❌ Failed to delete weblog template.");
      }
    }


    // ===== Helpers =====

  private extractHtmlBlock(content: string): string | null {
    const match = content.match(/```(?:html)?\s*([\s\S]*?)```/i);
    return match ? match[1].trim() : null;
  }

  private async injectEntryFrontmatter(file: TFile, entryId: string) {
    const content = await this.app.vault.read(file);

    const updated = content.replace(
      /^---([\s\S]*?)---/,
      (_, yamlBlock) => {
        const lines = yamlBlock.trim().split("\n").filter(
          (line: string) => !line.startsWith("entry:")
        );
        lines.push(`entry: ${entryId}`);
        return `---\n${lines.join("\n")}\n---`;
      }
    );

    await this.app.vault.modify(file, updated);
  }

  private async removeEntryFrontmatter(file: TFile) {
    const content = await this.app.vault.read(file);

    const updated = content.replace(
      /^---([\s\S]*?)---/,
      (_, yamlBlock) => {
        const lines = yamlBlock
          .trim()
          .split("\n")
          .filter((line: string) => !line.startsWith("entry:"));

        return lines.length ? `---\n${lines.join("\n")}\n---` : "";
      }
    );

    await this.app.vault.modify(file, updated);
  }

  private async confirmTemplateAction(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.modalEl.addClass("omg-confirm-modal");

      modal.titleEl.setText("Confirm Template Action");

      modal.contentEl.createEl("p", { text: message });
      modal.contentEl.createEl("p", {
        text: "This action has no undo. Continue?",
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
        .setButtonText("Delete")
        .setCta()
        .onClick(() => {
          modal.close();
          resolve(true);
        });

      modal.open();
    });
  }
}
