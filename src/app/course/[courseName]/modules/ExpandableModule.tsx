"use client";
import { useEffect } from "react";
import { usePagesQueries } from "@/features/local/pages/pageHooks";
import { IModuleItem } from "@/features/local/modules/IModuleItem";
import {
  getDateFromStringOrThrow,
  getDateOnlyMarkdownString,
} from "@/features/local/utils/timeUtils";
import { useLocalCourseSettingsQuery } from "@/features/local/course/localCoursesHooks";
import { getWeekNumber } from "../calendar/calendarMonthUtils";
import Modal, { useModal } from "../../../../components/Modal";
import NewItemForm from "./NewItemForm";
import { ModuleCanvasStatus } from "./ModuleCanvasStatus";
import ClientOnly from "@/components/ClientOnly";
import { useDraggingContext } from "../context/drag/draggingContext";
import { Link } from "@tanstack/react-router";
import { getLectureUrl, getModuleItemUrl } from "@/services/urlUtils";
import { useCourseContext } from "../context/courseContext";
import { Expandable } from "../../../../components/Expandable";
import { SectionTitle } from "@/components/panes/PaneHeader";
import { useQuizzesQueries } from "@/features/local/quizzes/quizHooks";
import { useAssignmentsQueries } from "@/features/local/assignments/assignmentHooks";
import { useReorderCanvasModuleItemsMutation } from "@/features/canvas/hooks/canvasModuleHooks";
import {
  useCanvasModulesQuery,
  useCanvasModulesWithItemsQuery,
} from "@/features/canvas/hooks/canvasModuleHooks";
import {
  byOrderingDate,
  canvasOrderDiffers,
} from "@/features/local/modules/moduleItemOrder";
import { Spinner } from "@/components/Spinner";
import { ItemTypeIcon } from "../ItemTypeIcon";
import { useInvalidItemsQuery } from "@/features/local/modules/rawItemHooks";
import { ItemInDay } from "../calendar/day/itemInDay/ItemInDay";
import { useItemSyncStatus } from "../calendar/day/useItemSyncStatus";
import { useModuleSelection } from "./bulk/moduleSelection";
import { kindsOf, shown, showsErrors } from "./bulk/rules";

