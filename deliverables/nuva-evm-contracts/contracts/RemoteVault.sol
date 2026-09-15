// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {CustomToken} from "./CustomToken.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ICustomToken} from "./modules/utils/ICustomToken.sol";

/*
 * @title RemoteVault
 * @dev This is the RemoteVault contract. It handles token deposits and withdrawals
 * with AML verification and permit functionality.
 * It accepts a specified token (token) and manages deposits/withdrawals
 * to user-provided destination addresses.
 * This contract follows the UUPS upgradeable proxy pattern.
 */
error InvalidAddress(string); // dev: Address cannot be zero
error AmlSignatureExpired(); // dev: AML signature has expired
error AmlSignatureAlreadyUsed(); // dev: AML signature has already been used
error InvalidAmlSignature(); // dev: The AML signature is invalid
error InvalidAmlSigner(); // dev: The AML signer is invalid
error InvalidFunctionName(); // dev: The function name is invalid
error AmountMustBeGreaterThanZero(); // dev: Amount must be greater than zero
error InsufficientAllowance(); // dev: The required token allowance is not met

/**
 * @title RemoteVault Contract
 * @notice This contract is used to deposit and withdraw tokens.
 * @dev This contract handles token deposits and withdrawals with AML verification and permit functionality.
 * @author NU Blockchain Technologies
 */
