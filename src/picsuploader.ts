// picsuploader.ts

import { App, Notice, TFile, MarkdownView, requestUrl, Editor } from "obsidian";
declare const moment: any;
import { CombinedSettings } from "./types";
import OmglolPublish from "./main";
import exifr from "exifr"; // for the Log

export class PicsUploader {
  app: App;
  settings: CombinedSettings;
  plugin: OmglolPublish;

  constructor(app: App, settings: CombinedSettings, plugin: OmglolPublish) {
    this.app = app;
    this.settings = settings;
    this.plugin = plugin;
  }

  // === Upload just the embed on the current line ===
  async uploadSelectedImage() {
    const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    if (!editor) {
      new Notice("No active editor");
      return;
    }

    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);

    const match = line.match(/!\[\[(.*?)\]\]/);
    if (!match) {
      new Notice("No image embed found on this line.");
      return;
    }

    await this.uploadAndReplace(editor, match[0], match[1]);
  }

  // === Upload all embeds in the current note (replace all after uploads) ===
  async uploadAllEmbedsInNote() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("No active editor");
      return;
    }

    const editor = view.editor;
    const text = editor.getValue();

    const matches = [...text.matchAll(/!\[\[(.*?)\]\]/g)];
    if (matches.length === 0) {
      new Notice("No image embeds found in this note.");
      return;
    }

    let uploaded = 0;
    const replacements: { embed: string; replacement: string }[] = [];

    // Persistent notice for progress
    const progressNotice = new Notice("Preparing uploads...", 0);

    for (const [fullMatch, filename] of matches) {
      uploaded++;
      progressNotice.setMessage(`Uploading ${uploaded} of ${matches.length}...`);

      const file = this.app.metadataCache.getFirstLinkpathDest(filename, "");
      if (!(file instanceof TFile)) continue;

      try {
        const uploadedUrl = await this.uploadFile(file);
        const altText = await this.generateAltText(uploadedUrl, file.basename);

        replacements.push({
          embed: fullMatch,
          replacement: `![${altText}](${uploadedUrl})`,
        });

        await this.logUpload(file.basename, uploadedUrl, file);

        if (this.settings.deleteAfterUpload) {
          await this.app.vault.delete(file);
        }
      } catch (e) {
        console.error(`Upload failed for ${filename}:`, e);
        new Notice(`Upload failed for ${filename}. See console.`);
      }
    }

    let updated = editor.getValue();
    for (const { embed, replacement } of replacements) {
      updated = updated.replace(embed, replacement);
    }
    editor.setValue(updated);

    // Done → clear the progress notice
    progressNotice.hide();
    new Notice(`Done: ${uploaded} image(s) uploaded to some.pics ✅`);
  }


  // === Helper: Upload a file + replace its embed (single line mode) ===
  private async uploadAndReplace(editor: Editor, embed: string, filename: string) {
    const file = this.app.metadataCache.getFirstLinkpathDest(filename, "");
    if (!(file instanceof TFile)) {
      console.warn(`File not found: ${filename}`);
      return;
    }

    try {
      new Notice(`Uploading ${filename}...`);

      const uploadedUrl = await this.uploadFile(file);
      const altText = await this.generateAltText(uploadedUrl, file.basename);

      const updated = editor.getValue().replace(embed, `![${altText}](${uploadedUrl})`);
      editor.setValue(updated);

      await this.logUpload(file.basename, uploadedUrl);

      if (this.settings.deleteAfterUpload) {
        await this.app.vault.delete(file);
      }

      new Notice(`Uploaded ${filename} ✅`);
    } catch (e) {
      console.error(`Upload failed for ${filename}:`, e);
      new Notice(`Upload failed for ${filename}. See console.`);
    }
  }

  // === Core upload logic ===
  public async uploadFile(
    file: TFile,
    description: string = "",
    hidden?: boolean
  ): Promise<string> {
    const arrayBuffer = await this.app.vault.readBinary(file);
    const base64 = this.arrayBufferToBase64(arrayBuffer);

    // Step 1: POST image
    const postResp = await requestUrl({
      url: `https://api.omg.lol/address/${this.settings.username}/pics/upload`,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.settings.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pic: base64,
        tags: this.settings.defaultPicsTags || "",
      }),
    });

    if (postResp.status !== 200) {
      console.error("Upload failed response:", postResp);
      throw new Error(`Upload failed, status ${postResp.status}`);
    }

    const picId = postResp.json?.response?.id;
    const uploadedUrl = postResp.json?.response?.url;
    if (!picId || !uploadedUrl) throw new Error("No ID/URL returned from API");

    // Step 2: PUT metadata
    const altText = await this.generateAltText(uploadedUrl, file.basename);

    const body: any = {
      description,
      alt_text: altText,
      tags: this.settings.defaultPicsTags || "",
    };

    // Rules for hide_from_public:
    // - Bulk (hidden === undefined) → always true
    // - Modal (hidden === true) → true
    // - Modal (hidden === false) → omit field (defaults to public)
    if (hidden === undefined || hidden === true) {
      body.hide_from_public = true;
    }

    const putResp = await requestUrl({
      url: `https://api.omg.lol/address/${this.settings.username}/pics/${picId}`,
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${this.settings.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (putResp.status !== 200) {
      console.warn("Metadata update failed:", putResp);
    }

    return uploadedUrl;
  }


  // === Alt text generator (GPT integration) ===
  private async generateAltText(imageUrl: string, fallback: string): Promise<string> {
    if (!this.settings.chatgptApiKey) {
      return fallback;
    }

    try {
      const resp = await requestUrl({
        url: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.settings.chatgptApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", // or gpt-4o if you want vision
          messages: [
            {
              role: "system",
              content: "You are an assistant that writes short, clear alt text for images.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Write a short alt text for this image." },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          max_tokens: 50,
        }),
      });

      const alt = resp.json?.choices?.[0]?.message?.content?.trim();
      return alt || fallback;
    } catch (err) {
      console.error("Alt text generation failed:", err);
      return fallback;
    }
  }

  // === Upload logging ===
  private async logUpload(originalFilename: string, uploadedUrl: string, file?: TFile) {
    if (!this.settings.maintainPicsLog) return;

    const noteFile = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    const noteLink = noteFile ? `[[${noteFile.basename}]]` : "";

    const uploadedOn = moment().format("YYYY-MM-DD HH:mm:ss");

    let takenOn = "";
    if (file) {
      try {
        const arrayBuffer = await this.app.vault.readBinary(file);
        const exifData = await exifr.parse(arrayBuffer, ["DateTimeOriginal"]);
        if (exifData?.DateTimeOriginal) {
          takenOn = moment(exifData.DateTimeOriginal).format("YYYY-MM-DD HH:mm:ss");
        }
      } catch (err) {
        console.warn(`No EXIF date for ${originalFilename}`, err);
      }
    }

    const logRow = `| ${originalFilename} | ${uploadedUrl} | ${noteLink} | ${uploadedOn} | ${takenOn} |\n`;

    const logPath = this.settings.picsLogPath || "_pics-upload-log.md";
    try {
      const existing = await this.app.vault.adapter.read(logPath).catch(() => null);
      if (!existing) {
        const header =
          `# some.pics Upload Log\n\n` +
          `| Original Filename | Uploaded URL | Note | Uploaded On | Taken On |\n` +
          `|-------------------|--------------|------|-------------|----------|\n`;
        await this.app.vault.adapter.write(logPath, header + logRow);
      } else {
        await this.app.vault.adapter.append(logPath, logRow);
      }
    } catch (err) {
      console.error("Failed to update pics upload log:", err);
    }
  }

  // === ArrayBuffer → Base64 ===
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }


  public resolveImageFromContext(): TFile | null {
    // Check if cursor is on an embed
    const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    if (editor) {
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const match = line.match(/!\[\[(.*?)\]\]/);
      if (match) {
        const file = this.app.metadataCache.getFirstLinkpathDest(match[1], "");
        if (file instanceof TFile) return file;
      }
    }

    // Otherwise fall back to active file
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && activeFile.extension.match(/(png|jpg|jpeg|gif|webp)$/i)) {
      return activeFile;
    }

    return null;
  }

}