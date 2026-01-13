import { App, MarkdownView, Notice, Plugin, TFile, TFolder, requestUrl, normalizePath, FuzzySuggestModal, Modal, ButtonComponent } from "obsidian";
import { CombinedSettings } from "./types";
import { WeblogFrontmatterModal, WeblogFrontmatterValues } from "./weblogfrontmattermodal";

export class WeblogPublisher {
  constructor(
    private app: App,
    private settings: CombinedSettings,
    private plugin: Plugin
  ) {
    if (this.settings.enableWeblog !== false) {
      this.addCommand();
    }
  }

  private addCommand() {
    this.plugin.addCommand({
      id: "publish-weblog-post",
      name: "Publish to Weblog",
      callback: () => this.publishCurrentNote(),
    });
    this.plugin.addCommand({
      id: "delete-weblog-post",
      name: "Delete Weblog Post/Page",
      callback: () => this.deleteCurrentPost(),
    });

  }

  public async publishCurrentNote() {
    if (!this.settings.enableWeblog) {
      new Notice("Weblog publishing is disabled in settings.");
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice("No active markdown file.");
      return;
    }

    const file = view.file;
    const content = await this.app.vault.read(file);
    const metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;

    // If no frontmatter ask for the data needed to publish
    if (!metadata) {
      this.promptForFrontmatter(file, content);
      return;
    }

    // If frontmatter exists but status is invalid ask
    const statusValue = metadata.status?.toLowerCase();
    if (statusValue !== "published" && statusValue !== "draft") {
      this.promptForFrontmatter(file, content, metadata);
      return;
    }

    const status = metadata.status?.toLowerCase();
    if (status !== "published" && status !== "draft") {
      new Notice("Note frontmatter must include `status: published` or `draft`.");
      return;
    }
    
    const wasUpdate = Boolean(metadata.entry);

    const frontmatterTitle = metadata.title?.trim() ?? "";
    const useTitle = frontmatterTitle.length > 0 ? frontmatterTitle : "";

    let slug = metadata.slug?.trim();
    if (!slug || slug === "undefined") {
      slug = this.getEffectiveSlug(frontmatterTitle, content, file.name);
    }

    const date = metadata.date?.trim() || new Date().toISOString();
    const entryId = metadata.entry;

    const tagsArray = metadata.tags ?? [];
    const tagsLine = Array.isArray(tagsArray) && tagsArray.length > 0
      ? `Tags: ${tagsArray.join(", ")}\n`
      : "";

    // Optional fields for Type and Status
    const type = metadata.type?.trim();
    const validTypeLine = type && type.toLowerCase() !== "post" ? `Type: ${type}\n` : "";

    const apiStatus = metadata.status?.trim();
    const statusLine = apiStatus ? `Status: ${apiStatus}\n` : "";

    const bodyContent = this.stripFrontmatter(content);
    const titleLine = useTitle.length > 0 ? `Title: ${useTitle}\n` : "";

    const fullPost = `${titleLine}Slug: ${slug}\nDate: ${date}\n${validTypeLine}${statusLine}${tagsLine}\n${bodyContent}`;

    const endpoint = entryId
      ? `https://api.omg.lol/address/${this.settings.username}/weblog/entry/${entryId}`
      : `https://api.omg.lol/address/${this.settings.username}/weblog/entry`;

    try {
      const response = await requestUrl({
        method: "POST",
        url: endpoint,
        headers: {
          Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
          "Content-Type": "text/plain",
        },
        body: fullPost,
      });

      const result = response.json;
      const entry = result?.response?.entry;
      if (entry) {
        const returnedSlug = entry.slug || slug;
        await this.injectOrUpdateFrontmatter(file, entry.entry, returnedSlug);

        // Respect page-type + renamePages toggle
        const isPage =
          typeof metadata.type === "string" &&
          metadata.type.toLowerCase() === "page";
        const allowRename =
          this.settings.enableRenaming && (!isPage || this.settings.renamePages);

        const safeDate = this.getSafeDate(date);
        if (allowRename) {
          await this.renameFileWithSlug(file, safeDate, returnedSlug);
        }
// THIS SHOULD BE CHANGED
//        new Notice(entryId ? "🔁 Weblog post updated." : "✅ Weblog post published.");
        const isDraft = status === "draft";

        let message = "";

        if (isDraft) {
          message = wasUpdate
            ? "📝 Weblog draft updated."
            : "📝 Draft saved to weblog (not public).";
        } else {
          message = wasUpdate
            ? "🔁 Weblog post updated."
            : "✅ Weblog post published.";
        }

        new Notice(message);

      } else {
        throw new Error("Response missing 'entry' data.");
      }
    } catch (error) {
      console.error("Error publishing post:", error);
      new Notice("❌ Failed to publish weblog post.");
    }
  }

