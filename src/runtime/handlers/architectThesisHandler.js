/**
 * Transport-neutral authority for the Architect Thesis endpoint family.
 *
 * Adapters own I/O only. This kernel owns method support, mutation status, and
 * semantic payload projection so server and static play cannot drift.
 */
export function handleArchitectThesisRequest({
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
        reasonCode: "ARCHITECT_SESSION_NOT_FOUND",
        error: "No active franchise session exists."
      }
    };
  }
  if (method === "GET") {
    return {
      status: 200,
      body: {
        ok: true,
        thesis: session.getDashboardState().architectThesis
      }
    };
  }
  if (method !== "POST") {
    return {
      status: 405,
      body: {
        ok: false,
        reasonCode: "ARCHITECT_METHOD_NOT_ALLOWED",
        error: "The Architect Thesis endpoint supports GET and POST."
      }
    };
  }
  const result = session.setArchitectThesis(input || {});
  const status = Number(result.status || (result.ok ? 200 : 400));
  return {
    status,
    body: result.ok
      ? { ok: true, thesis: result.thesis, state: projectState(session) }
      : result
  };
}
