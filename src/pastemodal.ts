import { App, Modal, Setting, TextComponent, ToggleComponent } from "obsidian";

export class PasteModal extends Modal {
  private titleInput!: TextComponent;
  private listedToggle!: ToggleComponent;

  constructor(
    app: App,
    defaultTitle: string,
    private onSubmit: (result: { title: string; listed: boolean }) => Promise<void>
  ) {
    super(app);
    this.defaultTitle = defaultTitle;
  }

  private defaultTitle: string;

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h2", { text: "Publish to paste.lol" });

    new Setting(contentEl)
      .setName("Paste name")
      .setDesc("You may include an extension (e.g. example.js, readme.md)")
      .addText((text) => {
        this.titleInput = text;
        text.setValue(this.defaultTitle);
      });

    new Setting(contentEl)
      .setName("Listed")
      .setDesc("Whether this paste should be publicly listed")
      .addToggle((toggle) => {
        this.listedToggle = toggle;
        toggle.setValue(false);
      });

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Publish")
        .setCta()
        .onClick(async () => {
          const title = this.titleInput.getValue().trim();
          if (!title) return;

          this.close();
          await this.onSubmit({
            title,
            listed: this.listedToggle.getValue(),
          });
        })
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