  // Publishes a single file (used by batchPublish)
    public async publishFile(file: TFile) {
      const content = await this.app.vault.read(file);
      const metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;

      if (!metadata || metadata.status?.toLowerCase() !== "published") return;


      const slug = metadata.slug?.trim() ||
        this.getEffectiveSlug(metadata.title, content, file.name);
      const date = metadata.date?.trim() || new Date().toISOString();
      const entryId = metadata.entry;

      const wasUpdate = Boolean(metadata.entry);
      const status = metadata.status?.toLowerCase();

      const tagsArray = metadata.tags ?? [];
      const tagsLine = Array.isArray(tagsArray) && tagsArray.length > 0
        ? `Tags: ${tagsArray.join(", ")}\n`
        : "";

      const type = metadata.type?.trim();
      const validTypeLine = type && type.toLowerCase() !== "post"
        ? `Type: ${type}\n`
        : "";
      const apiStatus = metadata.status?.trim();
      const statusLine = apiStatus ? `Status: ${apiStatus}\n` : "";

      const bodyContent = this.stripFrontmatter(content);
      const titleLine = metadata.title?.trim()
        ? `Title: ${metadata.title.trim()}\n`
        : "";

      const fullPost = `${titleLine}Slug: ${slug}\nDate: ${date}\n${validTypeLine}${statusLine}${tagsLine}\n${bodyContent}`;
      const endpoint = entryId
        ? `https://api.omg.lol/address/${this.settings.username}/weblog/entry/${entryId}`
        : `https://api.omg.lol/address/${this.settings.username}/weblog/entry`;

      try {
        const response = await requestUrl({
          method: "POST",
          url: endpoint,
          headers: {
            Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
            "Content-Type": "text/plain",
          },
          body: fullPost,
        });

        const result = response.json;
        const entry = result?.response?.entry;
        if (entry) {
          const returnedSlug = entry.slug || slug;
          await this.injectOrUpdateFrontmatter(file, entry.entry, returnedSlug);

          new Notice(entryId ? "🔁 Weblog post updated." : "✅ Weblog post published.");

        } else {
          throw new Error("Response missing entry data.");
        }
      } catch (error) {
        console.error("Error publishing:", error);
        new Notice(`❌ Failed to publish ${file.name}`);
      }
    }
  
    public async batchPublish() {
      // Get list of folders
      const folders = this.app.vault
        .getAllLoadedFiles()
        .filter((f): f is TFolder => f instanceof TFolder)
        .map((f) => f.path)
        .filter((p) => !p.startsWith(".")); // skip hidden folders

      if (folders.length === 0) {
        new Notice("No folders found in vault.");
        return;
      }

    // Select a folder to publish
    const selectedFolder = await new Promise<string | null>((resolve) => {
      const self = this;

      class FolderSelectModal extends FuzzySuggestModal<string> {
        folders: string[];

        constructor(app: App, folders: string[]) {
          super(app);
          this.folders = folders;
        }

        getItems(): string[] {
          return this.folders;
        }

        getItemText(item: string): string {
          return item;
        }

        onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
          // Resolve immediately when item chosen
          resolve(item);
          // Close the modal cleanly after resolving
          this.close();
        }

        onClose(): void {
          // Only resolve null if user closed manually (no selection)
          setTimeout(() => resolve(null), 10);
        }
      }

      const modal = new FolderSelectModal(self.app, folders);
      modal.setPlaceholder("Select folder to batch publish");
      modal.open();
    });


