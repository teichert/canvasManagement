import { describe, it, expect } from "vitest";
import { fitOpening, leadId, limitsAfter, maxRuleShare, moveEdge, withLead, movePane, paneActions, PaneSpec, parseDoc, relax, shareRow, showingPane, viewPanes, widthRule } from "./paneStore";

const spec = (id: string, extra: Partial<PaneSpec> = {}): PaneSpec => ({
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
    expect(showingPane(viewPanes(specs, paneActions.setAllCollapsed({ panes: { help: { hidden: true } } }, ids, true), true))).toBe("calendar");
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

  it("opens the panes given at the widths given, leaving the others alone", () => {
    const doc = paneActions.openAll({ panes: { help: { hidden: true, collapsed: true }, editor: { width: 650, collapsed: true } } }, { editor: 300.4, calendar: 300.4 });
    expect(doc.panes?.help).toEqual({ hidden: true, collapsed: true });
    expect(doc.panes?.editor).toEqual({ width: 300.4, collapsed: false });
    expect(doc.panes?.calendar).toEqual({ width: 300.4, collapsed: false });
  });

  it("reset forgets everything", () => {
    expect(paneActions.reset()).toEqual({});
  });
});

describe("moveEdge", () => {
  const p = (id: string, width: number, minWidth = 100, maxWidth = Infinity) => ({ id, width, minWidth, maxWidth });
  it("right: the empty room goes first, so the panes after are shoved over unchanged", () => {
    expect(moveEdge([p("a", 300), p("b", 300)], 1, 50, 80)).toEqual({ a: 350, b: 300 });
  });
  it("right: past the empty room, the panes after shrink nearest first, each to its min", () => {
    expect(moveEdge([p("a", 300), p("b", 150), p("c", 300)], 1, 200, 20)).toEqual({ a: 500, b: 100, c: 170 });
  });
  it("right: the panes before grow nearest first, each to its max", () => {
    expect(moveEdge([p("a", 300), p("b", 300, 100, 320), p("c", 300)], 2, 50, 100)).toEqual({ a: 330, b: 320, c: 300 });
  });
  it("left: the panes before shrink nearest first to their min, the panes after grow to their max, the rest is empty room", () => {
    expect(moveEdge([p("a", 300), p("b", 150), p("c", 300, 100, 340)], 2, -100, 0)).toEqual({ a: 250, b: 100, c: 340 });
  });
});

describe("fitOpening", () => {
  const p = (id: string, width: number, minWidth = 100) => ({ id, width, minWidth, maxWidth: Infinity });
  it("takes the empty room first and changes nobody when it's enough", () => {
    expect(fitOpening([p("a", 300), p("new", 300)], "new", 277, 300, 23)).toEqual({ widths: { a: 300, new: 300 }, collapse: [] });
  });
  it("then shrinks the others, those after it first, to their min", () => {
    expect(fitOpening([p("a", 300), p("new", 300), p("c", 300)], "new", 277, 0, 23).widths).toEqual({ a: 223, new: 300, c: 100 });
  });
  it("then closes open panes from the right, not the one opening", () => {
    expect(fitOpening([p("a", 100), p("new", 300), p("c", 100)], "new", 277, 0, 23)).toEqual({ widths: { new: 300 }, collapse: ["c", "a"] });
  });
});

describe("shareRow", () => {
  const p = (id: string, minWidth: number, maxWidth = Infinity) => ({ id, width: 0, minWidth, maxWidth });
  it("gives each its min, then shares the rest by headroom, nobody past its max", () => {
    const { widths, collapse } = shareRow([p("a", 100, 200), p("b", 100)], 1000, 20);
    expect(collapse).toEqual([]);
    expect(widths.a).toBeCloseTo(180);
    expect(widths.b).toBeCloseTo(820);
  });
  it("collapses a pane whose min doesn't fit, handing mins out from the left", () => {
    expect(shareRow([p("a", 500), p("b", 500)], 700, 20).collapse).toEqual(["b"]);
  });
});

