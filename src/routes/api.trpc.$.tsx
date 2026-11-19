import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { trpcAppRouter } from "@/services/serverFunctions/appRouter";
import { createTrpcContext } from "@/services/serverFunctions/context";
import { logError } from "@/features/local/errorLog/errorLogStore";

const handler = async (request: Request) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: trpcAppRouter,
    createContext: createTrpcContext,
    onError({ error, path, input }) {
      console.error(
        `[tRPC ${error.code}] ${path ?? "unknown"} | input: ${JSON.stringify(input)} | ${error.message}`,
      );
      // a file that is gone is not an error (see isNotFound)
      if (!path?.startsWith("errorLog.") && error.code !== "NOT_FOUND")
        logError({ source: `Server request ${path ?? ""}`, message: error.message });
    },
  });
};

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
});