contract RemoteVault is
    Initializable,
    UUPSUpgradeable,
    Ownable2StepUpgradeable,
    AccessControlEnumerableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for CustomToken;
    using SafeERC20 for ICustomToken;

    // --- Constants ---
    /// @dev Internal identifier for Deposit operations to route signature verification.
    bytes32 private constant DEPOSIT_HASH = keccak256("Deposit");

    /// @dev Internal identifier for Withdraw operations to route signature verification.
    bytes32 private constant WITHDRAW_HASH = keccak256("Withdraw");

    /// @dev EIP-712 Typehash for the Deposit struct. Defines field names and types.
    bytes32 private constant DEPOSIT_TYPEHASH =
        keccak256(
            "Deposit(address sender,uint256 amount,address destinationAddress,uint256 deadline)"
        );

    /// @dev EIP-712 Typehash for the Withdraw struct. Defines field names and types.
    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(address sender,uint256 amount,uint256 deadline)");

    /// @dev EIP-712 Typehash for the Domain Separator. Used to prevent cross-contract/cross-chain replays.
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    // --- State Variables ---

    /// @notice The token that can be deposited into this contract.
    CustomToken public token;

    /// @notice The address of the share token, used for event emissions.
    ICustomToken public shareToken;

    /// @notice The address of the trusted signer for AML (Anti-Money Laundering) checks.
    address public amlSigner;

    /// @notice Array of all allowed destination addresses.
    address[] public destinationAddresses;

    /// @notice Mapping to check if a destination address is valid.
    mapping(address => bool) public isDestination;

    /// @notice Mapping to track used AML signatures to prevent replay attacks.
    mapping(bytes32 => bool) public usedSignatures;

    /// @notice Mapping from address to (index in destination array + 1).
    mapping(address => uint256) public addressToIndex;

    // --- Events ---

    /**
     * @notice Emitted when a depositor is initialized.
     * @param tokenAddress The address of the deposit token.
     * @param shareTokenAddress The address of the withdrawal token.
     * @param amlSignerAddress The address of the AML signer.
     */
    event RemoteVaultInitialized(
        address tokenAddress,
        address shareTokenAddress,
        address amlSignerAddress
    );

    /**
     * @notice Emitted when a deposit is made.
     * @param user The address of the user making the deposit.
     * @param amount The amount of tokens deposited.
     * @param token The address of the deposit token.
     * @param shareToken The address of the share token.
     * @param destinationAddress The address where the tokens were sent.
     */
    event Deposited(
        address indexed user,
        uint256 amount,
        address token,
        address shareToken,
        address destinationAddress
    );

    /**
     * @notice Emitted when a withdrawal is made.
     * @param user The address of the user who initiated the withdrawal.
     * @param amount The amount of tokens withdrawn.
     * @param shareToken The address of the shared token associated with the withdrawal.
     * @param paymentToken The address of the payment token associated with the withdrawal.
     */
    event Withdrawn(
        address indexed user,
        uint256 amount,
        address shareToken,
        address paymentToken
    );

    /// @notice Emitted when new destination address is added.
    /// @param destination The address of the destination.
    event DestinationAddressAdded(address destination);

    /// @notice Emitted when destination address is removed.
    /// @param destination The address of the destination.
    event DestinationAddressRemoved(address destination);

    /// @notice Emitted when destination address is skipped.
    /// @param destination The address of the destination.
    event DestinationAddressSkipped(address destination);

    /**
     * @notice Emitted when aml signer address is updated.
     * @param from The address of the old aml signer.
     * @param to The address of the new aml signer.
     */
    event AmlSignerUpdated(address indexed from, address indexed to);

    /// @custom:oz-upgrades-unsafe-allow constructor
    /// @notice constructor
    constructor() {
        _disableInitializers();
    }

    // --- Initializer ---

    /**
     * @notice Initializes the contract with the provided token addresses and AML signer.
     * @dev Can only be called once during contract deployment.
     * @param _tokenAddress The token contract this depositor will accept.
     * @param _shareTokenAddress The token address to emit in the log.
     * @param _amlSignerAddress The address of the trusted AML signer.
     */
    function initialize(
        address _tokenAddress,
        address _shareTokenAddress,
        address _amlSignerAddress
    ) external initializer {
        __UUPSUpgradeable_init();
        __Ownable_init(msg.sender); // Ownable2Step uses this internal call
        __AccessControlEnumerable_init();
        __ReentrancyGuard_init();

        if (_tokenAddress == address(0)) revert InvalidAddress("token");
        if (_shareTokenAddress == address(0))
            revert InvalidAddress("share token");
        if (_amlSignerAddress == address(0))
            revert InvalidAddress("aml signer");

        token = CustomToken(_tokenAddress);
        shareToken = ICustomToken(_shareTokenAddress);
        amlSigner = _amlSignerAddress;

        emit RemoteVaultInitialized(
            _tokenAddress,
            _shareTokenAddress,
            _amlSignerAddress
        );
    }

    // --- Public Functions ---

    /**
     * @notice Updates the aml signer address.
     * @dev Can only be called by the destination manager.
     * @param amlSignerAddress The aml signer address.
     */
    function updateAmlSigner(address amlSignerAddress) external onlyOwner {
        if (amlSignerAddress == address(0)) revert InvalidAddress("aml signer");

        address oldAmlSigner = amlSigner;
        amlSigner = amlSignerAddress;

        emit AmlSignerUpdated(oldAmlSigner, amlSignerAddress);
    }

    /**
     * @notice Deposits tokens after user provides a separate `approve`.
     * @dev Requires AML signature.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address to send the tokens to.
     * @param _amlSignature The AML signature for verification.
     * @param _amlDeadline The time at which the AML signature expires.
     */
    function deposit(
        uint256 _amount,
        address _destinationAddress,
        bytes calldata _amlSignature,
        uint256 _amlDeadline
    ) external nonReentrant {
        bytes32 messageHash = _getMessageHash(
            "Deposit",
            _amount,
            _destinationAddress,
            _amlDeadline
        );
        _verifyAML("Depositor", messageHash, _amlSignature, _amlDeadline);

        _doDeposit(_amount, _destinationAddress);
    }

    /**
     * @notice Allows a user to withdraw tokens after passing an AML check.
     * @dev The function verifies the AML signature and deadline before processing the withdrawal.
     * @param _amount The amount of tokens to withdraw.
     * @param _amlSignature The signature from the AML signer.
     * @param _amlDeadline The expiration timestamp for the AML signature.
     */
    function withdraw(
        uint256 _amount,
        bytes calldata _amlSignature,
        uint256 _amlDeadline
    ) external nonReentrant {
        if (_amount == 0) revert AmountMustBeGreaterThanZero();

        bytes32 messageHash = _getMessageHash(
            "Withdraw",
            _amount,
            address(0),
            _amlDeadline
        );
        _verifyAML("Withdrawal", messageHash, _amlSignature, _amlDeadline);

        _doWithdraw(_amount);
    }

    /**
     * @notice Deposits tokens using an off-chain 'permit' signature.
     * @dev This allows for a single-transaction approve+deposit.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address to send the tokens to.
     * @param _amlSignature The AML signature for verification.
     * @param _amlDeadline The time at which the AML signature expires.
     * @param _permitDeadline The time at which the permit signature expires.
     * @param _v The recovery byte of the EIP-712 permit signature.
     * @param _r First 32 bytes of the EIP-712 permit signature.
     * @param _s Second 32 bytes of the EIP-712 permit signature.
     */
    function depositWithPermit(
        uint256 _amount,
        address _destinationAddress,
        bytes calldata _amlSignature,
        uint256 _amlDeadline,
        uint256 _permitDeadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external nonReentrant {
        bytes32 messageHash = _getMessageHash(
            "Deposit",
            _amount,
            _destinationAddress,
            _amlDeadline
        );
        _verifyAML("Depositor", messageHash, _amlSignature, _amlDeadline);

        // Attempt the permit. If it fails (e.g., due to front-running), catch the error.
        try
            token.permit(
                msg.sender, // The user (owner)
                address(this), // The spender (this contract)
                _amount, // The amount
                _permitDeadline, // Expiration
                _v,
                _r,
                _s // The user's signature
            )
        {} catch {
            // Permit may have already been consumed by a front-runner.
        }

        // Verify that the required allowance exists, regardless of how it got there.
        if (token.allowance(msg.sender, address(this)) < _amount) {
            revert InsufficientAllowance();
        }

        _doDeposit(_amount, _destinationAddress);
    }

    /**
     * @notice Withdraws tokens using an off-chain 'permit' signature.
     * @dev This allows for a single-transaction approve+withdraw.
     * @param _amount The amount of tokens to withdraw.
     * @param _amlSignature The AML signature for verification.
     * @param _amlDeadline The time at which the AML signature expires.
     * @param _permitDeadline The time at which the permit signature expires.
     * @param _v The recovery byte of the EIP-712 permit signature.
     * @param _r First 32 bytes of the EIP-712 permit signature.
     * @param _s Second 32 bytes of the EIP-712 permit signature.
     */
    function withdrawWithPermit(
        uint256 _amount,
        bytes calldata _amlSignature,
        uint256 _amlDeadline,
        uint256 _permitDeadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external nonReentrant {
        bytes32 messageHash = _getMessageHash(
            "Withdraw",
            _amount,
            address(0),
            _amlDeadline
        );
        _verifyAML("Withdrawal", messageHash, _amlSignature, _amlDeadline);

        // Attempt the permit. If it fails (e.g., due to front-running), catch the error.
        try
            shareToken.permit(
                msg.sender, // The user (owner)
                address(this), // The spender (this contract)
                _amount, // The amount
                _permitDeadline, // Expiration
                _v,
                _r,
                _s // The user's signature
            )
        {} catch {
            // Permit may have already been consumed by a front-runner.
        }

        // Verify that the required allowance exists.
        if (shareToken.allowance(msg.sender, address(this)) < _amount) {
            revert InsufficientAllowance();
        }

        _doWithdraw(_amount);
    }

    /**
     * @dev Helper function to get the full list of addresses.
     */
    function getDestinationAddresses() public view returns (address[] memory) {
        return destinationAddresses;
    }

    /**
     * @dev Adds a destination address to the array only if it doesn't already exist.
     * @param _destination The address to attempt to add.
     */
    function addDestinationAddress(address _destination) external onlyOwner {
        if (_destination == address(0))
            revert InvalidAddress("zero destination address");

        if (isDestination[_destination]) {
            emit DestinationAddressSkipped(_destination);
            return;
        }

        isDestination[_destination] = true;

        destinationAddresses.push(_destination);

        // Store the index + 1 (so index 0 is at 1)
        addressToIndex[_destination] = destinationAddresses.length;

        emit DestinationAddressAdded(_destination);
    }

    /**
     * @dev Removes a destination address from the array.
     * Note: This changes the order of the array (swap and pop) for gas efficiency.
     * @param _destination The address to remove.
     */
    function removeDestinationAddress(address _destination) external onlyOwner {
        if (!isDestination[_destination]) {
            emit DestinationAddressSkipped(_destination);
            return;
        }

        uint256 indexPlusOne = addressToIndex[_destination];
        uint256 indexToRemove = indexPlusOne - 1;
        uint256 lastIndex = destinationAddresses.length - 1;

        if (indexToRemove != lastIndex) {
            address lastDestination = destinationAddresses[lastIndex];

            // Move the last element into the gap
            destinationAddresses[indexToRemove] = lastDestination;

            // Update the index of the moved element
            addressToIndex[lastDestination] = indexPlusOne;
        }

        // Clean up
        destinationAddresses.pop();
        delete addressToIndex[_destination];
        delete isDestination[_destination];

        emit DestinationAddressRemoved(_destination);
    }

    // --- Private Helper Functions ---

    /**
     * @notice Internal function to perform the token transfer and emit the Deposit event.
     * @dev This function is called by the public deposit and depositWithPermit functions.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address where tokens will be sent.
     */
    function _doDeposit(uint256 _amount, address _destinationAddress) private {
        if (_amount == 0) revert AmountMustBeGreaterThanZero();
        if (_destinationAddress == address(0))
            revert InvalidAddress("destination");
        if (!isDestination[_destinationAddress])
            revert InvalidAddress("destination");

        token.safeTransferFrom(msg.sender, _destinationAddress, _amount);

        emit Deposited(
            msg.sender,
            _amount,
            address(token),
            address(shareToken),
            _destinationAddress
        );
    }

    /**
     * @notice Handles the withdrawal logic by burning share tokens from the sender.
     * @param _amount The amount of share tokens to burn.
     */
    function _doWithdraw(uint256 _amount) private {
        if (_amount == 0) revert AmountMustBeGreaterThanZero();

        // burn share tokens from user
        shareToken.burnFrom(msg.sender, _amount);

        emit Withdrawn(
            msg.sender,
            _amount,
            address(shareToken),
            address(token)
        );
    }

    /**
     * @notice Internal function to verify the AML signature.
     * @dev This function is called by the public deposit and depositWithPermit functions.
     * @param _name The name of the function.
     * @param messageHash The hash of the message to verify.
     * @param _signature The signature to verify.
     * @param _deadline The expiration timestamp for the signature.
     */
    function _verifyAML(
        string memory _name,
        bytes32 messageHash,
        bytes calldata _signature,
        uint256 _deadline
    ) private {
        if (block.timestamp > _deadline) revert AmlSignatureExpired();
        if (usedSignatures[messageHash]) revert AmlSignatureAlreadyUsed();

        bytes32 ethSignedHash = MessageHashUtils.toTypedDataHash(
            _getDomainSeparator(_name),
            messageHash
        );

        (address recoveredSigner, ECDSA.RecoverError err, ) = ECDSA.tryRecover(
            ethSignedHash,
            _signature
        );

        if (
            err != ECDSA.RecoverError.NoError || recoveredSigner == address(0)
        ) {
            revert InvalidAmlSignature();
        }

        if (recoveredSigner != amlSigner) revert InvalidAmlSigner();

        usedSignatures[messageHash] = true;
    }

    /**
     * @notice Returns the domain separator for the current chain.
     * @param _name The name of the function.
     * @return The domain separator for the current chain.
     */
    function _getDomainSeparator(
        string memory _name
    ) private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    keccak256(bytes(_name)),
                    keccak256("1"),
                    block.chainid,
                    address(this)
                )
            );
    }

    /**
     * @notice Calculates the hash of the struct using abi.encode (standard EIP-712).
     * @param _name The name of the function.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address to send the tokens to.
     * @param _deadline The expiration timestamp for the signature.
     * @return The hash of the struct.
     */
    function _getMessageHash(
        string memory _name,
        uint256 _amount,
        address _destinationAddress,
        uint256 _deadline
    ) private view returns (bytes32) {
        bytes32 nameHash = keccak256(bytes(_name));

        if (nameHash == DEPOSIT_HASH) {
            return
                keccak256(
                    abi.encode(
                        DEPOSIT_TYPEHASH,
                        msg.sender,
                        _amount,
                        _destinationAddress,
                        _deadline
                    )
                );
        } else if (nameHash == WITHDRAW_HASH) {
            return
                keccak256(
                    abi.encode(
                        WITHDRAW_TYPEHASH,
                        msg.sender,
                        _amount,
                        _deadline
                    )
                );
        }

        revert InvalidFunctionName();
    }

    // --- Upgrade Safety ---
    // 7 slots used: token, shareToken, amlSigner, destinationAddresses, isDestination, usedSignatures, addressToIndex
    uint256[43] private __gap;

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
