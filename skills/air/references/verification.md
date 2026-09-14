# Verification troubleshooting

Use [verify.md](verify.md) for the complete setup and [sources.md](sources.md) for current API evidence. Verifier apps do not need an issuer backend unless they also issue credentials.

If an issued credential cannot be verified, inspect token scope/JWKS, selected network and program, schema types, supported proof/disclosure mode, expiry/revocation, and whether required on-chain confirmation has completed. Check the credential's actual status URL and backend behavior before attributing failure to `ISSUER_ORIGIN`.

AIR Kit 1.11.1 returns the current compliant presentation in `verifiablePresentation`. Treat `zkProofs`, `transactionHash`, and `disclosedData` as deprecated compatibility fields that are not reliably populated. For SD_JWT_VC, require both `fieldsToDisclose` and `nonce`; the program determines on-chain versus off-chain verification, so do not invent an `offchain` argument.

Missing Dashboard menus are an account access/configuration problem to investigate using [register.md](register.md), not proof that a verifier must create its own issuer.
