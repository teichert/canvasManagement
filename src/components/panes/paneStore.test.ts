import { describe, it, expect } from "vitest";
import { maxRuleShare, movePane, paneActions, PaneSpec, parseDoc, showingPane, viewOf, viewPanes, widthRule } from "./paneStore";

const spec = (id: string, extra: Partial<PaneSpec> = {}): PaneSpec => ({
  hiddenByDefault: false,
  id,
  label: id,
  minWidth: 120,
  defaultWidth: 400,
  collapsedByDefault: () => false,
  ssr: false,
  ...extra,
});
const specs = [
  spec("help", { collapsedByDefault: () => true }),
  spec("calendar", { defaultWidth: 1000, ssr: true }),
  spec("modules"),
  spec("editor"),
  spec("preview"),
];
const ids = specs.map((s) => s.id);

describe("viewPanes", () => {
  it("applies the defaults until a pane has been toggled, and before hydration expands only what the server renders", () => {
    const views = viewPanes(specs, {}, true);
    expect(views.map((v) => v.collapsed)).toEqual([true, false, false, false, false]);
    expect(viewPanes(specs, {}, false).map((v) => v.collapsed)).toEqual([true, false, true, true, true]);
    expect(viewPanes(specs, { panes: { help: { collapsed: false } } }, true).find((v) => v.id === "help")?.collapsed).toBe(false);
  });

  it("puts the remembered order first and the rest after, as they registered", () => {
    expect(viewPanes(specs, { order: ["preview", "help"] }, true).map((v) => v.id)).toEqual(["preview", "help", "calendar", "modules", "editor"]);
  });

  it("reads a broken document as empty", () => {
    expect(parseDoc("{not json")).toEqual({});
    expect(parseDoc(null)).toEqual({});
  });
});

describe("widthRule", () => {
  it("makes a pane exactly its width, giving way from the right when the row is too narrow", () => {
    expect(widthRule({ minWidth: 120, width: 400 }, 0)).toEqual({ flex: "0 1 400px", minWidth: "120px", maxWidth: "400px" });
    expect(widthRule({ minWidth: 120, width: 400 }, 2).flex).toBe("0 256 400px");
  });

  it("a pane set below its minimum keeps the minimum", () => {
    expect(widthRule({ minWidth: 120, width: 100 }, 0)).toEqual({ flex: "0 1 120px", minWidth: "120px", maxWidth: "120px" });
  });

  it("a pane's width is the dragged one, else its default", () => {
    const views = viewPanes(specs, { panes: { editor: { width: 650 } } }, true);
    expect(views.find((v) => v.id === "editor")?.width).toBe(650);
    expect(views.find((v) => v.id === "calendar")?.width).toBe(1000);
  });
});

describe("showingPane", () => {
  it("on a phone, the first open pane shows; with none open, the first on the page", () => {
    expect(showingPane(viewPanes(specs, {}, true))).toBe("calendar");
    expect(showingPane(viewPanes(specs, paneActions.jumpTo({}, ids, "editor"), true))).toBe("editor");
    const allCollapsed = Object.fromEntries(ids.map((id) => [id, { collapsed: true, hidden: id === "help" }]));
    expect(showingPane(viewPanes(specs, { panes: allCollapsed }, true))).toBe("calendar");
    expect(showingPane([])).toBeUndefined();
  });
});

describe("paneActions", () => {
  it("jumps to a pane: it expanded and on the page, the rest collapsed", () => {
    const doc = paneActions.jumpTo({ panes: { calendar: { hidden: true } } }, ids, "calendar");
    expect(doc.panes?.calendar).toEqual({ hidden: false, collapsed: false });
    expect(doc.panes?.editor?.collapsed).toBe(true);
  });

  it("moves a pane in the order, keeping the others", () => {
    expect(movePane(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(paneActions.move({}, ids, "preview", 1).order).toEqual(["help", "preview", "calendar", "modules", "editor"]);
  });


});

describe("the max rule", () => {
  it("shows how much wider the pane may still be made, of what the row allows, from the top", () => {
    expect(maxRuleShare(400, 300, 700)).toBeCloseTo(0.25);
    expect(maxRuleShare(400, 400, 700)).toBe(0);
    expect(maxRuleShare(400, 500, 700)).toBe(0);
    expect(maxRuleShare(700, 300, 700)).toBe(1);
  });
  it("is the whole rule when there is no widest width", () => {
    expect(maxRuleShare(Infinity, 300, 700)).toBe(1);
  });
});

describe("panes added beyond the catalogue", () => {
  const ids = ["calendar", "editor", "editor#2"];
  it("adds a view's next free copy, open, at the end, and makes it current", () => {
    const doc = paneActions.add({ panes: { editor: { collapsed: true } } }, ids, "editor");
    expect(doc.added).toEqual(["editor#3"]);
    expect(doc.panes?.["editor#3"]).toEqual({ collapsed: false, hidden: false });
    expect(viewOf("editor#3")).toBe("editor");
    expect(viewOf("editor")).toBe("editor");
  });
  it("removes a copy with everything remembered about it", () => {
    const doc = paneActions.remove({ added: ["editor#2"], order: ["editor#2", "calendar"], panes: { "editor#2": { width: 300 } } }, "editor#2");
    expect(doc).toEqual({ added: [], order: ["calendar"], panes: {} });
  });
});

describe("a pane switched to another view", () => {
  const ids = ["calendar", "editor"];
  it("takes the pane's place, width and limits; a catalogue pane is hidden, a copy removed", () => {
    const doc = paneActions.switchView({ panes: { calendar: { width: 500, max: 600 } } }, ids, "calendar", "editor");
    expect(doc.order).toEqual(["editor#2", "editor"]);
    expect(doc.panes?.["editor#2"]).toEqual({ width: 500, max: 600, collapsed: false, hidden: false });
    expect(doc.panes?.calendar).toEqual({ width: 500, max: 600, hidden: true });
    const again = paneActions.switchView(doc, ["editor#2", "editor"], "editor#2", "preview");
    expect(again.order).toEqual(["preview#2", "editor"]);
    expect(again.added).toEqual(["preview#2"]);
    expect(again.panes?.["editor#2"]).toBeUndefined();
  });
  it("adds at a place in the row when asked", () => {
    expect(paneActions.add({}, ids, "editor", 1).order).toEqual(["calendar", "editor#2", "editor"]);
    expect(paneActions.add({}, ids, "editor", 0).order).toEqual(["editor#2", "calendar", "editor"]);
  });
});

describe("closing panes in bulk", () => {
  it("hides catalogue panes and removes copies, as × does", () => {
    const doc = paneActions.close({ added: ["editor#2"], panes: { "editor#2": { width: 1 } } }, ["calendar", "editor#2"]);
    expect(doc).toEqual({ added: [], order: undefined, panes: { calendar: { hidden: true } } });
  });
});

