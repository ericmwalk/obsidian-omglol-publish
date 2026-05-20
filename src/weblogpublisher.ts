import { App, MarkdownView, Notice, Plugin, TFile, TFolder, requestUrl, normalizePath, FuzzySuggestModal, Modal, ButtonComponent, parseYaml, stringifyYaml } from "obsidian";
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
    let metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;

    // Fallback for iOS/mobile where the metadata cache (IDB) may be unavailable
    if (!metadata) {
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        try { metadata = parseYaml(fmMatch[1]); } catch { /* leave null */ }
      }
    }

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

    const rawBody = this.stripFrontmatter(content);
    const pathFormat = await this.getPostPathFormat();
    const { resolved: bodyContent, unresolvedPublished } = this.resolveWikilinks(rawBody, file.path, pathFormat);
    const imageEmbeds = this.detectImageEmbeds(bodyContent);

    if (unresolvedPublished.length > 0 || imageEmbeds.length > 0) {
      const proceed = await this.warnAndConfirm(unresolvedPublished, imageEmbeds);
      if (!proceed) return;
    }

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
    public async publishFile(file: TFile, pathFormat?: string) {
      const content = await this.app.vault.read(file);
      const metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;

      if (!metadata || metadata.status?.toLowerCase() !== "published") return;


      const slug = metadata.slug?.trim() ||
        this.getEffectiveSlug(metadata.title, content, file.name);
      const date = metadata.date?.trim() || new Date().toISOString();
      const entryId = metadata.entry;


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

      const rawBody = this.stripFrontmatter(content);
      const resolvedPathFormat = pathFormat ?? await this.getPostPathFormat();
      const { resolved: bodyContent } = this.resolveWikilinks(rawBody, file.path, resolvedPathFormat);
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

        onChooseItem(item: string, _evt: MouseEvent | KeyboardEvent): void {
          // Resolve immediately when item chosen
          resolve(item);
          // Close the modal cleanly after resolving
          this.close();
        }

        onClose(): void {
          // Only resolve null if user closed manually (no selection)
          activeWindow.setTimeout(() => resolve(null), 10);
        }
      }

      const modal = new FolderSelectModal(this.app, folders);
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
      const batchPathFormat = await this.getPostPathFormat();

      for (const file of markdownFiles) {
        try {
          const metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;
          if (metadata?.status?.toLowerCase() === "published") {
            await this.publishFile(file, batchPathFormat);
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

// Added this to help perserve existing Frontmatter
  private async injectOrUpdateFrontmatter(file: TFile, entryId: string, slug: string) {
    try {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.entry = entryId;
        if (slug && slug.trim().length) fm.slug = slug.trim();
        else delete fm.slug;
      });
    } catch {
      // Fallback for iOS where processFrontMatter may fail due to IDB unavailability
      try {
        const raw = await this.app.vault.read(file);
        const fmRegex = /^---\n([\s\S]*?)\n---\n?/;
        const match = raw.match(fmRegex);
        if (!match) return;
        const fm = parseYaml(match[1]) || {};
        fm.entry = entryId;
        if (slug && slug.trim().length) fm.slug = slug.trim();
        else delete fm.slug;
        const newFm = `---\n${stringifyYaml(fm).trim()}\n---\n\n`;
        await this.app.vault.modify(file, raw.replace(fmRegex, newFm));
      } catch { /* best effort */ }
    }
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private promptForFrontmatter(file: TFile, _content: string, metadata?: any) {
    const existing: Partial<WeblogFrontmatterValues & { type?: string }> = {
      title: metadata?.title,
      date: metadata?.date,
      tags: Array.isArray(metadata?.tags) ? metadata.tags : [],
      status: metadata?.status,
      type: metadata?.type,
    };

// Fix for existing Frontmatter
    new WeblogFrontmatterModal(this.app, async (values) => {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        // Only set what your plugin owns
        if (values.title?.trim()) fm.title = values.title.trim();
        else delete fm.title;

        fm.date = values.date.trim();
        fm.status = values.status;
        if (values.isPage) fm.type = "page";
        else delete fm.type;

        if (values.tags?.length) fm.tags = values.tags;
        else delete fm.tags;
      });

      activeWindow.setTimeout(() => { void this.publishCurrentNote(); }, 300);
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


private resolveWikilinks(body: string, sourceFilePath: string, pathFormat: string): {
  resolved: string;
  unresolvedPublished: string[];
} {
  const unresolvedPublished: string[] = [];
  // Match [[file]], [[file|alias]], [[file#heading]], [[file#heading|alias]]
  // Negative lookbehind excludes ![[...]] image embeds
  const wikilinkRegex = /(?<!\!)\[\[([^\]#|]+)(?:#[^\]|]*)?\|?([^\]]*)\]\]/g;

  const resolved = body.replace(wikilinkRegex, (_match, filename, alias) => {
    const name = filename.trim();
    const displayText = alias?.trim() || name;

    const file = this.app.metadataCache.getFirstLinkpathDest(name, sourceFilePath);
    if (!file) return displayText;

    const fm = this.app.metadataCache.getCache(file.path)?.frontmatter;
    const slug = fm?.slug?.trim();

    if (slug) {
      const base = this.settings.weblogBaseUrl?.trim()
        || `https://${this.settings.username}.weblog.lol`;
      const isPage = fm?.type?.toLowerCase() === "page";
      const datePath = !isPage && fm?.date ? this.applyPhpDateFormat(pathFormat, String(fm.date)) : "";
      const url = datePath ? `${base}${datePath}${slug}` : `${base}/${slug}`;
      return `[${displayText}](${url})`;
    }

    if (fm?.paste_url) {
      const customBase = this.settings.pastebinBaseUrl?.trim();
      const url = customBase && fm?.paste_id
        ? `${customBase}/${fm.paste_id}`
        : fm.paste_url;
      return `[${displayText}](${url})`;
    }

    if (fm?.status?.toLowerCase() === "published") {
      unresolvedPublished.push(displayText);
    }

    return displayText;
  });

  return { resolved, unresolvedPublished };
}

private async getPostPathFormat(): Promise<string> {
  const defaultFormat = "/Y/m/d/";

  // 1. Check vault for a weblog configuration note
  const configFile = this.app.vault.getAllLoadedFiles().find((f): f is TFile => {
    if (!(f instanceof TFile)) return false;
    const fm = this.app.metadataCache.getCache(f.path)?.frontmatter;
    return fm?.type === "weblog" && fm?.entry === "configuration";
  });

  if (configFile) {
    try {
      const content = await this.app.vault.read(configFile);
      const match = content.match(/^Post path format:\s*(.+)$/m);
      if (match?.[1]?.trim()) return match[1].trim();
    } catch {
      // fall through
    }
  }

  // 2. Fetch from API if not found in vault
  try {
    const resp = await requestUrl({
      method: "GET",
      url: `https://api.omg.lol/address/${this.settings.username}/weblog/configuration`,
      headers: {
        Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
      },
    });
    const configText: string = resp.json?.response?.configuration ?? "";
    if (configText) {
      const match = configText.match(/^Post path format:\s*(.+)$/m);
      if (match?.[1]?.trim()) return match[1].trim();
    }
  } catch {
    // fall through to default
  }

  return defaultFormat;
}

private applyPhpDateFormat(format: string, dateStr: string): string {
  const safeDate = this.getSafeDate(dateStr);
  if (!safeDate.match(/^\d{4}-\d{2}-\d{2}$/)) return "";

  const [year, month, day] = safeDate.split("-");

  return format
    .replace(/Y/g, year)
    .replace(/y/g, year.slice(2))
    .replace(/m/g, month)
    .replace(/n/g, String(parseInt(month)))
    .replace(/d/g, day)
    .replace(/j/g, String(parseInt(day)));
}

private detectImageEmbeds(body: string): string[] {
  return [...body.matchAll(/!\[\[([^\]]+)\]\]/g)].map(m => m[1]);
}

private async warnAndConfirm(unresolvedLinks: string[], imageEmbeds: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new Modal(this.app);
    modal.titleEl.setText("Publishing Warnings");

    if (unresolvedLinks.length > 0) {
      modal.contentEl.createEl("p", {
        text: `${unresolvedLinks.length} link(s) point to notes marked as published but not yet pushed — they'll appear as plain text:`,
      });
      const ul = modal.contentEl.createEl("ul");
      for (const link of unresolvedLinks) {
        ul.createEl("li", { text: link });
      }
    }

    if (imageEmbeds.length > 0) {
      modal.contentEl.createEl("p", {
        text: `${imageEmbeds.length} image embed(s) haven't been uploaded — they won't display on your weblog:`,
      });
      const ul = modal.contentEl.createEl("ul");
      for (const img of imageEmbeds) {
        ul.createEl("li", { text: img });
      }
    }

    modal.contentEl.createEl("p", { text: "Cancel to fix first, or publish anyway?" });

    const buttonRow = modal.contentEl.createDiv({ cls: "modal-button-container" });

    new ButtonComponent(buttonRow)
      .setButtonText("Cancel")
      .onClick(() => { modal.close(); resolve(false); });

    new ButtonComponent(buttonRow)
      .setButtonText("Publish Anyway")
      .setCta()
      .onClick(() => { modal.close(); resolve(true); });

    modal.open();
  });
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
