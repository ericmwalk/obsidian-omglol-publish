// ======= Initialization and Processing ======= 

import { App, Plugin, Notice, MarkdownView } from "obsidian";
import { getDailyNote, createDailyNote, getAllDailyNotes } from "obsidian-daily-notes-interface";
import { CombinedSettings, DEFAULT_SETTINGS } from "./types";
import { SettingsTab } from "./settingstab";
import { WeblogPublisher } from "./weblogpublisher";
import { StatusPublisher } from "./statuspublisher";
import { PicsUploader } from "./picsuploader";
import { PastebinPublisher } from "./pastebinpublisher";
import { PasteModal } from "./pastemodal";
import { PicUploadModal } from "./picsuploadmodal";


export default class OmglolPublish extends Plugin {
  settings: CombinedSettings;
  dailyPluginAvailable: boolean = false;
  statusPublisher: StatusPublisher | null = null;
  weblogPublisher: WeblogPublisher | null = null;
  picsUploader: PicsUploader | null = null;
  pastebinPublisher: PastebinPublisher | null = null;

  async onload() {
    await this.loadSettings();

    this.dailyPluginAvailable =
      (this.app as any).internalPlugins?.getPluginById("daily-notes")?.enabled ||
      (this.app as any).plugins?.enabledPlugins?.has("periodic-notes");

    // === Status.lol ===
    if (this.settings.enableStatusPoster) {
      this.statusPublisher = new StatusPublisher(this.app, this.settings, this);
      this.addRibbonIcon("megaphone", "Post to status.lol", () => {
        this.statusPublisher?.showStatusModal();
      });
    }

    // === Weblog.lol ===
    if (this.settings.enableWeblog) {
      this.weblogPublisher = new WeblogPublisher(this.app, this.settings, this);
      this.addRibbonIcon("send", "Publish to omg.lol Weblog", () => {
        this.weblogPublisher?.publishCurrentNote?.();
      });
    }

    // === some.pics ===
    if (this.settings.enablePics) {
      this.picsUploader = new PicsUploader(this.app, this.settings, this);

      this.addRibbonIcon("images", "Upload images in note to some.pics", () => {
        this.picsUploader?.uploadAllEmbedsInNote();
      });

      this.addCommand({
        id: "upload-all-pics",
        name: "Upload all image embeds in note to some.pics",
        callback: () => this.picsUploader?.uploadAllEmbedsInNote(),
      });
      
      this.addRibbonIcon("image-plus", "Upload photo to some.pics", () => {
        const file = this.picsUploader?.resolveImageFromContext();
        if (file) {
          new PicUploadModal(this.app, this.picsUploader!, file).open();
        } else {
          new Notice("Select an image file or place cursor on an image embed in a note.");
        }
      });

      this.addCommand({
        id: "upload-pic",
        name: "Upload image to some.pics",
        checkCallback: (checking) => {
          const file = this.picsUploader?.resolveImageFromContext();
          if (file) {
            if (!checking) {
              new PicUploadModal(this.app, this.picsUploader!, file).open();
            }
            return true;
          }
          return false;
        },
      });
    }

    // Command: edit metadata if cursor is on a some.pics link
    this.addCommand({
      id: "edit-somepics-metadata",
      name: "Edit some.pics image metadata",
      callback: async () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
          new Notice("No active editor");
          return;
        }
        const editor = view.editor;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        // Regex to catch Markdown image/link URLs or raw URLs
        const urlRegex = /\!\[.*?\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s)]+/g;

        let match: RegExpExecArray | null;
        let foundUrl: string | null = null;

        // Walk through matches on the line and pick one under the cursor
        while ((match = urlRegex.exec(line)) !== null) {
          const url = match[1] || match[0];
          const start = match.index;
          const end = start + match[0].length;

          if (cursor.ch >= start && cursor.ch <= end) {
            foundUrl = url;
            break;
          }
        }

        // If cursor isn't inside a URL, but there's only one on the line, use that
        if (!foundUrl) {
          urlRegex.lastIndex = 0;
          const allMatches = [...line.matchAll(urlRegex)];
          if (allMatches.length === 1) {
            foundUrl = allMatches[0][1] || allMatches[0][0];
          }
        }

        if (!foundUrl) {
          new Notice("No URL found on this line.");
          return;
        }

        // Extract some.pics ID
        let idMatch = foundUrl.match(/https:\/\/some\.pics\/pic\/([a-z0-9]+)/i);
        if (!idMatch) {
          // Match /publish/ID or /<username>/ID with various image extensions
          const username = this.settings.username || "[^/]+";
          const cdnPattern = new RegExp(
            `https://cdn\\.some\\.pics/(?:publish|${username})/([^.\\/]+)\\.(?:jpg|jpeg|png|gif|webp)`,
            "i"
          );
          idMatch = foundUrl.match(cdnPattern);
        }

        if (!idMatch) {
          new Notice("No some.pics link found here.");
          return;
        }

        const picId = idMatch[1];
        await this.picsUploader?.openEditModal(picId);
      },
    });



    // Turn [[edit-somepics-<id>]] into clickable edit buttons
    this.registerMarkdownPostProcessor((el, ctx) => {
      el.querySelectorAll("a").forEach((link: HTMLAnchorElement) => {
        const match = link.getAttribute("href")?.match(/^edit-somepics-(.+)$/);
        if (match) {
          const picId = match[1];

          link.innerText = "✏️ Edit";
          link.style.cursor = "pointer";

          link.addEventListener("click", (evt) => {
            evt.preventDefault();
            evt.stopPropagation(); // <-- stop Obsidian from opening/creating a file
            this.picsUploader?.openEditModal(picId);
          });
        }
      });
    });

    // === paste.lol (Pastebin) ===
    if (this.settings.enablePastebin) {
      this.pastebinPublisher = new PastebinPublisher(
        this.app,
        this.settings.token,
        this.settings.username
      );

      // Ribbon icon for publishing current note to paste.lol
      this.addRibbonIcon("clipboard", "Publish to paste.lol", () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.pastebinPublisher?.publishCurrentNote(file);
        } else {
          new Notice("No active note to publish.");
        }
      });

      // Command: Publish current note
      this.addCommand({
        id: "publish-to-pastebin",
        name: "Publish note to paste.lol",
        checkCallback: (checking) => {
          const file = this.app.workspace.getActiveFile();
          if (file) {
            if (!checking) {
              this.pastebinPublisher?.publishCurrentNote(file);
            }
            return true;
          }
          return false;
        },
      });

      // Command: Delete paste
      this.addCommand({
        id: "delete-pastebin-entry",
        name: "Delete paste.lol entry",
        checkCallback: (checking) => {
          const file = this.app.workspace.getActiveFile();
          if (file) {
            if (!checking) {
              this.pastebinPublisher?.deletePaste(file);
            }
            return true;
          }
          return false;
        },
      });
    }

    // === Settings ===
    this.addSettingTab(new SettingsTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

export { OmglolPublish };
