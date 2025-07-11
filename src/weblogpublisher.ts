import { App, MarkdownView, Notice, Plugin, TFile, requestUrl, normalizePath } from "obsidian";
import { CombinedSettings } from "./types";

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

    if (!metadata) {
      new Notice("Note is missing frontmatter.");
      return;
    }

    const status = metadata.status?.toLowerCase();
    if (status !== "published" && status !== "draft") {
      new Notice("Note frontmatter must include `status: published` or `draft`.");
      return;
    }

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
        const safeDate = this.getSafeDate(date);
        await this.renameFileWithSlug(file, safeDate, returnedSlug);
        new Notice(entryId ? "🔁 Weblog post updated." : "✅ Weblog post published.");
      } else {
        throw new Error("Response missing 'entry' data.");
      }
    } catch (error) {
      console.error("Error publishing post:", error);
      new Notice("❌ Failed to publish weblog post.");
    }
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
    const words = input
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
      return new Date().toISOString().split("T")[0]; // fallback to today's date
    }

    if (date.includes("T")) {
      return date.split("T")[0];
    }

    // Assume already safe (e.g., "2025-07-09") but trim and sanitize anyway
    return date.replace(/[:\\/]/g, "").trim();
  }

  private async renameFileWithSlug(file: TFile, date: string, slug: string) {
    if (!this.settings.enableRenaming) return;
    const safeDate = this.getSafeDate(date);
    const sanitizedSlug = slug.replace(/[:\\/]/g, "").trim();
    const newName = `${safeDate}_${sanitizedSlug}.md`;
    const newPath = normalizePath(file.path.replace(file.name, newName));
    if (newPath !== file.path) {
      await this.app.fileManager.renameFile(file, newPath);
    }
  }

}
