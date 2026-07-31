/**
 * Transport-neutral authority for the inbound trade-offer endpoint family.
 *
 * Adapters own I/O only. This kernel owns method support, response semantics,
 * and status codes (200/400/404/409) so server and static play cannot drift.
 */
export function handleTradeOffersRequest({
  method,
  session,
  input = {},
  projectState = (activeSession) => activeSession.getDashboardState()
}) {
  if (!session) {
    return {
      status: 404,
      body: {
        ok: false,
        reasonCode: "TRADE_OFFERS_SESSION_NOT_FOUND",
        error: "No active franchise session exists."
      }
    };
  }
  if (method === "GET") {
    return { status: 200, body: { ok: true, ...session.getTradeOffers() } };
  }
  if (method !== "POST") {
    return {
      status: 405,
      body: {
        ok: false,
        reasonCode: "TRADE_OFFERS_METHOD_NOT_ALLOWED",
        error: "The trade-offers endpoint supports GET and POST."
      }
    };
  }
  const result = session.respondToTradeOffer(input || {});
  const status = Number(result.status || (result.ok ? 200 : 400));
  return {
    status,
    body: result.ok
      ? {
          ok: true,
          offer: result.offer,
          trade: result.trade || null,
          counterPrefill: result.counterPrefill || null,
          state: projectState(session)
        }
      : result
  };
}
