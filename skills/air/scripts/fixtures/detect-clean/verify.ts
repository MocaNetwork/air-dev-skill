export async function verify(air: any, authToken: string, programId: string, nonce: string) {
  const result = await air.verifyCredential({ authToken, programId, fieldsToDisclose: ["tier"], nonce });
  if (result.status !== "Compliant") return null;
  await fetch("/api/air/verify-presentation", { method: "POST", body: JSON.stringify({ verifiablePresentation: result.verifiablePresentation }) });
}