      // exit if canceled
      if (!selectedFolder) {
        new Notice("Batch publish canceled — no folder selected.");
        return;
      }

      // Get the chosen folder object
      const folder = this.app.vault.getAbstractFileByPath(selectedFolder);
      if (!(folder instanceof TFolder)) {
        new Notice(`⚠️ Folder "${selectedFolder}" not found.`);
        return;
      }

      // Recursive helper to walk through subfolders
      const collectMarkdownFiles = (dir: TFolder): TFile[] => {
        let files: TFile[] = [];
        for (const child of dir.children) {
          if (child instanceof TFile && child.extension === "md") files.push(child);
          else if (child instanceof TFolder) files = files.concat(collectMarkdownFiles(child));
        }
        return files;
      };

      const markdownFiles = collectMarkdownFiles(folder);

      if (markdownFiles.length === 0) {
        new Notice(`No Markdown files found in "${selectedFolder}".`);
        return;
      }

      new Notice(`Starting batch publish (${markdownFiles.length} files)…`);
      let publishedCount = 0;

      for (const file of markdownFiles) {
        try {
          const metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;
          if (metadata?.status?.toLowerCase() === "published") {
            await this.publishFile(file);
            publishedCount++;
          }
        } catch (err) {
          console.error(`❌ Error publishing ${file.name}:`, err);
          new Notice(`❌ Failed: ${file.name}`);
        }
      }

