import { CanvasModuleItem } from "@/features/canvas/models/modules/canvasModuleItems";
import { canvasApi, paginatedRequest } from "./canvasServiceUtils";
import { CanvasModule } from "@/features/canvas/models/modules/canvasModule";
import { axiosClient } from "@/services/axiosUtils";
import { rateLimitAwareDelete, rateLimitAwarePost } from "./canvasWebRequestUtils";

/** A Canvas item to put in a module; a page is added by its url. */
export interface ModuleItemContent {
  type: "Assignment" | "Discussion" | "Quiz" | "Page";
  id: number;
  title: string;
  pageUrl?: string;
}

/** The names of the Canvas modules that hold an item; a page is matched by its url. */
export function canvasModuleNames(
  modules: CanvasModule[],
  type: "assignment" | "quiz" | "page",
  canvasItem: { id?: number; url?: string; discussion_topic?: { id: number } },
): string[] {
  const holds = (i: CanvasModuleItem) =>
    type === "page"
      ? i.type === "Page" && i.page_url === canvasItem.url
      : type === "quiz"
        ? i.type === "Quiz" && i.content_id === canvasItem.id
        : i.type === "Discussion"
          ? i.content_id === canvasItem.discussion_topic?.id
          : i.type === "Assignment" && i.content_id === canvasItem.id;
  return modules.filter((m) => m.items?.some(holds)).map((m) => m.name);
}

/**
 * What a module holds for an assignment: Canvas files a graded discussion as
 * its discussion, not its assignment.
 */
export const assignmentModuleItem = (canvasAssignment: {
  id: number;
  name: string;
  discussion_topic?: { id: number };
}): ModuleItemContent =>
  canvasAssignment.discussion_topic
    ? {
        type: "Discussion",
        id: canvasAssignment.discussion_topic.id,
        title: canvasAssignment.name,
      }
    : {
        type: "Assignment",
        id: canvasAssignment.id,
        title: canvasAssignment.name,
      };

export const canvasModuleService = {
  async updateModuleItem(
    canvasCourseId: number,
    canvasModuleId: number,
    item: CanvasModuleItem
  ) {
    console.log(`Updating module item ${item.title}`);
    const url = `${canvasApi}/courses/${canvasCourseId}/modules/${canvasModuleId}/items/${item.id}`;
    const body = {
      module_item: { title: item.title, position: item.position },
    };
    const { data } = await axiosClient.put<CanvasModuleItem>(url, body);

    if (!data) throw new Error("Something went wrong updating module item");
  },

  async getModuleWithItems(canvasCourseId: number, moduleId: number) {
    const url = `${canvasApi}/courses/${canvasCourseId}/modules/${moduleId}`;
    const params = { include: ["items"] };
    const response = await axiosClient.get<CanvasModule>(url, { params });
    return response.data;
  },

  /** Adds an item at `position` (1-based), or at the end without one. */
  async addModuleItem(
    canvasCourseId: number,
    canvasModuleId: number,
    item: ModuleItemContent,
    position?: number
  ) {
    await rateLimitAwarePost<CanvasModuleItem>(
      `${canvasApi}/courses/${canvasCourseId}/modules/${canvasModuleId}/items`,
      {
        module_item: {
          ...(item.type === "Page"
            ? { title: item.title, type: "Page", page_url: item.pageUrl }
            : { title: item.title, type: item.type, content_id: item.id }),
          ...(position !== undefined && { position }),
        },
      }
    );
  },

  /**
   * Makes a module the only one holding an item: keeps or moves one copy into
   * it (adding one when the item is in no module) and removes every other.
   */
  async placeInModule(
    canvasCourseId: number,
    canvasModuleId: number,
    item: ModuleItemContent,
    /** where to add or move it (1-based), asked only when it is added or moved */
    position: () => Promise<number | undefined> = async () => undefined
  ): Promise<{ placed: "already" | "moved" | "added"; removed: number }> {
    const { data } = await axiosClient.get<{
      items: { current?: { id: number; module_id: number } }[];
    }>(`${canvasApi}/courses/${canvasCourseId}/module_item_sequence`, {
      params: { asset_type: item.type, asset_id: item.id },
    });
    const placements = data.items.flatMap((i) => (i.current ? [i.current] : []));
    const itemUrl = (p: { id: number; module_id: number }) =>
      `${canvasApi}/courses/${canvasCourseId}/modules/${p.module_id}/items/${p.id}`;

    const kept =
      placements.find((p) => p.module_id === canvasModuleId) ?? placements[0];
    const extras = placements.filter((p) => p !== kept);
    for (const extra of extras) await rateLimitAwareDelete(itemUrl(extra));

    if (!kept) {
      await canvasModuleService.addModuleItem(canvasCourseId, canvasModuleId, item, await position());
      return { placed: "added", removed: 0 };
    }
    if (kept.module_id === canvasModuleId)
      return { placed: "already", removed: extras.length };
    const at = await position();
    await axiosClient.put(itemUrl(kept), {
      module_item: {
        module_id: canvasModuleId,
        ...(at !== undefined && { position: at }),
      },
    });
    return { placed: "moved", removed: extras.length };
  },

  async getCourseModules(canvasCourseId: number) {
    const url = `${canvasApi}/courses/${canvasCourseId}/modules`;
    const response = await paginatedRequest<CanvasModule[]>({ url });
    return response;
  },

  /** Every module with its items; Canvas leaves the items out of a large module, so those are fetched on their own. */
  async getCourseModulesWithItems(canvasCourseId: number) {
    const modules = await paginatedRequest<CanvasModule[]>({
      url: `${canvasApi}/courses/${canvasCourseId}/modules?include[]=items`,
    });
    return Promise.all(
      modules.map(async (m) =>
        m.items
          ? m
          : {
              ...m,
              items: await paginatedRequest<CanvasModuleItem[]>({
                url: `${canvasApi}/courses/${canvasCourseId}/modules/${m.id}/items`,
              }),
            }
      )
    );
  },

  async createModule(canvasCourseId: number, moduleName: string) {
    const url = `${canvasApi}/courses/${canvasCourseId}/modules`;
    const body = {
      module: {
        name: moduleName,
      },
    };
    const response = await rateLimitAwarePost<CanvasModule>(url, body);
    return response.data.id;
  },

  async reorderModuleItems(
    canvasCourseId: number,
    canvasModuleId: number,
    itemIds: number[]
  ) {
    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const url = `${canvasApi}/courses/${canvasCourseId}/modules/${canvasModuleId}/items/${itemId}`;
      const body = {
        module_item: {
          position: i + 1,
        },
      };
      await axiosClient.put(url, body);
    }
  },
};
