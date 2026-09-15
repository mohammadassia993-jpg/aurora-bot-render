// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {EIP3009} from "./modules/eip-3009/EIP3009.sol";

/**
 * @title Custom ERC20 Token
 * @notice Minimal ERC20 token with mint and burn functionality.
 * @author NU Blockchain Technologies
 */
contract CustomToken is
    Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    AccessControlEnumerableUpgradeable,
    Ownable2StepUpgradeable,
    UUPSUpgradeable,
    EIP3009
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /**
     * @notice Custom decimals for the token.
     */
    uint8 private _customDecimals;

    /**
     * @notice Event emitted when tokens are burned.
     * @param from The address that burned the tokens.
     * @param amount The amount of tokens burned.
     */
    event TokensBurned(address indexed from, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract with the provided token name, symbol, admin, and decimals.
     * @param _name The name of the token.
     * @param _symbol The symbol of the token.
     * @param _initialOwner The address of the admin.
     * @param _decimals The number of decimals for the token.
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        address _initialOwner,
        uint8 _decimals
    ) public initializer {
        __ERC20_init(_name, _symbol);
        __ERC20Permit_init(_name);
        __AccessControlEnumerable_init();
        __Ownable_init(_initialOwner);
        __UUPSUpgradeable_init();

        _customDecimals = _decimals;
    }

    // --- Admin Functions ---

    /**
     * @notice Grants the MINTER_ROLE to a specified address.
     * @param _minter The address to be granted the MINTER_ROLE.
     */
    function addMinter(address _minter) external onlyOwner {
        _grantRole(MINTER_ROLE, _minter);
    }

    /**
     * @notice Revokes the MINTER_ROLE from a specified address.
     * @param _minter The address to have the MINTER_ROLE revoked.
     */
    function removeMinter(address _minter) external onlyOwner {
        _revokeRole(MINTER_ROLE, _minter);
    }

    // --- EIP3009 Required Hook Implementations ---
    /**
     * @notice Returns the domain separator for EIP3009.
     * @return The domain separator.
     */
    function _domainSeparator() internal view override returns (bytes32) {
        // Use the internal function provided by OpenZeppelin's EIP712
        // (which ERC20Permit inherits)
        return _domainSeparatorV4();
    }

    /**
     * @notice Executes a transfer between two addresses.
     * @param sender The address of the sender.
     * @param recipient The address of the recipient.
     * @param amount The amount of tokens to transfer.
     */
    function _executeTransfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal override {
        _transfer(sender, recipient, amount); // Provided by OZ ERC20
    }
    // ---------------------------------------------

    /**
     * @notice Returns the number of decimals for the token.
     * @return The number of decimals.
     */
    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }

    /**
     * @notice Mints a specified amount of tokens to a specified address.
     * @param to The address to which the tokens will be minted.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @notice Burns a specified amount of tokens from the caller's balance.
     * @param amount The amount of tokens to burn.
     */
    function burn(uint256 amount) public virtual {
        _burn(_msgSender(), amount);
        emit TokensBurned(_msgSender(), amount);
    }

    /**
     * @notice Burns a specified amount of tokens from a specified address.
     * @dev The caller must have been approved to spend at least `amount` tokens on behalf of `account`.
     * @param account The address to burn tokens from.
     * @param amount The amount of tokens to burn.
     */
    function burnFrom(address account, uint256 amount) public virtual {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
        emit TokensBurned(account, amount);
    }

    // --- Upgrade Safety ---
    // 1 slot: _customDecimals
    uint256[49] private __gap;

    /**
     * @notice Authorizes a contract upgrade.
     * @dev Only callable by the owner.
     * @param newImplementation Address of the new implementation.
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {
        // Upgrade authorized
    }
}
