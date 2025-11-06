// picuploadmodal.ts

import { App, Modal, Setting, TFile, Notice } from "obsidian";
import { PicsUploader } from "./picsuploader";

export class PicUploadModal extends Modal {
  uploader: PicsUploader;
  file: TFile | null;
  picId?: string;

  description: string = "";
  tags: string = "";
  hidden: boolean = false;
  altText: string = "";
  previewUrl: string = ""; // for thumbnail
  remoteUrl?: string;


  constructor(
    app: App,
    uploader: PicsUploader,
    file: TFile | null,
    picId?: string,
    existingData?: any
  ) {
    super(app);
    this.uploader = uploader;
    this.file = file;
    this.picId = picId;

  // Detect remote upload
  if (existingData?.remoteUrl) {
    this.remoteUrl = existingData.remoteUrl;
  }

    // Prefill if editing
    if (existingData) {
      this.description = existingData.description || "";
      this.tags = Array.isArray(existingData.tags)
        ? existingData.tags.join(", ")
        : (existingData.tags || "");
      this.hidden = !!existingData.hide_from_public;
      this.altText = existingData.alt_text || "";

      // ✅ Use API-provided URL directly
      this.previewUrl = existingData.url || "";
      // Debugging console.log("Preview URL in modal:", this.previewUrl);
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", {
      text: this.file || this.remoteUrl
        ? "Upload Image to some.pics"
        : "Edit some.pics Image",

    });
    // Debugging console.log("Preview URL in modal:", this.previewUrl);

    // Thumbnail preview if editing
    if (!this.file && this.previewUrl) {
      const img = contentEl.createEl("img", { attr: { src: this.previewUrl } });
      img.style.maxWidth = "200px";
      img.style.display = "block";
      img.style.margin = "0 auto 15px auto"; // centered
      img.style.borderRadius = "6px";
      img.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
    }

    // 🆕 Show preview for remote upload
    if (this.remoteUrl) {
      const img = contentEl.createEl("img", { attr: { src: this.remoteUrl } });
      img.style.maxWidth = "200px";
      img.style.display = "block";
      img.style.margin = "0 auto 15px auto";
      img.style.borderRadius = "6px";
      img.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
    }

    // === Prefilled fields ===
    new Setting(contentEl)
      .setName("Description")
      .addText((text) =>
        text.setValue(this.description).onChange((value) => {
          this.description = value;
        })
      );

    new Setting(contentEl)
      .setName("Tags")
      .setDesc("Comma separated")
      .addText((text) =>
        text.setValue(this.tags).onChange((value) => {
          this.tags = value;
        })
      );

    new Setting(contentEl)
      .setName("Alt Text")
      .addText((text) =>
        text
          .setValue(this.altText)
          .onChange((value) => {
            this.altText = value;
          })
          .inputEl.classList.add("alt-text-field") 
      );

    new Setting(contentEl)
      .setName("Hide from public feed")
      .addToggle((toggle) =>
        toggle.setValue(this.hidden).onChange((value) => {
          this.hidden = value;
        })
      );

    // === Buttons ===
    new Setting(contentEl)
    .addButton((btn) =>
      btn
        .setButtonText(this.file || this.remoteUrl ? "Upload" : "Update")
        .setCta()
        .onClick(async () => {
          try {
            let finalAlt = this.altText;

            // 🧠 Generate alt text only if blank and GPT key set
            if (!finalAlt && this.uploader.settings.chatgptApiKey) {
              const imageUrl = this.remoteUrl || this.previewUrl;
              if (imageUrl) {
                new Notice("Generating alt text...");
                finalAlt = await this.uploader.generateAltText(
                  imageUrl,
                  this.file?.name || "image"
                );
                this.altText = finalAlt;

                // 🪄 Update modal field live
                const altField = this.contentEl.querySelector(
                  ".alt-text-field"
                ) as HTMLInputElement | null;
                if (altField) altField.value = finalAlt;
              }
            }

            // === Perform upload or update ===
            if (this.remoteUrl) {
              await this.uploader.uploadFile(
                this.remoteUrl,
                this.description,
                this.hidden,
                finalAlt,
                this.tags
              );
            } else if (this.file) {
              await this.uploader.uploadFile(
                this.file,
                this.description,
                this.hidden,
                finalAlt,
                this.tags
              );
            } else if (this.picId) {
              await this.uploader.updateMetadata(
                this.picId,
                this.description,
                this.tags,
                this.hidden,
                finalAlt
              );
            }

            new Notice(this.file || this.remoteUrl ? "Uploaded ✅" : "Updated ✅");
            this.close();
          } catch (err) {
            console.error("Action failed:", err);
            new Notice("Action failed. Check console for details.");
          }
        })
    )
    .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close())
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
