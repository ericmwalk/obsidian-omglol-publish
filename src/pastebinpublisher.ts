import {
  App,
  Notice,
  requestUrl,
  TFile,
  parseYaml,
  stringifyYaml,
} from "obsidian";
import { PasteModal } from "./pastemodal";

function formatDateToISO(date: Date): string {
  return date.toISOString();
}

function stripFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const fmRegex = /^---\n([\s\S]*?)\n---\n?/;
  const match = content.match(fmRegex);

  if (match) {
    try {
      const parsed = parseYaml(match[1]) || {};
      const body = content.slice(match[0].length);
      return { frontmatter: parsed, body };
    } catch {
      return { frontmatter: {}, body: content };
    }
  }

  return { frontmatter: {}, body: content };
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 32);
}

export class PastebinPublisher {
  app: App;
  token: string;
  username: string;

  constructor(app: App, token: string, username: string) {
    this.app = app;
    this.token = token;
    this.username = username;
  }

  /**
   * Entry point: publish note to paste.lol.
   * Decides whether to reuse paste_id or open modal.
   */
  async publishCurrentNote(file: TFile) {
    const fm = await this.getFrontmatter(file);

    if (fm?.paste_id && /^[a-z0-9_-]+$/.test(fm.paste_id)) {
      // Already published with a good slug → update directly
      await this.publishPaste(file, fm.listed ?? false, fm.paste_id);
    } else {
      // Not published yet → open modal
      return new Promise<void>((resolve) => {
        new PasteModal(this.app, file.basename, async ({ title, listed }) => {
          await this.publishPaste(file, listed, title);
          resolve();
        }).open();
      });
    }
  }

  /**
   * Core publish logic (create/update).
   */
  private async publishPaste(file: TFile, listed: boolean, title: string) {
    const raw = await this.app.vault.read(file);
    const { frontmatter, body } = stripFrontmatter(raw);

    const pasteSlug = slugifyTitle(title);

    const prevId = frontmatter.paste_id as string | undefined;
    const prevListed = frontmatter.listed ?? false;
    const listedChanged = prevId && prevListed !== listed;

    // Build payload
    const payload: any = {
      title: pasteSlug,
      content: body.trim(),
    };
    // Only send listed if explicitly true
    if (listed === true) {
      payload.listed = true;
    }

    try {
      let newId = prevId;
      let newUrl = frontmatter.paste_url;

      if (prevId && listedChanged) {
        // Delete the old paste first
        await requestUrl({
          url: `https://api.omg.lol/address/${this.username}/pastebin/${prevId}`,
          method: "DELETE",
          headers: { Authorization: `Bearer ${this.token}` },
        });
        newId = "";
      }

      // Publish/update
      const res = await requestUrl({
        url: `https://api.omg.lol/address/${this.username}/pastebin/`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.json?.response?.paste) {
        newId = res.json.response.paste.id || pasteSlug;
        newUrl = res.json.response.paste.url || `https://${this.username}.paste.lol/${pasteSlug}`;
      } else {
        newId = pasteSlug;
        newUrl = `https://${this.username}.paste.lol/${pasteSlug}`;
      }

      // Always update frontmatter
      await this.setFrontmatter(file, {
        ...frontmatter,
        paste_id: newId,
        paste_url: newUrl,
        listed,
        date: formatDateToISO(new Date()),
      });

      new Notice(listed ? "Paste published (listed)" : "Paste published (unlisted)");
    } catch (err: any) {
      console.error("Error publishing/updating paste:", err);
      new Notice("Failed to publish or update paste: " + (err.message || "Unknown error"));
    }
  }

  async deletePaste(file: TFile) {
    const raw = await this.app.vault.read(file);
    const { frontmatter, body } = stripFrontmatter(raw);
    const pasteId = frontmatter.paste_id;

    if (!pasteId) {
      new Notice("No paste_id found in frontmatter to delete");
      return;
    }

    try {
      await requestUrl({
        url: `https://api.omg.lol/address/${this.username}/pastebin/${pasteId}`,
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.token}` },
      });

      const newFrontmatter = { ...frontmatter };
      delete newFrontmatter.paste_id;
      delete newFrontmatter.paste_url;
      delete newFrontmatter.listed;

      const yaml = Object.keys(newFrontmatter).length
        ? `---\n${stringifyYaml(newFrontmatter).trim()}\n---\n\n`
        : "";
      const newContent = `${yaml}${body.trimStart()}`;
      await this.app.vault.modify(file, newContent);

      new Notice("Paste deleted from omg.lol and metadata cleared");
    } catch (err: any) {
      console.error("Error deleting paste:", err);
      new Notice("Failed to delete paste: " + (err.message || "Unknown error"));
    }
  }

  async getFrontmatter(file: TFile): Promise<Record<string, any>> {
    const content = await this.app.vault.read(file);
    const match = /^---\n([\s\S]*?)\n---/m.exec(content);
    if (!match) return {};
    try {
      return parseYaml(match[1]) || {};
    } catch (e) {
      console.error("Error parsing YAML frontmatter", e);
      return {};
    }
  }

  private async setFrontmatter(file: TFile, updates: Record<string, any>) {
    const raw = await this.app.vault.read(file);

    const fmRegex = /^---\n([\s\S]*?)\n---\n?/;
    const match = raw.match(fmRegex);

    let body = raw;
    let existing: Record<string, any> = {};
    if (match) {
      try {
        existing = parseYaml(match[1]) || {};
      } catch {
        existing = {};
      }
      body = raw.slice(match[0].length);
    }

    const newFrontmatter = { ...existing };
    for (const key in updates) {
      if (updates[key] === null) {
        delete newFrontmatter[key];
      } else {
        newFrontmatter[key] = updates[key];
      }
    }

    const yaml = Object.keys(newFrontmatter).length
      ? `---\n${stringifyYaml(newFrontmatter).trim()}\n---\n\n`
      : "";
    const newContent = `${yaml}${body.trimStart()}`;
    await this.app.vault.modify(file, newContent);
  }
}
