import { describe, expect, it } from "vitest";
import { Layout, limitsAfter, makeRoom, pushEdge, resize, restore, Slab, squareDrag } from "./cascade";

const slab = (id: string, width = 500, more: Partial<Slab> = {}): Slab => ({ id, width, minWidth: 400, maxWidth: Infinity, collapsed: false, hidden: false, ...more });
// modules, calendar, editor and preview open, each 100 past its narrowest; bars 20 wide, no gaps
const row: Layout = { slabs: ["modules", "calendar", "editor", "preview"].map((id) => slab(id)), lead: 0, free: 0, bar: 20, gap: 0 };
const look = (l: Layout) => l.slabs.map((s) => s.id + (s.hidden ? "-" : s.collapsed ? "_" : s.width)).join(" ");
const kinds = (effects: { id: string; kind: string }[]) => effects.map((e) => `${e.kind} ${e.id}`);

describe("the calendar's bar dragged right (the edge before it)", () => {
  const at = (d: number) => look(pushEdge(row, 1, d).layout);
  it("narrows the calendar first, then pushes into the editor, then the preview, each to its narrowest", () => {
    expect(at(50)).toBe("modules550 calendar450 editor500 preview500");
    expect(at(150)).toBe("modules650 calendar400 editor450 preview500");
    expect(at(300)).toBe("modules800 calendar400 editor400 preview400");
  });
  it("then collapses them from the right, then takes their bars off the page from the right", () => {
    expect(at(300 + 380)).toBe("modules1180 calendar400 editor400 preview_");
    expect(at(300 + 380 * 3)).toBe("modules1940 calendar_ editor_ preview_");
    expect(at(300 + 380 * 3 + 20)).toBe("modules1960 calendar_ editor_ preview-");
    expect(at(300 + 380 * 3 + 60)).toBe("modules2000 calendar- editor- preview-");
    // nothing left to give: the drag goes no further
    expect(at(5000)).toBe(at(300 + 380 * 3 + 60));
  });
  it("remembers each effect in the order it happened", () => {
    expect(kinds(pushEdge(row, 1, 2000).effects)).toEqual([
      "narrow calendar", "narrow editor", "narrow preview",
      "collapse preview", "collapse editor", "collapse calendar",
      "hide preview", "hide editor", "hide calendar",
    ]);
  });
  it("takes the empty room at the end first: the panes after are shoved over unchanged", () => {
    expect(look(pushEdge({ ...row, free: 100 }, 1, 80).layout)).toBe("modules580 calendar500 editor500 preview500");
  });
  it("with the pane before it at its widest, the rest is empty room before the first pane", () => {
    const capped = { ...row, slabs: row.slabs.map((s) => (s.id === "modules" ? { ...s, maxWidth: 520 } : s)) };
    const pushed = pushEdge(capped, 1, 50).layout;
    expect([look(pushed), pushed.lead]).toEqual(["modules520 calendar450 editor500 preview500", 30]);
  });
});

describe("dragged left, the mirror", () => {
  it("takes the empty room before the first pane first, then narrows the panes before the edge, nearest first, then collapses them from the left", () => {
    const l = { ...row, lead: 50 };
    expect(look(pushEdge(l, 3, -50).layout)).toBe("modules500 calendar500 editor500 preview550");
    expect(look(pushEdge(l, 3, -250).layout)).toBe("modules500 calendar400 editor400 preview750");
    expect(look(pushEdge(l, 3, -250 - 380).layout)).toBe("modules_ calendar400 editor400 preview1130");
  });
  it("the right end dragged left narrows the last pane, nearest first, leaving empty room", () => {
    const pushed = pushEdge(row, 4, -150).layout;
    expect([look(pushed), pushed.free]).toEqual(["modules500 calendar500 editor450 preview400", 150]);
  });
});

