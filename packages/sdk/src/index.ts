import createFetchClient from "openapi-fetch";
import type { FetchResponse } from "openapi-fetch";
import type { paths } from "./generated/schema";

export type { paths };

export type JsonRequestBody<T> = T extends { content: { "application/json": infer U } } ? U : never;
export type JsonResponseBody<T> = T extends { content: { "application/json": infer U } } ? U : never;

export type CreateWorldBody = JsonRequestBody<paths["/v1/worlds"]["post"]["requestBody"]>;
export type CreateBranchBody = JsonRequestBody<
  paths["/v1/worlds/{worldId}/branches"]["post"]["requestBody"]
>;
export type UpsertUnitBody = JsonRequestBody<paths["/v1/worlds/{worldId}/units"]["post"]["requestBody"]>;
export type CreateCommitBody = JsonRequestBody<paths["/v1/worlds/{worldId}/commits"]["post"]["requestBody"]>;
export type MergeBody = JsonRequestBody<paths["/v1/worlds/{worldId}/merge"]["post"]["requestBody"]>;
export type MergeResolution = NonNullable<MergeBody["resolutions"]>[number];

export type ListWorldsResponse = JsonResponseBody<paths["/v1/worlds"]["get"]["responses"]["200"]>;
export type ListBranchesResponse = JsonResponseBody<
  paths["/v1/worlds/{worldId}/branches"]["get"]["responses"]["200"]
>;
export type ListCommitsResponse = JsonResponseBody<
  paths["/v1/worlds/{worldId}/commits"]["get"]["responses"]["200"]
>;
export type GetCommitResponse = JsonResponseBody<
  paths["/v1/worlds/{worldId}/commits/{commitId}"]["get"]["responses"]["200"]
>;
export type GetUnitsResponse = JsonResponseBody<paths["/v1/worlds/{worldId}/units"]["get"]["responses"]["200"]>;
export type GetUnitResponse = JsonResponseBody<
  paths["/v1/worlds/{worldId}/units/{unitId}"]["get"]["responses"]["200"]
>;
export type CreateWorldResponse = JsonResponseBody<paths["/v1/worlds"]["post"]["responses"]["201"]>;
export type CreateBranchResponse = JsonResponseBody<
  paths["/v1/worlds/{worldId}/branches"]["post"]["responses"]["201"]
>;
export type UpsertUnitResponse = JsonResponseBody<
  paths["/v1/worlds/{worldId}/units"]["post"]["responses"]["201"]
>;
export type CommitResponse = JsonResponseBody<
  paths["/v1/worlds/{worldId}/commits"]["post"]["responses"]["201"]
>;
export type DiffResponse = JsonResponseBody<paths["/v1/worlds/{worldId}/diff"]["get"]["responses"]["200"]>;
export type MergePreviewResponse = JsonResponseBody<
  paths["/v1/worlds/{worldId}/merge"]["post"]["responses"]["200"]
>;
export type MergeApplyResponse = JsonResponseBody<
  paths["/v1/worlds/{worldId}/merge"]["post"]["responses"]["201"]
>;

export interface WorldForkClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
}

const unwrap = async <T>(promise: Promise<{ data?: T; error?: unknown }>): Promise<T> => {
  const { data, error } = await promise;
  if (error) {
    throw error;
  }
  return data as T;
};

const unwrapWithStatus = async <R extends FetchResponse<any, any, any>>(
  promise: Promise<R>,
  expectedStatus: number
): Promise<NonNullable<R["data"]>> => {
  const { data, error, response } = await promise;
  if (error) {
    throw error;
  }
  if (response.status !== expectedStatus) {
    throw new Error(`Unexpected response status ${response.status}`);
  }
  return data as NonNullable<R["data"]>;
};

export const createClient = ({ baseUrl, apiKey, fetch }: WorldForkClientOptions) => {
  const client = createFetchClient<paths>({
    baseUrl,
    fetch,
    headers: apiKey ? { "X-API-Key": apiKey } : undefined
  });

  return {
    client,
    listWorlds: (query?: paths["/v1/worlds"]["get"]["parameters"]["query"]) =>
      unwrap<ListWorldsResponse>(
        client.GET("/v1/worlds", {
          params: {
            query
          }
        })
      ),
    listBranches: (worldId: string, query?: paths["/v1/worlds/{worldId}/branches"]["get"]["parameters"]["query"]) =>
      unwrap<ListBranchesResponse>(
        client.GET("/v1/worlds/{worldId}/branches", {
          params: {
            path: { worldId },
            query
          }
        })
      ),
    listCommits: (
      worldId: string,
      query?: paths["/v1/worlds/{worldId}/commits"]["get"]["parameters"]["query"]
    ) =>
      unwrap<ListCommitsResponse>(
        client.GET("/v1/worlds/{worldId}/commits", {
          params: {
            path: { worldId },
            query
          }
        })
      ),
    getCommit: (worldId: string, commitId: string) =>
      unwrap<GetCommitResponse>(
        client.GET("/v1/worlds/{worldId}/commits/{commitId}", {
          params: {
            path: { worldId, commitId }
          }
        })
      ),
    getUnits: (worldId: string, query: paths["/v1/worlds/{worldId}/units"]["get"]["parameters"]["query"]) =>
      unwrap<GetUnitsResponse>(
        client.GET("/v1/worlds/{worldId}/units", {
          params: {
            path: { worldId },
            query
          }
        })
      ),
    getUnit: (
      worldId: string,
      unitId: string,
      query: paths["/v1/worlds/{worldId}/units/{unitId}"]["get"]["parameters"]["query"]
    ) =>
      unwrap<GetUnitResponse>(
        client.GET("/v1/worlds/{worldId}/units/{unitId}", {
          params: {
            path: { worldId, unitId },
            query
          }
        })
      ),
    createWorld: (body: CreateWorldBody) => unwrap<CreateWorldResponse>(client.POST("/v1/worlds", { body })),
    createBranch: (worldId: string, body: CreateBranchBody) =>
      unwrap<CreateBranchResponse>(
        client.POST("/v1/worlds/{worldId}/branches", {
          params: { path: { worldId } },
          body
        })
      ),
    upsertUnit: (worldId: string, body: UpsertUnitBody) =>
      unwrap<UpsertUnitResponse>(
        client.POST("/v1/worlds/{worldId}/units", {
          params: { path: { worldId } },
          body
        })
      ),
    commit: (worldId: string, body: CreateCommitBody) =>
      unwrap<CommitResponse>(
        client.POST("/v1/worlds/{worldId}/commits", {
          params: { path: { worldId } },
          body
        })
      ),
    diff: (worldId: string, query: paths["/v1/worlds/{worldId}/diff"]["get"]["parameters"]["query"]) =>
      unwrap<DiffResponse>(
        client.GET("/v1/worlds/{worldId}/diff", {
          params: {
            path: { worldId },
            query
          }
        })
      ),
    mergePreview: (worldId: string, body: Omit<MergeBody, "resolutions">) =>
      unwrapWithStatus(
        client.POST("/v1/worlds/{worldId}/merge", {
          params: { path: { worldId } },
          body
        }),
        200
      ),
    mergeApply: (worldId: string, body: MergeBody & { resolutions: MergeResolution[] }) =>
      unwrapWithStatus(
        client.POST("/v1/worlds/{worldId}/merge", {
          params: { path: { worldId } },
          body
        }),
        201
      )
  };
};

export type WorldForkClient = ReturnType<typeof createClient>;
