import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./authRouter";
import { nominateRouter } from "./nominateRouter";
import { publicRouter } from "./publicRouter";
import { gameRouter } from "./gameRouter";
import { controlRouter } from "./controlRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  nominate: nominateRouter,
  public: publicRouter,
  game: gameRouter,
  control: controlRouter,
});

export type AppRouter = typeof appRouter;
