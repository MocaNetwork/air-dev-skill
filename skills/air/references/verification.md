# Verification troubleshooting

Use [verify.md](verify.md) for the complete setup and [sources.md](sources.md) for current API evidence. Verifier apps do not need an issuer backend unless they also issue credentials.

If an issued credential cannot be verified, inspect token scope/JWKS, selected network and program, proof type (`SD_JWT_VC` vs Iden3), credential type, requested fields against the backend `disclosureFrame`, expiry/revocation, and, when issuance immediately preceded verification, whether `waitForOnchainCompletion` was used. Check the issuer's actual `revocation-status` route or status list before attributing failure to `ISSUER_ORIGIN`.

| Backend error | Likely cause |
|---|---|
| `The presentation does not contain an enveloped SD-JWT` | Not an `SD_JWT_VC` program, or not a `Compliant` result |
| `Untrusted issuer: …` | `iss` is not in `AIR_TRUSTED_ISSUERS`; compare exactly, including `did:web:` and `%3A` port encoding |
| `Verify Error: Invalid JWT Signature` | No DID-document/JWKS key matches the header `kid`, the token was altered, or the KB-JWT was not signed by `cnf.jwk` |
| `Key Binding JWT not exist` | A nonce was sent and the credential has `cnf.jwk`, but no KB-JWT arrived; reject |
| `Verify Error: Invalid Nonce` | Replay, or the wrong session's nonce |
| `KB-JWT aud mismatch` | Presentation made for another `programId` |
| `KB-JWT is too old` / `JWT is not yet valid` | KB-JWT `iat` outside the window; check server clock |
| `Invalid sd_hash in Key Binding JWT` | Disclosures added or removed after the holder signed |
| `Missing required claim keys` | A required field was not disclosed or not selectively disclosable; use dotted paths for nested claims |
| `Unexpected vct` | A different credential type than `AIR_EXPECTED_VCT` |
| `Status is not valid` | Revoked (status list checks only) |

`Revoked` is returned by `verifyCredential` only when the program enables issuer revocation checks and every matching credential is revoked. A browser-side `Compliant` with a failed backend check is a rejection, not a partial success.

Missing Dashboard menus are an account access/configuration problem to investigate using [register.md](register.md), not proof that a verifier must create its own issuer.
