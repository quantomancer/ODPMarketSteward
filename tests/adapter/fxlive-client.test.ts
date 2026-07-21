import {
  FXLIVE_ORIGIN,
  FxLiveClient,
  SourceClientError,
} from "../../packages/adapter-source-api/src";
import { describe, expect, it, vi } from "vitest";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const metadata =
  '{"Epoch":1784653200000000000,"CreatedAt":"2026-07-21T17:00:01Z","Granularity":"1m","InstrumentCount":35,"BarStart":"2026-07-21T16:59:00Z","BarEnd":"2026-07-21T17:00:00Z","available":["EURUSD","GBPUSD"]}';
const bar =
  '{"Currency":"EURUSD","Epoch":1784653140000000000,"BarStart":"2026-07-21T16:59:00Z","BarEnd":"2026-07-21T17:00:00Z","Granularity":"1m","Open":1.17000,"High":1.17100,"Low":1.16900,"Close":1.17050}';

function client(
  fetcher: typeof fetch,
  maximumResponseBytes = 4096,
): FxLiveClient {
  return new FxLiveClient({
    timeoutMilliseconds: 50,
    maximumResponseBytes,
    fetcher,
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe("FxLive fixed-origin source client", () => {
  it("uses only the declared GET routes and bar selector without redirects or caching", async () => {
    const fetcher = vi.fn<typeof fetch>((input) => {
      const url = requestUrl(input);
      if (url.endsWith("/health"))
        return Promise.resolve(
          new Response('{"ok":true,"service":"FXLive"}', {
            headers: jsonHeaders,
          }),
        );
      if (url.endsWith("/meta"))
        return Promise.resolve(
          new Response(metadata, { headers: jsonHeaders }),
        );
      return Promise.resolve(new Response(bar, { headers: jsonHeaders }));
    });
    const source = client(fetcher);

    await expect(source.getHealth()).resolves.toEqual({
      ok: true,
      service: "FXLive",
    });
    await expect(source.getSnapshotMetadata()).resolves.toMatchObject({
      epoch: "1784653200000000000",
      granularity: "1m",
      barEndUtc: "2026-07-21T17:00:00Z",
    });
    await expect(source.getLatestObservation("EURUSD")).resolves.toMatchObject({
      currency: "EURUSD",
      epoch: "1784653140000000000",
      open: "1.17000",
      close: "1.17050",
    });

    expect(fetcher.mock.calls.map(([input]) => requestUrl(input))).toEqual([
      `${FXLIVE_ORIGIN}/health`,
      `${FXLIVE_ORIGIN}/meta`,
      `${FXLIVE_ORIGIN}/latest?bar=EURUSD`,
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        redirect: "error",
        cache: "no-store",
      });
    }
  });

  it.each([
    "eurusd",
    "EUR/USD",
    "EURUSD?debug=1",
    "EURUSD&bar=GBPUSD",
    "EURUSDX",
  ])(
    "rejects non-contract instrument input %s before fetch",
    async (instrument) => {
      const fetcher = vi.fn<typeof fetch>();
      await expect(
        client(fetcher).getLatestObservation(instrument),
      ).rejects.toMatchObject({
        code: "INVALID_INSTRUMENT",
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("preserves unsafe epoch integers and decimal source lexemes", async () => {
    const source = client(
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(bar, { headers: jsonHeaders })),
      ),
    );
    const result = await source.getLatestObservation("EURUSD");
    expect(result).toMatchObject({
      epoch: "1784653140000000000",
      open: "1.17000",
      high: "1.17100",
      low: "1.16900",
      close: "1.17050",
    });
  });

  it.each([
    {
      response: new Response("{}", { status: 503, headers: jsonHeaders }),
      code: "HTTP_STATUS",
    },
    {
      response: new Response("{}", {
        headers: { "content-type": "text/plain" },
      }),
      code: "CONTENT_TYPE",
    },
    {
      response: new Response("", { headers: jsonHeaders }),
      code: "EMPTY_BODY",
    },
    {
      response: new Response("{", { headers: jsonHeaders }),
      code: "MALFORMED_JSON",
    },
    {
      response: new Response('{"ok":true,"service":"Wrong"}', {
        headers: jsonHeaders,
      }),
      code: "INVALID_RESPONSE",
    },
  ])("returns safe typed $code failures", async ({ response, code }) => {
    const source = client(vi.fn<typeof fetch>(() => Promise.resolve(response)));
    await expect(source.getHealth()).rejects.toMatchObject({ code });
  });

  it("rejects oversized streamed responses", async () => {
    const source = client(
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response('{"ok":true,"service":"FXLive"}', {
            headers: jsonHeaders,
          }),
        ),
      ),
      8,
    );
    await expect(source.getHealth()).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
    });
  });

  it("maps elapsed deadlines and caller cancellation separately", async () => {
    const pending = vi.fn<typeof fetch>(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    await expect(client(pending).getHealth()).rejects.toMatchObject({
      code: "TIMEOUT",
    });

    const controller = new AbortController();
    const request = client(pending).getHealth(controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("rejects redirects and unexpected response URLs", async () => {
    const response = new Response('{"ok":true,"service":"FXLive"}', {
      headers: jsonHeaders,
    });
    Object.defineProperty(response, "redirected", { value: true });
    await expect(
      client(vi.fn<typeof fetch>(() => Promise.resolve(response))).getHealth(),
    ).rejects.toMatchObject({
      code: "REDIRECT",
    });
  });

  it("rejects undeclared fields, duplicate instruments, invalid intervals and mismatched bars", async () => {
    const cases = [
      '{"ok":true,"service":"FXLive","extra":1}',
      metadata.replace('["EURUSD","GBPUSD"]', '["EURUSD","EURUSD"]'),
      metadata.replace("17:00:00Z", "17:00:01Z"),
      bar.replace('"Currency":"EURUSD"', '"Currency":"GBPUSD"'),
    ];
    const operations = [
      (source: FxLiveClient) => source.getHealth(),
      (source: FxLiveClient) => source.getSnapshotMetadata(),
      (source: FxLiveClient) => source.getSnapshotMetadata(),
      (source: FxLiveClient) => source.getLatestObservation("EURUSD"),
    ];
    for (const [index, body] of cases.entries()) {
      const source = client(
        vi.fn<typeof fetch>(() =>
          Promise.resolve(new Response(body, { headers: jsonHeaders })),
        ),
      );
      await expect(operations[index]?.(source)).rejects.toBeInstanceOf(
        SourceClientError,
      );
    }
  });
});
