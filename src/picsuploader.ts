// picsuploader.ts

import { App, Notice, TFile, MarkdownView, requestUrl, Editor } from "obsidian";
declare const moment: any;
import { CombinedSettings } from "./types";
import OmglolPublish from "./main";
import exifr from "exifr"; // for EXIF log
import { PicUploadModal } from "./picsuploadmodal";

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

    progressNotice.hide();
    new Notice(`Done: ${uploaded} image(s) uploaded to some.pics ✅`);
  }

  // === Upload a single embed (helper) ===
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
    hidden?: boolean,
    altText?: string,
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
    let finalAltText = altText;
      if (!finalAltText) {
        // Only auto-generate if not provided
        finalAltText = await this.generateAltText(uploadedUrl, file.basename);
      }
    
    const body: any = {
      description,
      alt_text: finalAltText,
      tags: this.settings.defaultPicsTags || "",
    };

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

    // Always log
    await this.logUpload(file.basename, uploadedUrl, file);

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
          model: "gpt-4o-mini",
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

    // Build links
    const filePart = uploadedUrl.split("/").pop() || "";
    const picId = filePart.split(".")[0];
    const namespace = uploadedUrl.split("/")[3];
    const webViewUrl = `https://some.pics/${namespace}/${picId}`;
    const editLink = `[✏️](edit-somepics-${picId})`;
    const webLink = `[📷](${webViewUrl})`;
    const uploadedOnLink = `[${uploadedOn}](${uploadedUrl})`;

    const logRow =
      `| ${editLink} | ${webLink} | ${originalFilename} | ${noteLink} | ${uploadedOnLink} | ${takenOn} |\n`;

    try {
      const basePath = this.settings.picsLogPath?.trim() || "_pics-upload-log.md";
      const baseName = basePath.replace(/\.md$/, "");
      const indexPath = basePath;

      if (this.settings.monthlyPicsLogs) {
        const monthKey = moment().format("YYYY-MM");

        // Folder with same name as index (minus .md)
        const monthlyFolder = baseName;
        const logPath = `${monthlyFolder}/${monthKey}.md`;

        // ✅ Ensure monthly folder exists
        const folderExists = await this.app.vault.adapter.stat(monthlyFolder).catch(() => null);
        if (!folderExists) {
          await this.app.vault.createFolder(monthlyFolder).catch((err) => {
            console.error("Failed to create monthly log folder:", err);
          });
        }

        const existing = await this.app.vault.adapter.read(logPath).catch(() => null);
        if (!existing) {
          const header =
            `# ${baseName} (${monthKey})\n\n` +
            `| Edit | Web | Original Filename | Note | Uploaded On | Taken On |\n` +
            `|------|-----|-------------------|------|-------------|----------|\n`;
          await this.app.vault.adapter.write(logPath, header + logRow);

          // Update index
          const indexExisting = await this.app.vault.adapter.read(indexPath).catch(() => null);
          const monthLink = `- [[${logPath}]]\n`; // vault-relative
          if (!indexExisting) {
            await this.app.vault.adapter.write(indexPath, `# ${baseName} Index\n\n` + monthLink);
          } else if (!indexExisting.includes(logPath)) {
            await this.app.vault.adapter.append(indexPath, monthLink);
          }
        } else {
          await this.app.vault.adapter.append(logPath, logRow);
        }
      } else {
        // === Single log file ===
        const logPath = indexPath;

        // ✅ Ensure folder for single log exists if nested
        const folder = logPath.split("/").slice(0, -1).join("/");
        if (folder) {
          const folderExists = await this.app.vault.adapter.stat(folder).catch(() => null);
          if (!folderExists) {
            await this.app.vault.createFolder(folder).catch((err) => {
              console.error("Failed to create log folder:", err);
            });
          }
        }

        const existing = await this.app.vault.adapter.read(logPath).catch(() => null);
        if (!existing) {
          const header =
            `# ${baseName}\n\n` +
            `| Edit | Web | Original Filename | Note | Uploaded On | Taken On |\n` +
            `|------|-----|-------------------|------|-------------|----------|\n`;
          await this.app.vault.adapter.write(logPath, header + logRow);
        } else {
          await this.app.vault.adapter.append(logPath, logRow);
        }
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

    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && activeFile.extension.match(/(png|jpg|jpeg|gif|webp)$/i)) {
      return activeFile;
    }
    return null;
  }

  // === Update metadata (edit mode) ===
  public async updateMetadata(
    picId: string,
    description: string,
    tags: string,
    hidden: boolean,
    altText: string
  ): Promise<void> {
    const body: any = {
      description,
      alt_text: altText,
      tags: tags || "",
    };

    if (hidden === undefined || hidden === true) {
      body.hide_from_public = true;
    }

    // For Debugging console.log("Update metadata body:", body);

    const resp = await requestUrl({
      url: `https://api.omg.lol/address/${this.settings.username}/pics/${picId}`,
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.settings.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (resp.status !== 200) {
      console.error("Update failed response:", resp);
      new Notice("Update failed. See console.");
    } else {
      new Notice("Metadata updated ✅");
    }
  }

  // === Fetch current metadata for a pic (for editing UI) ===
  public async fetchMetadata(picId: string): Promise<any | null> {
    try {
      const resp = await requestUrl({
        url: `https://api.omg.lol/address/${this.settings.username}/pics/${picId}`,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.settings.token}`,
        },
      });

      if (resp.status !== 200) {
        console.error("Failed to fetch metadata:", resp);
        new Notice("Failed to fetch photo info.");
        return null;
      }

      const data = resp.json?.response?.pic;
      if (!data) {
        console.error("Unexpected API format:", resp.json);
        return null;
      }

      // ✅ Always use API-provided URL if available
      let finalUrl = data.url;
      if (!finalUrl) {
        // Fallback: reconstruct using extension
        let ext = "jpg";
        if (data.exif?.["File Type Extension"]) {
          ext = data.exif["File Type Extension"].toLowerCase();
        } else if (data.mime) {
          ext = (data.mime?.split("/")?.[1] || "jpg").toLowerCase();
        }
        finalUrl = `https://cdn.some.pics/${data.address}/${data.id}.${ext}`;
      }

      return {
        ...data,
        url: finalUrl,
      };
    } catch (err) {
      console.error("Error fetching metadata:", err);
      return null;
    }
  }



  // === Open the edit modal for an existing some.pics image ===
  public async openEditModal(picId: string) {
    try {
      const existing = await this.fetchMetadata(picId);

      if (!existing) {
        new Notice("Could not fetch photo info for editing.");
        return;
      }

      // debugging console.log("Fetched metadata for edit:", existing);

      if (!("description" in existing) && !("url" in existing)) {
        console.warn("Unexpected metadata format:", existing);
        new Notice("Unexpected photo data format. Check console.");
        return;
      }

      const modal = new PicUploadModal(
        this.app,
        this,
        null, // no local file when editing
        picId,
        existing
      );
      modal.open();
    } catch (err) {
      console.error("Failed to open edit modal:", err);
      new Notice("Failed to open edit modal. See console for details.");
    }
  }
}
