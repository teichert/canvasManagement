import { describe, it, expect } from "vitest";
import { fitOpening, leadId, limitsAfter, makeRoom, maxRuleShare, moveEdge, withLead, movePane, paneActions, PaneSpec, parseDoc, relax, showingPane, viewOf, viewPanes, widthRule } from "./paneStore";

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
    expect(fitOpening([p("a", 300), p("new", 300)], ["new"], 277, 300, 23)).toEqual({ widths: { a: 300, new: 300 }, collapse: [], short: 0 });
  });
  it("then shrinks the others, those after it first, to their min", () => {
    expect(fitOpening([p("a", 300), p("new", 300), p("c", 300)], ["new"], 277, 0, 23).widths).toEqual({ a: 223, new: 300, c: 100 });
  });
  it("then closes open panes from the right, not the one opening", () => {
    expect(fitOpening([p("a", 100), p("new", 300), p("c", 100)], ["new"], 277, 0, 23)).toEqual({ widths: { new: 300 }, collapse: ["c", "a"], short: 123 });
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

describe("a cascade making room (the title's double-click, the narrowest box dragged past the width)", () => {
  const p = (id: string, width: number, minWidth = 100) => ({ id, width, minWidth, maxWidth: Infinity });
  const open = [p("a", 300), p("b", 300), p("c", 300)];
  it("narrows the others to their narrowest, then collapses, then hides, from the right, and says what the pane gets", () => {
    // 900 wide row of three 300s with no empty room; a wants 700: b and c narrowing to 100 finds the 400
    const made = makeRoom(open, ["a", "b", "c"], "a", 700, 0, 0, 23);
    expect(made?.collapse).toEqual([]);
    expect(made?.hide).toEqual([]);
    expect(made?.widths.a).toBe(700);
  });
  it("hides panes from the right when collapsing everything is not enough", () => {
    // a wants 880: narrowing finds 400, collapsing c then b 77 each, and hiding c then b their bars
    const made = makeRoom(open, ["a", "b", "c"], "a", 880, 0, 0, 23);
    expect(made?.collapse).toEqual(["c", "b"]);
    expect(made?.hide).toEqual(["c", "b"]);
    expect(made?.widths.a).toBe(880);
  });
  it("uses the empty room before the first pane first, and gives the rest back to the row", () => {
    const made = makeRoom(open, ["a", "b", "c"], "a", 500, 50, 300, 23);
    expect(made?.widths).toEqual({ a: 500, b: 300, c: 300, [leadId]: 150 });
    expect(made?.collapse).toEqual([]);
  });
  it("fits a row wider than its room: the first pane keeps its width, the rest give way from the right, the empty room before the first pane first", () => {
    // the row is 150 too narrow for three 300s; the room before a gives 100 of it, b (nearest a) narrows for the rest
    const made = makeRoom(open, ["a", "b", "c"], "a", 300, -150, 100, 23);
    expect(made.widths).toEqual({ a: 300, b: 250, c: 300, [leadId]: 0 });
    expect(made.collapse).toEqual([]);
    // 500 too narrow: narrowing finds 400, collapsing c then b (narrowed to 100) 77 each
    expect(makeRoom(open, ["a", "b", "c"], "a", 300, -500, 0, 23)).toEqual({ widths: { a: 300, [leadId]: 0 }, collapse: ["c", "b"], hide: [] });
  });
  it("remembers what it displaced, as it was, and puts the last one back", () => {
    const before = { b: { id: "b", collapsed: false, hidden: false, width: 300 }, c: { id: "c", collapsed: false, hidden: false, width: 300 } };
    const doc = paneActions.makeRoom({}, { widths: { a: 700 }, collapse: ["c", "b"], hide: ["c"] }, before);
    expect(doc.panes?.c).toEqual({ collapsed: true, hidden: true });
    expect(doc.displaced?.map((d) => d.id)).toEqual(["c", "b"]);
    const back = paneActions.restore(doc, doc.displaced!.at(-1)!);
    expect(back.panes?.b).toEqual({ collapsed: false, hidden: false, width: 300 });
    expect(back.displaced?.map((d) => d.id)).toEqual(["c"]);
    expect(paneActions.forget(doc, ["b"]).displaced?.map((d) => d.id)).toEqual(["c"]);
    // fitted again with nothing new to displace (a row that can't fit): the records stay as they were
    const again = { b: { ...before.b, collapsed: true }, c: { ...before.c, collapsed: true, hidden: true } };
    expect(paneActions.makeRoom(doc, { widths: { a: 700 }, collapse: ["c", "b"], hide: ["c"] }, again).displaced).toEqual(doc.displaced);
  });
});