describe("the max rule", () => {
  it("shows how much of the widest width is left, as a share of its length from the top", () => {
    expect(maxRuleShare(400, 300)).toBeCloseTo(0.25);
    expect(maxRuleShare(400, 400)).toBe(0);
    expect(maxRuleShare(400, 500)).toBe(0);
  });
  it("is the whole rule when there is no widest width", () => {
    expect(maxRuleShare(Infinity, 300)).toBe(1);
  });
});

describe("a drag from a resize square", () => {
  const p = (id: string, width: number, minWidth = 100, maxWidth = Infinity) => ({ id, width, minWidth, maxWidth });
  it("gets its way: the pane it is for is free of its limits for the drag, the others keep theirs", () => {
    const b = p("b", 300, 300, 300);
    expect(moveEdge([p("a", 300), b, p("c", 300)], 2, 50, 0)).toEqual({ a: 350, b: 300, c: 250 });
    const open = relax([p("a", 300), b, p("c", 300)], "b");
    expect(moveEdge(open, 2, 50, 0)).toEqual({ a: 300, b: 350, c: 250 });
    expect(moveEdge(open, 2, -250, 0)).toEqual({ a: 300, b: 50, c: 550 });
  });
  it("moves only the limit the drag crossed, to where the pane ended", () => {
    const b = { minWidth: 200, maxWidth: 400 };
    expect(limitsAfter(b, 300)).toEqual({});
    expect(limitsAfter(b, 150.4)).toEqual({ min: 150 });
    expect(limitsAfter(b, 450)).toEqual({ max: 450 });
    expect(limitsAfter({ minWidth: 120, maxWidth: Infinity }, 80)).toEqual({ min: 80 });
  });
  it("a min pushed under the pane's own minimum holds, and the floor is still known", () => {
    const view = viewPanes(specs, paneActions.setLimits({}, "editor", { min: 80 }), true).find((v) => v.id === "editor")!;
    expect([view.minWidth, view.maxWidth, view.floor]).toEqual([80, Infinity, 120]);
    expect(JSON.parse(JSON.stringify(paneActions.setLimits({ panes: { editor: { min: 80 } } }, "editor", { min: undefined })))).toEqual({ panes: { editor: {} } });
  });
});

describe("the row's right end", () => {
  const p = (id: string, width: number, minWidth = 100) => ({ id, width, minWidth, maxWidth: Infinity });
  it("the end bar dragged right widens the last pane into the empty room, and no further", () => {
    expect(moveEdge([p("a", 300), p("b", 300)], 2, 50, 80)).toEqual({ a: 300, b: 350 });
    expect(moveEdge([p("a", 300), p("b", 300)], 2, 100, 80)).toEqual({ a: 300, b: 380 });
  });
  it("dragged left, the last pane narrows to its min, then the one before it, leaving empty room", () => {
    expect(moveEdge([p("a", 300), p("b", 300)], 2, -250, 0)).toEqual({ a: 250, b: 100 });
  });
});

describe("the row's left end", () => {
  const p = (id: string, width: number, minWidth = 100) => ({ id, width, minWidth, maxWidth: Infinity });
  it("the first bar dragged right leaves room before it, the empty room at the end going first", () => {
    expect(moveEdge(withLead([p("a", 300), p("b", 300)], 0), 1, 50, 80)).toEqual({ [leadId]: 50, a: 300, b: 300 });
  });
  it("dragged back left, the room before it is taken back", () => {
    expect(moveEdge(withLead([p("a", 300)], 60), 1, -100, 0)).toEqual({ [leadId]: 0, a: 360 });
  });
  it("the lead is remembered apart from the panes", () => {
    expect(paneActions.setWidths({}, { [leadId]: 40.4, a: 300 })).toEqual({ lead: 40, panes: { a: { width: 300 } } });
  });
});
