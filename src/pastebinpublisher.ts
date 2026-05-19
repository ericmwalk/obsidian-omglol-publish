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

function stripFrontmatter(content: string): {
  frontmatter: Record<string, any>;
  body: string;
} {
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


// ======= only publish fenced content ======= 
function extractFencedContent(body: string): {
  content: string;
  syntax: string;
} {
  const match = body.match(/```(\w+)?\n([\s\S]*?)```/m);

  if (!match) {
    throw new Error(
      "Paste.lol requires content inside a ``` fenced code block."
    );
  }

  return {
    syntax: match[1] ?? "text",
    content: match[2].trimEnd(),
  };
}

// ======= title normalization ======= 

function normalizePasteTitle(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class PasteBinPublisher {
  app: App;
  token: string;
  username: string;
  pastebinBaseUrl: string;

  constructor(app: App, token: string, username: string, pastebinBaseUrl = "") {
    this.app = app;
    this.token = token;
    this.username = username;
    this.pastebinBaseUrl = pastebinBaseUrl;
  }

  // ======= publish note to paste.lol =======
  
  async publishCurrentNote(file: TFile) {
    const fm = await this.getFrontmatter(file);

    if (fm?.paste_id) {
      await this.publishPaste(file, fm.listed ?? false, fm.paste_id);
    } else {
      return new Promise<void>((resolve) => {
        new PasteModal(this.app, file.basename, async ({ title, listed }) => {
          await this.publishPaste(file, listed, title);
          resolve();
        }).open();
      });
    }
  }

// ======= create / update logic ======= 

  private async publishPaste(file: TFile, listed: boolean, title: string) {
    const raw = await this.app.vault.read(file);
    const { frontmatter, body } = stripFrontmatter(raw);

    // Normalize title (pastebin-style)
    const rawTitle = title || file.basename;
    const normalizedTitle = normalizePasteTitle(rawTitle);

    // Use fenced code block if present, otherwise fall back to raw body
    let content: string;
    if (file.extension !== "md") {
      content = body.trim();
    } else {
      const fenced = body.match(/```(?:\w+)?\n([\s\S]*?)```/m);
      content = fenced ? fenced[1].trimEnd() : body.trim();
    }

    const prevId = frontmatter.paste_id as string | undefined;
    const prevListed = frontmatter.listed ?? false;
    const listedChanged = !!(prevId && prevListed !== listed);

    const payload: any = {
      title: normalizedTitle,
      content,
    };

    if (listed === true) {
      payload.listed = true;
    }

    try {
      if (prevId && listedChanged) {
        await requestUrl({
          url: `https://api.omg.lol/address/${this.username}/pastebin/${prevId}`,
          method: "DELETE",
          headers: { Authorization: `Bearer ${this.token}` },
        });
      }

      await requestUrl({
        url: `https://api.omg.lol/address/${this.username}/pastebin/`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(payload),
      });

      const base = this.pastebinBaseUrl?.trim() || `https://${this.username}.paste.lol`;
      const newUrl = `${base}/${normalizedTitle}`;

      await this.setFrontmatter(file, {
        ...frontmatter,
        paste_id: normalizedTitle,
        paste_url: newUrl,
        listed,
        date: formatDateToISO(new Date()),
      });

      new Notice(
        prevId
          ? "Paste updated (may take a moment to propagate)"
          : listed
          ? "Paste published (listed)"
          : "Paste published (unlisted)"
      );
    } catch (err: any) {
      console.error("Error publishing/updating paste:", err);
      new Notice(
        "Failed to publish or update paste: " +
          (err.message || "Unknown error")
      );
    }
  }

// ======= delete logic ======= 

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

// ======= Frontmatter helpers ======= 

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