export default function ExpandableModule({
  moduleName,
}: {
  moduleName: string;
}) {
  const { itemDropOnModule } = useDraggingContext();
  const { courseName } = useCourseContext();
  const { data: assignments } = useAssignmentsQueries(moduleName);
  const { data: quizzes } = useQuizzesQueries(moduleName);
  const { data: pages } = usePagesQueries(moduleName);
  const modal = useModal();
  const reorderMutation = useReorderCanvasModuleItemsMutation();
  const { data: canvasModules } = useCanvasModulesQuery();
  const { data: canvasModulesWithItems } = useCanvasModulesWithItemsQuery();
  const { data: invalidItems } = useInvalidItemsQuery(moduleName);
  const { statusOf, ready } = useItemSyncStatus();
  const selection = useModuleSelection();

  const moduleItems: {
    type: "assignment" | "quiz" | "page";
    item: IModuleItem;
  }[] = (assignments ?? [])
    .map(
      (
        a,
      ): {
        type: "assignment" | "quiz" | "page";
        item: IModuleItem;
      } => ({
        type: "assignment",
        item: a,
      }),
    )
    .concat(quizzes.map((q) => ({ type: "quiz", item: q })))
    .concat(pages.map((p) => ({ type: "page", item: p })))
    .sort((a, b) => byOrderingDate(a.item, b.item));

  const canvasModuleItems = canvasModulesWithItems?.find(
    (m) => m.name === moduleName,
  )?.items;
  const canvasOutOfOrder =
    !!canvasModuleItems &&
    canvasOrderDiffers(
      moduleItems.map((i) => i.item),
      [...canvasModuleItems]
        .sort((a, b) => a.position - b.position)
        .map((i) => i.title),
    );

  const { data: settings } = useLocalCourseSettingsQuery();
  const startDate = getDateFromStringOrThrow(
    settings.startDate,
    "expandable module week grouping",
  );

  // the pane's search: a module whose name has it shows everything, another
  // only the items whose name has it; one with nothing to show is hidden
  const query = selection.search.trim().toLowerCase();
  const has = (name: string) => name.toLowerCase().includes(query);
  const searched = !query || has(moduleName) ? moduleItems : moduleItems.filter((i) => has(i.item.name));
  // what the bar's filters let through (everything with none on); a module
  // with nothing to show is hidden
  const shownItems = searched.filter(({ type, item }) =>
    shown(kindsOf(statusOf(type, item, moduleName)), selection.filters),
  );
  const shownRefs = shownItems.map(({ type, item }) => ({ type, item, moduleName }));
  // nothing is counted until Canvas has answered, so no count changes later
  const itemKinds = ready
    ? [
        ...moduleItems.flatMap(({ type, item }) => kindsOf(statusOf(type, item, moduleName))),
        ...(invalidItems ?? []).map(() => "withErrors" as const),
      ]
    : [];
  // files that can't be read, plus ones with dates Canvas won't save
  const errorCount = ready
    ? (invalidItems?.length ?? 0) +
      moduleItems.filter(({ type, item }) => statusOf(type, item, moduleName).problem).length
    : 0;
  const { report } = selection;
  const reported = shownRefs.map((r) => r.type + r.item.name).join("\n") + itemKinds.join(",");
  useEffect(() => {
    if (!ready) return;
    report(moduleName, shownRefs, itemKinds);
    // the refs change whenever reported does
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, moduleName, reported, ready]);

  const groupedItems = shownItems.reduce(
    (
      groups: {
        dateKey: string;
        weekLabel: string;
        items: { type: "assignment" | "quiz" | "page"; item: IModuleItem }[];
      }[],
      moduleItem,
    ) => {
      const date = getDateFromStringOrThrow(
        moduleItem.item.dueAt,
        "expandable module item grouping",
      );
      const dateKey = getDateOnlyMarkdownString(date);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.dateKey === dateKey) {
        return [
          ...groups.slice(0, -1),
          { ...lastGroup, items: [...lastGroup.items, moduleItem] },
        ];
      }
      const weekNum = getWeekNumber(startDate, date);
      // the date too, so a day is found without counting weeks: "Week 3 - Mon Sep 8"
      const day = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
      return [
        ...groups,
        {
          dateKey,
          weekLabel: `Week ${weekNum} - ${day}`,
          items: [moduleItem],
        },
      ];
    },
    [],
  );

  const shownInvalid = (showsErrors(selection.filters) ? (invalidItems ?? []) : []).filter(
    (i) => !query || has(moduleName) || has(i.name),
  );
  if ((selection.filters.length > 0 || query) && shownItems.length === 0 && shownInvalid.length === 0)
    return null;

  return (
    <div
      className="border-b border-slate-800"
      onDrop={(e) => itemDropOnModule(e, moduleName)}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="draggingModule">
        <div>
          <Expandable
            storageKey={`moduleExpanded-${courseName}-${moduleName}`}
            request={selection.request}
            forceOpen={!!query}
            ExpandableElement={({ setIsExpanded, isExpanded }) => (
              <SectionTitle
                title={moduleName}
                open={isExpanded}
                onClick={() => setIsExpanded((e) => !e)}
              >
                {errorCount > 0 && (
                  <span
                    className="rounded-full bg-rose-900 px-2 text-xs text-rose-100"
                    title={`${errorCount} file${errorCount === 1 ? "" : "s"} in this module can't be read or sent to Canvas`}
                  >
                    ⚠ {errorCount}
                  </span>
                )}
                <ClientOnly>
                  <ModuleCanvasStatus moduleName={moduleName} />
                </ClientOnly>
              </SectionTitle>
            )}
          >
            <div className="pb-3 ps-5 space-y-2 text-slate-300">
              {!reorderMutation.isPending && (
                <button
                  className={" me-3 " + (canvasOutOfOrder ? " text-amber-300! " : "")}
                  title={
                    canvasOutOfOrder
                      ? "Canvas lists this module's items in a different order"
                      : undefined
                  }
                  onClick={() => {
                    const canvasModuleId = canvasModules?.find(
                      (m) => m.name === moduleName,
                    )?.id;
                    if (!canvasModuleId) {
                      console.error(
                        "Canvas module ID not found for",
                        moduleName,
                      );
                      return;
                    }
                    reorderMutation.mutate({
                      moduleId: canvasModuleId,
                      items: moduleItems.map((item) => item.item),
                    });
                  }}
                >
                  {canvasOutOfOrder ? "Sort in Canvas (order differs)" : "Sort by Date"}
                </button>
              )}
              {reorderMutation.isPending && <Spinner />}
              <Modal
                modalControl={modal}
                buttonText="New Item"
                modalWidth="w-135"
              >
                {({ closeModal }) => (
                  <div>
                    <NewItemForm
                      moduleName={moduleName}
                      onCreate={closeModal}
                    />
                    <br />
                    <button onClick={closeModal}>close</button>
                  </div>
                )}
              </Modal>
              <div className="flex flex-col">
                {shownInvalid.length > 0 && (
                  <div>
                    <div className="text-rose-400 text-sm mt-1 ps-1">
                      Can&rsquo;t be read, click to fix
                    </div>
                    {shownInvalid.map((invalid) => (
                      <div
                        key={invalid.type + invalid.name}
                        className="flex items-start ps-3"
                        title={invalid.error}
                      >
                        <div className="w-6 p-1 flex-none">
                          <ItemTypeIcon type={invalid.type.toLowerCase()} />
                        </div>
                        <Link
                          to={getModuleItemUrl(
                            courseName,
                            moduleName,
                            invalid.type === "Assignment"
                              ? "assignment"
                              : invalid.type === "Quiz"
                                ? "quiz"
                                : "page",
                            invalid.name,
                          )}
                          className="ps-1 text-rose-300 underline decoration-wavy decoration-rose-600 hover:text-rose-100"
                        >
                          {invalid.name}
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
                {groupedItems.map(({ dateKey, weekLabel, items }) => (
                  <div key={weekLabel}>
                    {/* the day's heading opens that day's lecture notes */}
                    <Link
                      to={getLectureUrl(courseName, dateKey)}
                      className="block text-slate-500 text-sm mt-1 ps-1 hover:text-slate-200 hover:underline"
                      title={`Open the lecture notes for ${weekLabel.split(" - ")[1]}`}
                    >
                      {weekLabel}
                    </Link>
                    {items.map(({ type, item }) => {
                      const status = statusOf(type, item, moduleName);
                      const ref = { type, item, moduleName };
                      return (
                        <div
                          key={item.name + type}
                          className="flex items-start"
                          // a checked item's right-click acts on every checked item
                          onContextMenuCapture={(e) => {
                            if (!selection.isSelected(ref)) return;
                            e.preventDefault();
                            e.stopPropagation();
                            selection.openMenu({ x: e.clientX, y: e.clientY });
                          }}
                        >
                          <input
                            type="checkbox"
                            className="mt-1.5 me-1 flex-none"
                            aria-label={`Select ${item.name}`}
                            checked={selection.isSelected(ref)}
                            onChange={() => selection.toggle(ref)}
                          />
                          <div className="flex-1 min-w-0">
                            <ItemInDay
                              type={type}
                              item={item}
                              moduleName={moduleName}
                              {...status}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </Expandable>
        </div>
      </div>
    </div>
  );
}
