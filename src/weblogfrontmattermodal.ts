import { App, Modal, Setting, TextComponent, ToggleComponent } from "obsidian";

export interface WeblogFrontmatterValues {
  title?: string;
  date: string;
  tags: string[];
  status: "published" | "draft";
  isPage?: boolean;
}

export class WeblogFrontmatterModal extends Modal {
  values: WeblogFrontmatterValues;
  onSubmit: (values: WeblogFrontmatterValues) => void;

  constructor(
    app: App,
    onSubmit: (values: WeblogFrontmatterValues) => void,
    existing?: Partial<WeblogFrontmatterValues & { type?: string }>
  ) {
    super(app);

    this.values = {
      title: existing?.title ?? "",
      date: existing?.date ?? new Date().toISOString(),
      tags: existing?.tags ?? [],
      status: existing?.status ?? "published",
      isPage: existing?.type === "page" ? true : false, // 👈 default logic
    };

    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h2", { text: "Weblog Post Metadata" });

    // Title
    new Setting(contentEl)
      .setName("Title")
      .addText((text: TextComponent) => {
        text.setValue(this.values.title || "")
          .setPlaceholder("Optional title")
          .onChange((value) => (this.values.title = value.trim()));
      });

    // Date
    new Setting(contentEl)
      .setName("Date")
      .addText((text: TextComponent) => {
        text.setValue(this.values.date)
          .onChange((value) => (this.values.date = value.trim()));
      });

    // Tags
    new Setting(contentEl)
      .setName("Tags (comma separated)")
      .addText((text: TextComponent) => {
        text.setValue(this.values.tags.join(", "))
          .onChange((value) => {
            this.values.tags = value.split(",").map(t => t.trim()).filter(t => t.length);
          });
      });

    // Status toggle
    new Setting(contentEl)
      .setName("Publish now?")
      .addToggle((toggle: ToggleComponent) => {
        toggle.setValue(this.values.status === "published")
          .onChange((val) => {
            this.values.status = val ? "published" : "draft";
          });
      });

    // Page toggle
    new Setting(contentEl)
      .setName("Page")
      .setDesc("Treat this note as a page instead of a blog post")
      .addToggle((toggle: ToggleComponent) => {
        toggle
          .setValue(this.values.isPage ?? false)
          .onChange((val) => {
            this.values.isPage = val;
          });
      });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Save").setCta().onClick(() => {
          this.close();
          this.onSubmit(this.values);
        })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.close())
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}
