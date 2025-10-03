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
      text: this.file ? "Upload Image to some.pics" : "Edit some.pics Image",
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
        text.setValue(this.altText).onChange((value) => {
          this.altText = value;
        })
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
          .setButtonText(this.file ? "Upload" : "Update")
          .setCta()
          .onClick(async () => {
            try {
              if (this.file) {
                // Upload mode
                await this.uploader.uploadFile(
                  this.file,
                  this.description,
                  this.hidden
                );
              } else if (this.picId) {
                // Edit mode
                await this.uploader.updateMetadata(
                  this.picId,
                  this.description,
                  this.tags,
                  this.hidden,
                  this.altText
                );
              }
              new Notice(this.file ? "Uploaded ✅" : "Updated ✅");
              this.close();
            } catch (err) {
              console.error("Action failed:", err);
              new Notice("Action failed. Check console for details.");
            }
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.close())
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
