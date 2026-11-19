import {
  InvalidateQueryFilters,
  InvalidateOptions,
  MutationCache,
  QueryCache,
  QueryClient,
  QueryKey,
  SetDataOptions,
  isServer,
} from "@tanstack/react-query";
import {
  describeQueryKey,
  reportBrowserError,
} from "@/features/local/errorLog/reportBrowserError";
import { fileMissingEvent, getErrorMessage, isNotFound } from "@/services/utils/queryClient";

/**
 * Every window of the app sees what any window learned: a save or a change
 * to Canvas made in a pop-out reaches the window it came from at once, and
 * the other way round, instead of waiting for that window to be focused.
 * A refresh travels as its query key (each window fetches for itself); what a
 * window wrote into its cache, Canvas's answer after a change, travels as the
 * data, so no window downloads it again.
 */
type CacheChange = { invalidate: QueryKey } | { set: QueryKey; data: unknown };
function shareCacheChanges(client: QueryClient) {
  const invalidate = client.invalidateQueries.bind(client);
  // the data's type is the caller's business; here it only travels
  type SetData = (queryKey: QueryKey, updater: unknown, options?: SetDataOptions) => unknown;
  const set = client.setQueryData.bind(client) as SetData;
  const channel = new BroadcastChannel("canvas-management-invalidations");
  // from another window: apply here with the unwrapped functions, so the others aren't told again
  channel.onmessage = ({ data: change }: MessageEvent<CacheChange>) => {
    if ("set" in change) set(change.set, change.data);
    else if ("invalidate" in change) invalidate({ queryKey: change.invalidate });
  };
  client.invalidateQueries = (filters?: InvalidateQueryFilters, options?: InvalidateOptions) => {
    if (filters?.queryKey) channel.postMessage({ invalidate: filters.queryKey } satisfies CacheChange);
    return invalidate(filters, options);
  };
  const share: SetData = (queryKey, updater, options) => {
    const data = set(queryKey, updater, options);
    if (data !== undefined) channel.postMessage({ set: queryKey, data } satisfies CacheChange);
    return data;
  };
  client.setQueryData = share as typeof client.setQueryData;
}

function makeQueryClient() {
  const client = new QueryClient({
    // every failed request lands in the error log, handled or not
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isNotFound(error)) window.dispatchEvent(new Event(fileMissingEvent));
        else reportBrowserError(describeQueryKey(query.queryKey), getErrorMessage(error));
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        reportBrowserError(
          describeQueryKey(mutation.options.mutationKey),
          getErrorMessage(error),
        ),
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
      mutations: {
        onError: (error) => {
          console.error("Unhandled mutation error:", error);
        },
      },
    },
  });
  // Canvas is asked about once an hour. Nothing tells the app when Canvas
  // changes, and if the app didn't change it, it almost never did; when the
  // app does change it, the mutation writes Canvas's answer into the cache
  // (features/canvas/hooks), and Reload Canvas Data asks at once. Local
  // files need none of this: the server watches them and says when one
  // changes. Every Canvas query key starts with "canvas", so this is all of them.
  client.setQueryDefaults(["canvas"], { staleTime: 60 * 60 * 1000 });
  if (!isServer) shareCacheChanges(client);
  return client;
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}