describe("undoing a cascade as room returns", () => {
  const pushed = pushEdge(row, 1, 2000);
  // the right end dragged back left: modules narrows, the room at the end goes to what was displaced
  const back = (room: number) => look(restore({ ...pushed.layout, slabs: pushed.layout.slabs.map((s) => (s.id === "modules" ? { ...s, width: 2000 - room } : s)), free: room }, pushed.effects).layout);
  it("brings the bars back first, last taken first, then reopens the panes, then widens them, last narrowed first", () => {
    expect(back(20)).toBe("modules1980 calendar_ editor- preview-");
    expect(back(60)).toBe("modules1940 calendar_ editor_ preview_");
    expect(back(60 + 380)).toBe("modules1560 calendar400 editor_ preview_");
    expect(back(60 + 380 * 3)).toBe("modules800 calendar400 editor400 preview400");
    expect(back(60 + 380 * 3 + 50)).toBe("modules750 calendar400 editor400 preview450");
    expect(back(60 + 380 * 3 + 300)).toBe("modules500 calendar500 editor500 preview500");
  });
  it("keeps what is not yet undone, and drops a record that no longer applies", () => {
    const partly = restore({ ...pushed.layout, free: 60 }, pushed.effects);
    expect(kinds(partly.records)).toEqual(kinds(pushed.effects.slice(0, 6)));
    expect(restore(row, pushed.effects).records).toEqual([]);
  });
});

describe("a pane resized by the cascade (a double-click, the narrowest box)", () => {
  it("is its right edge dragged: the side after it gives way as a drag's would, then the side before it; shrinking gives it back", () => {
    expect(look(resize(row, "editor", 100, []).layout)).toBe("modules500 calendar500 editor600 preview400");
    const grown = resize(row, "editor", 300, []);
    // the preview collapsed: 180 more than needed, left as empty room
    expect([look(grown.layout), grown.layout.free]).toEqual(["modules500 calendar500 editor800 preview_", 180]);
    // past everything after it (the preview narrowed, collapsed, then off the page), the panes before it narrow
    expect(look(resize(row, "editor", 600, []).layout)).toBe("modules500 calendar400 editor1100 preview-");
    const shrunk = resize(grown.layout, "editor", -300, grown.records);
    expect([look(shrunk.layout), shrunk.records]).toEqual([look(row), []]);
  });
  it("fits a row wider than the window: the first open pane keeps its width, the rest give way from the right", () => {
    expect(look(makeRoom({ ...row, free: -150 }, ["modules"], 0).layout)).toBe("modules500 calendar400 editor450 preview500");
  });
});

describe("a resize square", () => {
  it("right half: the pane after the bar, past its narrowest and its widest", () => {
    expect(look(squareDrag(row, 1, 300, "calendar").layout)).toBe("modules800 calendar200 editor500 preview500");
    const modulesFree = { ...row, slabs: row.slabs.map((s) => (s.id === "modules" ? { ...s, minWidth: 100 } : s)) };
    expect(look(squareDrag(modulesFree, 1, -400, "calendar").layout)).toBe("modules100 calendar900 editor500 preview500");
  });
  it("the panes giving way go down to their bars, each collapsing there before the next narrows, and their narrowest follows", () => {
    const squeezed = squareDrag(row, 1, 480, "calendar");
    expect(look(squeezed.layout)).toBe("modules980 calendar_ editor500 preview500");
    expect(look(squareDrag(row, 1, 680, "calendar").layout)).toBe("modules1180 calendar_ editor300 preview500");
    expect(squareDrag(row, 1, 680, "calendar").limits).toEqual({ editor: { min: 300 } });
    // collapsed, it is undone as any cascade is: reopened, then widened back
    expect(kinds(squeezed.effects)).toEqual(["narrow calendar", "collapse calendar"]);
    expect(look(restore({ ...squeezed.layout, free: 480 }, squeezed.effects).layout)).toBe("modules980 calendar500 editor500 preview500");
  });
  it("left half: the pane before the bar, past its narrowest and its widest", () => {
    const capped = { ...row, slabs: row.slabs.map((s) => ({ ...s, maxWidth: 600 })) };
    expect(look(squareDrag(capped, 1, -300, "modules").layout)).toBe("modules200 calendar600 editor600 preview600");
    expect(look(squareDrag(capped, 1, 300, "modules").layout)).toBe("modules800 calendar200 editor500 preview500");
    expect(squareDrag(capped, 1, 300, "modules").limits).toEqual({ modules: { max: 800 }, calendar: { min: 200 } });
  });
  it("moves only the limit the drag crossed, to where the pane ended", () => {
    expect(limitsAfter({ minWidth: 400, maxWidth: 800 }, 300)).toEqual({ min: 300 });
    expect(limitsAfter({ minWidth: 400, maxWidth: 800 }, 900)).toEqual({ max: 900 });
    expect(limitsAfter({ minWidth: 400, maxWidth: 800 }, 600)).toEqual({});
  });
});