      new Notice(`✅ Batch publish complete. ${publishedCount} posts processed.`);
    }


  private getEffectiveSlug(title: string, content: string, fallbackFilename: string): string {
    const useTitle = title?.trim();
    let source: string;

    if (useTitle?.length) {
      source = useTitle;
    } else {
      const body = this.stripFrontmatter(content);
      const firstLine = body.split("\n").find(line => line.trim().length > 0);
      source = firstLine ?? this.extractTitleFromFilename(fallbackFilename);
    }

    return this.slugify(source);
  }

  private slugify(input: string): string {
    // 1. Replace Markdown links with their text: [text](url) → text
    let cleaned = input.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // 2. Replace HTML links with their inner text: <a href="...">text</a> → text
    cleaned = cleaned.replace(/<a\s+[^>]*href=["'][^"']*["'][^>]*>(.*?)<\/a>/gi, "$1");

    // 3. Remove bare URLs (http/https)
    cleaned = cleaned.replace(/https?:\/\/\S+/g, "");

    // 4. Clean and extract words
    const words = cleaned
      .replace(/['"-]/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .toLowerCase()
      .match(/\b\w+\b/g) || [];

    return words.slice(0, this.settings.slugWordCount).join("-");
  }

  private extractTitleFromFilename(filename: string): string {
    const name = filename.replace(/\.md$/, "");
    const parts = name.split("_");
    return parts.slice(1).join(" ") || name;
  }

  private stripFrontmatter(content: string): string {
    const match = content.match(/^---\n([\s\S]*?)\n---\n*/);
    return match ? content.substring(match[0].length).trim() : content.trim();
  }

  private async injectOrUpdateFrontmatter(file: TFile, entryId: string, slug: string) {
    const content = await this.app.vault.read(file);
    const updated = content.replace(
      /^---([\s\S]*?)---/,
      (_, yamlBlock) => {
        const lines = yamlBlock.trim().split("\n");
        const cleanedLines = lines.filter((line: string) =>
          !line.startsWith("entry:") && !line.startsWith("slug:")
        );
        cleanedLines.push(`entry: ${entryId}`);
        if (slug) cleanedLines.push(`slug: ${slug}`);
        return `---\n${cleanedLines.join("\n")}\n---`;
      }
    );

    const needsBlankLine = updated.match(/^---[\s\S]*?---\n?/)?.[0]?.endsWith("\n") ? "" : "\n";
    await this.app.vault.modify(file, updated + needsBlankLine);
  }

  private getSafeDate(date: string | undefined): string {
    if (!date) {
      return new Date().toISOString().split("T")[0]; // fallback to today
    }
    if (date.includes("T")) {
      return date.split("T")[0];
    }
    if (date.includes(" ")) {
      return date.split(" ")[0];
    }
    return date.replace(/[:\\/]/g, "").trim();
  }

  private async renameFileWithSlug(file: TFile, date: string, slug: string) {
    if (!this.settings.enableRenaming) return;

    const parsedDate = this.getSafeDate(date);
    const safeSlug = slug.replace(/[\\/:]/g, "-");

    const newName = `${parsedDate}_${safeSlug}.md`;
    const newPath = normalizePath(file.path.replace(file.name, newName));

    if (newPath !== file.path) {
      await this.app.fileManager.renameFile(file, newPath);
    }
  }

  private promptForFrontmatter(file: TFile, content: string, metadata?: any) {
    const existing: Partial<WeblogFrontmatterValues & { type?: string }> = {
      title: metadata?.title,
      date: metadata?.date,
      tags: Array.isArray(metadata?.tags) ? metadata.tags : [],
      status: metadata?.status,
      type: metadata?.type,
    };

    new WeblogFrontmatterModal(this.app, async (values) => {
      const fm = [
        "---",
        values.title ? `title: ${values.title}` : "",
        `date: ${values.date}`,
        `status: ${values.status}`,
        values.isPage ? "type: page" : "",
        values.tags.length
          ? `tags:\n${values.tags.map(t => `  - ${t}`).join("\n")}`
          : "",
        "---",
      ].filter(Boolean).join("\n");

      await this.app.vault.modify(file, `${fm}\n\n${this.stripFrontmatter(content)}`);

      // wait for metadataCache refresh, then retry publish
      setTimeout(() => {
        this.publishCurrentNote();
      }, 300);
    }, existing).open();
  }


  // ===== Delete Logic =====
  private async deleteCurrentPost() {
    if (!this.settings.enableWeblog) {
      new Notice("Weblog publishing is disabled in settings.");
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice("No active markdown file.");
      return;
    }

    const file = view.file;
    const metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;

    if (!metadata || !metadata.entry) {
      new Notice("This post has not been published yet.");
      return;
    }

    const entry = metadata.entry;
    const title = metadata.title ?? file.basename;

    const confirmed = await this.confirmDelete(
      `This will permanently delete the weblog post/page "${title}".`
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
          response.json?.response?.message || "Delete failed"
        );
      }

      // clean up entry information and make a draft
      await this.detachWeblogEntry(file);

      new Notice("🗑️ Weblog post/page deleted.");
    } catch (error) {
      console.error("Error deleting weblog post:", error);
      new Notice("❌ Failed to delete weblog post.");
    }
  }

  private async detachWeblogEntry(file: TFile) {
    const content = await this.app.vault.read(file);

    const updated = content.replace(
      /^---([\s\S]*?)---/,
      (_, yamlBlock) => {
        const lines = yamlBlock.trim().split("\n");

        const cleaned: string[] = [];
        let hasStatus = false;

        for (const line of lines) {
          if (line.startsWith("entry:")) continue;

          if (line.startsWith("status:")) {
            cleaned.push("status: draft");
            hasStatus = true;
            continue;
          }

          cleaned.push(line);
        }

        // If status was missing entirely, add it
        if (!hasStatus) {
          cleaned.push("status: draft");
        }

        return `---\n${cleaned.join("\n")}\n---`;
      }
    );

    await this.app.vault.modify(file, updated);
  }


private async confirmDelete(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new Modal(this.app);
    modal.modalEl.addClass("omg-confirm-modal");

    modal.titleEl.setText("Confirm Delete");

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
