/**
 * SPDX-License-Identifier: MIT
 *
 * Copyright (c) 2020 Coinbase, Inc.
 * Copyright (c) 2020 CENTRE SECZ
 * Copyright (c) 2026 Nuva Labs
 *
 * NOTE: This file contains modified code originally sourced from:
 * https://github.com/CoinbaseStablecoin/eip-3009/blob/aabbc65352a96ea520443c03ad390f0d1c56e9ed/contracts/lib/EIP3009.sol
 * * Modifications made:
 * - Updated pragma to solidity ^0.8.20.
 * - Removed inheritance of `IERC20Internal` and `EIP712Domain` to resolve state variable and visibility conflicts with OpenZeppelin 5.0.
 * - Introduced abstract internal hooks `_domainSeparator()` and `_executeTransfer()` to delegate implementations to the inheriting token contract.
 * - Replaced direct references to the `DOMAIN_SEPARATOR` state variable with calls to the `_domainSeparator()` hook.
 * - Replaced the standard `_transfer` call with the `_executeTransfer()` hook to accommodate OpenZeppelin 5.0's removal of the virtual modifier on `_transfer`.
 */

pragma solidity ^0.8.20;

import {EIP712} from "./EIP712.sol";

abstract contract EIP3009 {
    // keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267;

    // keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH =
        0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8;

    // keccak256("CancelAuthorization(address authorizer,bytes32 nonce)")
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        0x158b0a9edf7a828aad02f63cd515c68ef2f50ba807396f6d12842833a1597429;

    mapping(address => mapping(bytes32 => bool)) internal _authorizationStates;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(
        address indexed authorizer,
        bytes32 indexed nonce
    );

    string internal constant _INVALID_SIGNATURE_ERROR =
        "EIP3009: invalid signature";
    string internal constant _AUTHORIZATION_USED_ERROR =
        "EIP3009: authorization is used";

    // --- Hooks to be implemented by CustomToken ---
    function _domainSeparator() internal view virtual returns (bytes32);
    function _executeTransfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual;
    // ----------------------------------------------

    function authorizationState(
        address authorizer,
        bytes32 nonce
    ) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _transferWithAuthorization(
            TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(to == msg.sender, "EIP3009: caller must be the payee");
        _transferWithAuthorization(
            RECEIVE_WITH_AUTHORIZATION_TYPEHASH,
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );
    }

    function cancelAuthorization(
        address authorizer,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(
            !_authorizationStates[authorizer][nonce],
            _AUTHORIZATION_USED_ERROR
        );

        bytes memory data = abi.encode(
            CANCEL_AUTHORIZATION_TYPEHASH,
            authorizer,
            nonce
        );

        // Swapped DOMAIN_SEPARATOR for _domainSeparator()
        require(
            EIP712.recover(_domainSeparator(), v, r, s, data) == authorizer,
            _INVALID_SIGNATURE_ERROR
        );

        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    function _transferWithAuthorization(
        bytes32 typeHash,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        require(
            block.timestamp > validAfter,
            "EIP3009: authorization is not yet valid"
        );
        require(
            block.timestamp < validBefore,
            "EIP3009: authorization is expired"
        );
        require(!_authorizationStates[from][nonce], _AUTHORIZATION_USED_ERROR);

        bytes memory data = abi.encode(
            typeHash,
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce
        );

        // Swapped DOMAIN_SEPARATOR for _domainSeparator()
        require(
            EIP712.recover(_domainSeparator(), v, r, s, data) == from,
            _INVALID_SIGNATURE_ERROR
        );

        _authorizationStates[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);

        // Swapped _transfer for _executeTransfer
        _executeTransfer(from, to, value);
    }
}
