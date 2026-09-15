# GitHub Advisory Draft — SecureSignatureContract Missing Authorization

**Date:** 2026-09-15
**Severity:** High
**Type:** Missing Authorization / Access Control
**Status:** Draft — Ready for submission

---

## Title
Missing Authorization Check in `authorizeUser()` Allows Any Address to Be Authorized

## Affected Repository
`github.com/axie10/off-chain-signatures`
**File:** `src/SecureSignatureContract.sol`
**Functions:** `authorizeUser()`, `authorizeUserWithECDSA()`

## Description
The `authorizeUser` and `authorizeUserWithECDSA` functions in `SecureSignatureContract.sol` do not verify that the `signer` (recovered via `ecrecover`) matches `msg.sender` or any trusted authority. This allows any external caller to:

1. Generate a valid signature using their own private key.
2. Call `authorizeUser()` with that signature.
3. Authorize **any arbitrary address** without the contract deployer's consent.

This completely bypasses the intended authorization system.

## Impact
- **Confidentiality:** None (no data exposure).
- **Integrity:** Critical — Any address can be authorized, bypassing access controls.
- **Availability:** None.
- **Severity:** High (CVSS 7.5–8.1 estimated).

## Vulnerable Code
```solidity
function authorizeUser(uint8 v, bytes32 r, bytes32 s, bytes32 _hash, address _user) public {
    bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash));
    address signer = ecrecover(ethSignedHash, v, r, s);
    // BUG: No check that signer == msg.sender
    authorized[_user] = true;
    emit UserAuthorized(_user, signer);
}
```

## Proof of Concept
See `deliverables/immunefi-poc/SecureSignatureAttack.t.sol` for complete Foundry test.

**Steps to reproduce:**
1. Deploy `SecureSignatureContract`.
2. Attacker generates a hash and signs it with their own private key.
3. Attacker calls `authorizeUser(v, r, s, hash, victimAddress)`.
4. `victimAddress` is now authorized — without deployer consent.

## Recommended Fix
```solidity
function authorizeUser(uint8 v, bytes32 r, bytes32 s, bytes32 _hash, address _user) public {
    bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash));
    address signer = ecrecover(ethSignedHash, v, r, s);
    require(signer == msg.sender, "Unauthorized: signer != caller");  // ADD THIS
    authorized[_user] = true;
    emit UserAuthorized(_user, signer);
}
```

## References
- Original analysis: `reports/IMMUNEFI_DEEP.md`
- PoC: `deliverables/immunefi-poc/SecureSignatureAttack.t.sol`
