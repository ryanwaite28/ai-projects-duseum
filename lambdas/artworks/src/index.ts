// =============================================================================
// lambdas/artworks/src/index.ts
// artworks-lambda entry point — Section 4.2, 6.3
//
// Routes (plain TypeScript dispatcher — no Express, no Hono):
//
// Artwork routes:
//   GET    /artworks                                → listArtworks    (public)
//   GET    /artworks/{artworkId}                    → getArtwork      (public, optional JWT)
//   POST   /artworks                               → createArtwork   (Author only)
//   PUT    /artworks/{artworkId}                    → updateArtwork   (Author only)
//   DELETE /artworks/{artworkId}                    → deleteArtwork   (Author only)
//
// Collection routes (§4.2 — collections assigned to artworks-lambda):
//   POST   /collections                             → createCollection  (Author only)
//   GET    /collections/{collectionId}              → getCollection     (public, optional JWT)
//   PUT    /collections/{collectionId}              → updateCollection  (Author only)
//   DELETE /collections/{collectionId}              → deleteCollection  (Author only)
//   POST   /collections/{collectionId}/pieces       → addCollectionPiece
//   DELETE /collections/{collectionId}/pieces/{id} → removeCollectionPiece
//   GET    /collections/{collectionId}/pieces       → listCollectionPieces  (owner / JWT)
//   GET    /authors/{authorId}/collections          → listAuthorCollections (public)
// =============================================================================

import middy from '@middy/core'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  NotFoundError,
  cognitoAuthMiddleware,
  errorHandlerMiddleware,
  loggerMiddleware,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'
import { listArtworks }             from './routes/list-artworks.js'
import { getArtwork }               from './routes/get-artwork.js'
import { createArtwork }            from './routes/create-artwork.js'
import { updateArtwork }            from './routes/update-artwork.js'
import { deleteArtwork }            from './routes/delete-artwork.js'
import { createCollectionRoute }    from './routes/create-collection.js'
import { getCollectionRoute }       from './routes/get-collection.js'
import { updateCollectionRoute }    from './routes/update-collection.js'
import { deleteCollectionRoute }    from './routes/delete-collection.js'
import { addCollectionPieceRoute }  from './routes/add-collection-piece.js'
import { removeCollectionPieceRoute } from './routes/remove-collection-piece.js'
import { listCollectionPiecesRoute }   from './routes/list-collection-pieces.js'
import { listAuthorCollectionsRoute }  from './routes/list-author-collections.js'

const dispatch = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { method, path } = event.requestContext.http

  // Parse path segments to drive routing without a framework
  const segments = path.split('/').filter(Boolean)
  const [seg0, seg1, seg2, seg3] = segments

  // ── /artworks/* ─────────────────────────────────────────────────────────────
  if (seg0 === 'artworks') {
    const artworkId = seg1
    if (method === 'GET'    && !artworkId) return listArtworks(event, context)
    if (method === 'GET'    && artworkId)  return getArtwork(event, context, artworkId)
    if (method === 'POST'   && !artworkId) return createArtwork(event, context)
    if (method === 'PUT'    && artworkId)  return updateArtwork(event, context, artworkId)
    if (method === 'DELETE' && artworkId)  return deleteArtwork(event, context, artworkId)
  }

  // ── /collections/* ───────────────────────────────────────────────────────────
  if (seg0 === 'collections') {
    const collectionId = seg1

    if (method === 'POST'   && !collectionId)       return createCollectionRoute(event, context)
    if (method === 'GET'    && collectionId && !seg2) return getCollectionRoute(event, context, collectionId)
    if (method === 'PUT'    && collectionId && !seg2) return updateCollectionRoute(event, context, collectionId)
    if (method === 'DELETE' && collectionId && !seg2) return deleteCollectionRoute(event, context, collectionId)

    // /collections/{collectionId}/pieces[/{artworkId}]
    if (seg2 === 'pieces') {
      const artworkId = seg3
      if (method === 'GET'    && !artworkId) return listCollectionPiecesRoute(event, context, collectionId!)
      if (method === 'POST'   && !artworkId) return addCollectionPieceRoute(event, context, collectionId!)
      if (method === 'DELETE' && artworkId)  return removeCollectionPieceRoute(event, context, collectionId!, artworkId)
    }
  }

  // ── /authors/{authorId}/collections ─────────────────────────────────────────
  if (seg0 === 'authors' && seg1 && seg2 === 'collections') {
    if (method === 'GET') return listAuthorCollectionsRoute(event, context, seg1)
  }

  throw new NotFoundError(`Route not found: ${method} ${path}`)
}

export const handler = middy<
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Error,
  DuseumContext
>()
  .use(loggerMiddleware())
  .use(cognitoAuthMiddleware())
  .use(errorHandlerMiddleware())
  .handler(dispatch)
