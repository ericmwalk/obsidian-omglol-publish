import { App, Modal, Setting, Notice } from "obsidian";

export class PasteModal extends Modal {
  private onSubmit: (result: { title: string; listed: boolean }) => void;
  private defaultTitle: string;
  private titleValue: string;
  private listedValue: boolean;

  constructor(
    app: App,
    defaultTitle: string,
    onSubmit: (result: { title: string; listed: boolean }) => void
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.defaultTitle = defaultTitle;
    this.titleValue = defaultTitle;
    this.listedValue = false; // default to unlisted
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl("h2", { text: "Publish to Pastebin" });

    new Setting(contentEl)
      .setName("Paste slug")
      .addText((text) =>
        text.setValue(this.defaultTitle).onChange((val) => {
          this.titleValue = val.trim();
        })
      );

    new Setting(contentEl).setName("Listed").addToggle((toggle) => {
      toggle.setValue(this.listedValue).onChange((val) => {
        this.listedValue = val;
      });
    });

    const buttons = contentEl.createDiv("modal-button-container");

    const submitBtn = buttons.createEl("button", { text: "Publish" });
    submitBtn.onclick = () => {
      if (!this.titleValue) {
        new Notice("Please enter a title/slug before publishing.");
        return;
      }
      this.onSubmit({ title: this.titleValue, listed: this.listedValue });
      this.close();
    };

    const cancelBtn = buttons.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
