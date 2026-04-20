// src/main/ipc/playlists.ts
import { ipcMain } from 'electron'
import { getApi, getItemsApi } from '../lib/jellyfin'
import { store } from '../lib/store'

// BaseItemKind enum contains the 'Playlist' value used to filter playlist items.
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'

export function registerPlaylistHandlers(): void {
  // sync:getPlaylists
  // LIB-01: Returns all playlists with track count for the authenticated user.
  // D-API-PAGINATION: Paginates with limit=500 startIndex loop.
  // T-02-02-05: Guards against unauthenticated calls.
  ipcMain.handle(
    'sync:getPlaylists',
    async (): Promise<Array<{ id: string; name: string; trackCount: number }>> => {
      const api = getApi()
      if (!api) throw new Error('Not authenticated. Please log in first.')

      const userId = store.get('userId')
      if (!userId) throw new Error('User ID not found. Please log in again.')

      const PAGE_SIZE = 500
      const results: Array<{ id: string; name: string; trackCount: number }> = []
      let startIndex = 0

      while (true) {
        const resp = await getItemsApi(api).getItems({
          userId,
          includeItemTypes: [BaseItemKind.Playlist],
          recursive: true,
          startIndex,
          limit: PAGE_SIZE,
          sortBy: ['SortName'],
          sortOrder: ['Ascending'],
          // Request ChildCount explicitly to ensure it is populated in the response
          fields: ['ChildCount'],
        })

        const items = resp.data.Items ?? []

        for (const item of items) {
          if (!item.Id) continue  // WR-01: skip malformed items with no ID
          results.push({
            id: item.Id,
            name: item.Name ?? '(Unnamed)',
            // ChildCount is the direct child count for playlist items.
            // If ChildCount returns 0 when RecursiveItemCount is correct, swap here.
            trackCount: item.ChildCount ?? item.RecursiveItemCount ?? 0,
          })
        }

        // D-API-PAGINATION (Pitfall 4): terminate on empty page, not items.length < PAGE_SIZE.
        // Private playlists cause Jellyfin to return fewer items per page than PAGE_SIZE
        // even when more pages exist.
        if (items.length === 0) break
        startIndex += PAGE_SIZE
      }

      return results
    }
  )
}
