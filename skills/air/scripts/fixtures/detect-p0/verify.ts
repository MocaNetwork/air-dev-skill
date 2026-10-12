export async function verify(air: any, authToken: string, programId: string) {
  const result = await air.verifyCredential({ authToken, programId, fieldsToDisclose: ["tier"], offchain: true });
  return result.zkProofs;
}
