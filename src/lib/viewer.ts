import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { trpc } from "@/providers/trpc";

export function useViewer() {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      utils.auth.me.setData(undefined, null);
      await Promise.all([utils.nominate.mine.cancel(), utils.game.state.cancel()]);
      queryClient.removeQueries({ queryKey: getQueryKey(trpc.nominate.mine) });
      queryClient.removeQueries({ queryKey: getQueryKey(trpc.game.state) });
      await Promise.all([utils.auth.me.invalidate(), utils.auth.bootstrap.invalidate()]);
    },
  });
  return { viewer: me.data, isLoading: me.isLoading, logout: () => logout.mutate() };
}
