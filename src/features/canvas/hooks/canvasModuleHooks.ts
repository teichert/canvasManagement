import { useLocalCourseSettingsQuery } from "@/features/local/course/localCoursesHooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  canvasModuleService,
  canvasModuleNames,
  ModuleItemContent,
} from "../services/canvasModuleService";
import { IModuleItem } from "@/features/local/modules/IModuleItem";
import toast from "react-hot-toast";
import { byOrderingDate, positionInModule } from "@/features/local/modules/moduleItemOrder";
import { useTRPC } from "@/services/serverFunctions/trpcClient";
import { useCourseContext } from "@/app/course/[courseName]/context/courseContext";
import { useMemo } from "react";

export const canvasCourseModuleKeys = {
  modules: (canvasId: number) => ["canvas", canvasId, "module list"] as const,
};

export const useCanvasModulesQuery = () => {
  const { data: settings } = useLocalCourseSettingsQuery();
  return useQuery({
    queryKey: canvasCourseModuleKeys.modules(settings.canvasId),
    queryFn: async () =>
      await canvasModuleService.getCourseModules(settings.canvasId),
  });
};

/** Every Canvas module with its items, for finding which modules hold an item. */
export const useCanvasModulesWithItemsQuery = () => {
  const { data: settings } = useLocalCourseSettingsQuery();
  return useQuery({
    // under the module list's key, so whatever refreshes the list refreshes this
    queryKey: [...canvasCourseModuleKeys.modules(settings.canvasId), "items"],
    queryFn: () =>
      canvasModuleService.getCourseModulesWithItems(settings.canvasId),
  });
};

/**
 * For comparing an item's module: the names of the Canvas modules holding it,
 * undefined while they load or when the item isn't in Canvas.
 */
export const useCanvasModuleNames = (
  type: Parameters<typeof canvasModuleNames>[1],
  canvasItem: Parameters<typeof canvasModuleNames>[2] | undefined
) => {
  const { data: modules, refetch } = useCanvasModulesWithItemsQuery();
  const names = useMemo(
    () => modules && canvasItem && canvasModuleNames(modules, type, canvasItem),
    [modules, type, canvasItem]
  );
  return { names, refetch };
};

export const useAddCanvasModuleMutation = () => {
  const { data: settings } = useLocalCourseSettingsQuery();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (moduleName: string) =>
      await canvasModuleService.createModule(settings.canvasId, moduleName),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: canvasCourseModuleKeys.modules(settings.canvasId),
      });
    },
  });
};

/**
 * Finds a Canvas module's id by name, creating the module if Canvas has none.
 * Loads the module list first (not just whatever is cached), so a missing
 * module isn't created twice.
 */
export const useCanvasModuleIdByName = () => {
  const { data: settings } = useLocalCourseSettingsQuery();
  const queryClient = useQueryClient();
  const addModule = useAddCanvasModuleMutation();
  return async (moduleName: string) => {
    const modules = await queryClient.ensureQueryData({
      queryKey: canvasCourseModuleKeys.modules(settings.canvasId),
      queryFn: () => canvasModuleService.getCourseModules(settings.canvasId),
    });
    return (
      modules.find((m) => m.name === moduleName)?.id ??
      (await addModule.mutateAsync(moduleName))
    );
  };
};

/**
 * Where an item goes in its Canvas module, by date among the module's files
 * (see positionInModule), or undefined for the end.
 */
const usePositionInCanvasModule = () => {
  const { courseName } = useCourseContext();
  const { data: settings } = useLocalCourseSettingsQuery();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  return async (moduleName: string, moduleId: number, title: string) => {
    const input = { courseName, moduleName };
    const [assignments, quizzes, pages, canvasModule] = await Promise.all([
      queryClient.ensureQueryData(trpc.assignment.getAllAssignments.queryOptions(input)),
      queryClient.ensureQueryData(trpc.quiz.getAllQuizzes.queryOptions(input)),
      queryClient.ensureQueryData(trpc.page.getAllPages.queryOptions(input)),
      canvasModuleService.getModuleWithItems(settings.canvasId, moduleId),
    ]);
    const canvasTitles = [...(canvasModule.items ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i) => i.title)
      .filter((t) => t !== title);
    return positionInModule(title, [...assignments, ...quizzes, ...pages], canvasTitles);
  };
};

/** For Add to Canvas: adds a new item to the module named after its folder, in date order. */
export const useAddToCanvasModule = () => {
  const { data: settings } = useLocalCourseSettingsQuery();
  const queryClient = useQueryClient();
  const moduleIdByName = useCanvasModuleIdByName();
  const positionIn = usePositionInCanvasModule();
  return async (moduleName: string, item: ModuleItemContent) => {
    const moduleId = await moduleIdByName(moduleName);
    await canvasModuleService.addModuleItem(
      settings.canvasId,
      moduleId,
      item,
      await positionIn(moduleName, moduleId, item.title)
    );
    queryClient.invalidateQueries({
      queryKey: canvasCourseModuleKeys.modules(settings.canvasId),
    });
  };
};

/**
 * For Update in Canvas: makes the Canvas module named after an item's folder
 * the only one holding it, so moving a file to another module moves it in
 * Canvas too.
 */
export const usePlaceInCanvasModule = () => {
  const { data: settings } = useLocalCourseSettingsQuery();
  const queryClient = useQueryClient();
  const moduleIdByName = useCanvasModuleIdByName();
  const positionIn = usePositionInCanvasModule();
  return async (moduleName: string, item: ModuleItemContent) => {
    const moduleId = await moduleIdByName(moduleName);
    const { placed, removed } = await canvasModuleService.placeInModule(
      settings.canvasId,
      moduleId,
      item,
      // read only when it's added or moved here
      () => positionIn(moduleName, moduleId, item.title)
    );
    const changes = [
      placed === "moved" && `moved it to the "${moduleName}" module`,
      placed === "added" && `added it to the "${moduleName}" module`,
      removed > 0 &&
        `removed it from ${removed} other module${removed === 1 ? "" : "s"}`,
    ].filter(Boolean);
    if (changes.length > 0) {
      toast.success(`In Canvas, ${changes.join(" and ")}: "${item.title}".`);
      queryClient.invalidateQueries({
        queryKey: canvasCourseModuleKeys.modules(settings.canvasId),
      });
    }
  };
};

export const useReorderCanvasModuleItemsMutation = () => {
  const { data: settings } = useLocalCourseSettingsQuery();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      moduleId,
      items,
    }: {
      moduleId: number;
      items: IModuleItem[];
    }) => {
      if (!settings?.canvasId) throw new Error("No canvasId in settings");

      const canvasModule = await canvasModuleService.getModuleWithItems(
        settings.canvasId,
        moduleId
      );
      if (!canvasModule.items) {
        throw new Error(
          "cannot sort canvas module items, no items found in module"
        );
      }
      const canvasItems = canvasModule.items;

      const sorted = [...items].sort(byOrderingDate);

      // Map sorted IModuleItems to CanvasModuleItem ids by matching name/title
      const orderedIds = sorted
        .map((localItem) => canvasItems.find((canvasItem) => canvasItem.title === localItem.name)?.id)
        .filter((id): id is number => typeof id === "number");

      return await canvasModuleService.reorderModuleItems(
        settings.canvasId,
        moduleId,
        orderedIds
      );
    },
    onSuccess: (_data) => {
      if (!settings?.canvasId) return;
      queryClient.invalidateQueries({
        queryKey: canvasCourseModuleKeys.modules(settings.canvasId),
      });
    },
  });
};
