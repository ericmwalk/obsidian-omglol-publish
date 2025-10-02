// picuploadmodal.ts

import { App, Modal, Setting, TFile, Notice } from "obsidian";
import { PicsUploader } from "./picsuploader";

export class PicUploadModal extends Modal {
  uploader: PicsUploader;
  file: TFile;
  description: string = "";
  tags: string = "";
  hidden: boolean = false;

  constructor(app: App, uploader: PicsUploader, file: TFile) {
    super(app);
    this.uploader = uploader;
    this.file = file;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Upload Image to some.pics" });

    new Setting(contentEl)
      .setName("Description")
      .addText((text) =>
        text.onChange((value) => {
          this.description = value;
        })
      );

    new Setting(contentEl)
      .setName("Tags")
      .setDesc("Comma separated")
      .addText((text) =>
        text.onChange((value) => {
          this.tags = value;
        })
      );

    new Setting(contentEl)
      .setName("Hide from public feed")
      .addToggle((toggle) =>
        toggle.setValue(this.hidden).onChange((value) => {
          this.hidden = value;
        })
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Upload")
          .setCta()
          .onClick(async () => {
            try {
              new Notice(`Uploading ${this.file.basename}...`);

              // Temporarily override tags if user entered them
              const originalTags = this.uploader.settings.defaultPicsTags;
              if (this.tags.trim() !== "") {
                this.uploader.settings.defaultPicsTags = this.tags;
              }

              const url = await this.uploader.uploadFile(
                this.file,
                this.description,
                this.hidden
              );

              // Restore default tags after upload
              this.uploader.settings.defaultPicsTags = originalTags;

              new Notice(`Uploaded ✅ ${url}`);
              this.close();
            } catch (err) {
              console.error("Upload failed:", err);
              new Notice("Upload failed. Check console for details.");
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
