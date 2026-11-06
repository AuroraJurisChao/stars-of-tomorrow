import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { log } from "./lib/logger";
import { assertSafeOrigin } from "./auth";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    if (error.code === "INTERNAL_SERVER_ERROR") {
      log.error("trpc procedure failed", {
        path: shape.data?.path,
        code: error.code,
        error: error.message,
        stack: error.stack,
      });
    }
    return shape;
  },
});

const originChecked = t.middleware(async ({ ctx, next, type }) => {
  if (type === "mutation") assertSafeOrigin(ctx);
  return next();
});

export const createRouter = t.router;
export const publicQuery = t.procedure;
export const publicMutation = t.procedure.use(originChecked);
