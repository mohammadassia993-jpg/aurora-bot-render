# RemoteVault Contract

## Overview

The `RemoteVault` contract is a secure, upgradeable token management system designed to handle token deposits and withdrawals with strict Anti-Money Laundering (AML) verification. Built using the UUPS (Universal Upgradeable Proxy Standard) pattern, it ensures that the contract logic can be upgraded without losing the underlying state or balances. It integrates advanced EIP-2612 permit functionality with front-running protection to offer gasless approvals safely.

## Key Features

### 🔐 AML Compliance & Security
- **EIP-712 Typed Data Signing**: Uses cryptographically secure typed data for AML authorizations.
- **Strict Signature Verification**: Checks signatures against a centralized, trusted `amlSigner`.
- **Replay Protection**: Maps used signature hashes to prevent malicious reuse.
- **Time-Bound Enforcement**: Validates deadlines (`_amlDeadline`) to ensure authorizations do not go stale.

### 💳 Token Operations & UX
- **Standard Deposits & Withdrawals**: Seamlessly move tokens in and out of the vault.
- **Gasless Approvals (Permits)**: Supports EIP-2612 permits allowing users to approve and execute operations in a single transaction.
- **Permit Front-Running Protection**: Wraps permit calls in a `try...catch` block. If a bot front-runs the permit, the transaction gracefully falls back to checking the allowance, preventing Denial of Service (DoS) attacks.

### 🏛️ Access Control & Whitelisting
- **Destination Whitelisting**: Deposits can only be sent to explicitly approved destination addresses.
- **Role-Based Permissions**: Inherits `AccessControlEnumerable` and `Ownable2Step` for granular administrative control.

## Contract Architecture

### Inheritance Structure
```solidity
contract RemoteVault is
    Initializable,
    UUPSUpgradeable,
    Ownable2StepUpgradeable,
    AccessControlEnumerableUpgradeable,
    ReentrancyGuardUpgradeable

```

### Core Components

#### State Variables

* `token` (`CustomToken`): The primary token accepted for deposits.
* `shareToken` (`ICustomToken`): The secondary/receipt token used for withdrawals.
* `amlSigner` (`address`): The trusted off-chain backend wallet that signs AML authorizations.
* `destinationAddresses` (`address[]`): An array tracking all whitelisted deposit destinations.
* `isDestination` (`mapping(address => bool)`): Fast lookup to verify if a destination is allowed.
* `usedSignatures` (`mapping(bytes32 => bool)`): Tracks used message hashes to prevent replays.

## Key Functions

### Deposit Operations

#### `deposit()`

Standard deposit requiring a prior `approve` transaction.

```solidity
function deposit(
    uint256 _amount,
    address _destinationAddress,
    bytes calldata _amlSignature,
    uint256 _amlDeadline
) external

```

#### `depositWithPermit()`

Single-transaction deposit utilizing an EIP-2612 signature for gasless approval.

```solidity
function depositWithPermit(
    uint256 _amount,
    address _destinationAddress,
    bytes calldata _amlSignature,
    uint256 _amlDeadline,
    uint256 _permitDeadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
) external

```

### Withdrawal Operations

#### `withdraw()`

Standard withdrawal. Requires the user to hold `shareTokens` and have provided allowance to the vault.

```solidity
function withdraw(
    uint256 _amount,
    bytes calldata _amlSignature,
    uint256 _amlDeadline
) external nonReentrant

```

#### `withdrawWithPermit()`

Single-transaction withdrawal using a shareToken permit.

```solidity
function withdrawWithPermit(
    uint256 _amount,
    bytes calldata _amlSignature,
    uint256 _amlDeadline,
    uint256 _permitDeadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
) external nonReentrant

```

### Management Functions (Owner Only)

* `addDestinationAddress(address _destination)`: Adds an address to the approved deposit whitelist.
* `removeDestinationAddress(address _destination)`: Removes an address from the whitelist safely using swap-and-pop.
* `getDestinationAddresses()`: Returns the full array of whitelisted addresses.

## AML Verification Process

The contract utilizes OpenZeppelin's `ECDSA.tryRecover` to gracefully catch malformed signatures and map them to custom errors.

### EIP-712 TypeHashes

#### Deposit TypeHash

```solidity
keccak256("Deposit(address sender,uint256 amount,address destinationAddress,uint256 deadline)")

```

#### Withdraw TypeHash

```solidity
keccak256("Withdraw(address sender,uint256 amount,uint256 deadline)")

```

### Verification Flow

1. **Deadline Check**: `block.timestamp <= _deadline`.
2. **Replay Check**: Hash must not exist in `usedSignatures`.
3. **Domain Separation**: Combines the TypeHash with the Vault's chain ID and address.
4. **Recovery**: Executes `ECDSA.tryRecover`. Reverts with `InvalidAmlSignature()` if malformed.
5. **Signer Check**: Reverts with `InvalidAmlSigner()` if the recovered address does not match `amlSigner`.

## Events

### Configuration

```solidity
event RemoteVaultInitialized(address tokenAddress, address shareTokenAddress, address amlSignerAddress);

```

### Operations

```solidity
event Deposited(address indexed user, uint256 amount, address token, address shareToken, address destinationAddress);
event Withdrawn(address indexed user, uint256 amount, address shareToken, address paymentToken);

```

### Whitelist Management

```solidity
event DestinationAddressAdded(address destination);
event DestinationAddressRemoved(address destination);
event DestinationAddressSkipped(address destination);

```

## Error Handling

* `InvalidAddress(string)`: Thrown when a zero address is provided for initialization or whitelisting, or if a deposit targets a non-whitelisted destination.
* `AmlSignatureExpired()`: The provided AML deadline has passed.
* `AmlSignatureAlreadyUsed()`: Protection against replay attacks.
* `InvalidAmlSignature()`: The signature length is incorrect or the s-value is malformed.
* `InvalidAmlSigner()`: Cryptography succeeded, but the signer was not the trusted `amlSigner`.
* `InvalidFunctionName()`: Internal hashing error routing.
* `AmountMustBeGreaterThanZero()`: Zero-value transfers are blocked.
* `InsufficientAllowance()`: Thrown if `permit` fails and standard allowance is missing.

## Security Features & Best Practices

1. **Permit Front-Running Protection**: Malicious actors can observe a `depositWithPermit` transaction in the mempool, extract the permit signature, and execute it directly on the token contract. This consumes the nonce, causing the original user's transaction to revert. `RemoteVault` mitigates this by wrapping the permit in a `try...catch` block. If the permit fails (because it was already consumed), it gracefully falls back to checking `token.allowance()`, allowing the transaction to succeed.
2. **Two-Step Ownership**: Upgrades to contract ownership require the new owner to actively accept the role, preventing accidental lockouts.
3. **Reentrancy Protection**: Withdrawal functions use `nonReentrant` modifiers to prevent reentrancy attacks during token burning/minting cycles.
4. **Array Gas Optimization**: Removing destinations utilizes a "swap and pop" methodology to maintain O(1) gas costs regardless of array size.

## License

MIT License - See SPDX-License-Identifier in contract source code.
