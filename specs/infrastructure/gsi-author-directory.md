## Spec: Add GSI-AuthorDirectory to DynamoDB Storage Stack

**Status**: ✅ Implemented
**FR coverage**: FR-DISC-04
**Relevant PROJECT.md sections**: 4.7, 5.2

**What this implements**: `GSI-AuthorDirectory` is defined in PROJECT.md §4.7 and queried by `listAuthors()` in `authors.repository.ts`, but was never added to the CDK table definition in `storage-stack.ts`. Every `GET /authors` request currently throws a DynamoDB `ResourceNotFoundException` causing a 500. This adds the missing GSI.

**Root cause**: `infrastructure/stacks/storage-stack.ts` defines 6 GSIs but omits `GSI-AuthorDirectory`. `listAuthors()` queries `IndexName: 'GSI-AuthorDirectory'` which does not exist on the live table.

**New/modified files**:
- `infrastructure/stacks/storage-stack.ts` — add `GSI-AuthorDirectory` global secondary index to the main DynamoDB table

**DynamoDB access patterns used**:
- `GSI-AuthorDirectory`: PK = `profileType` (= `'AUTHOR'`), SK = `createdAt` — supports paginated newest-first author directory; application-level `FilterExpression: 'status = ACTIVE'`

**Business logic**:
1. Add GSI to the `mainTable` CDK construct:
   - `indexName: 'GSI-AuthorDirectory'`
   - `partitionKey: { name: 'profileType', type: AttributeType.STRING }`
   - `sortKey: { name: 'createdAt', type: AttributeType.STRING }`
   - `projectionType: ProjectionType.ALL`
2. No Lambda or repository changes needed — `listAuthors()` already queries the correct index name

**Done when**:
- [x] `GSI-AuthorDirectory` added to `storage-stack.ts`
- [x] CDK synth passes with zero warnings
- [x] After deploy, `GET /authors` returns `{ items: [...] }` (or empty array) without 500

**Tests to write**: none — integration test already exists for `GET /authors`; it will pass once the GSI exists
