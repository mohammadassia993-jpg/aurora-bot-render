const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("DedicatedVaultRouter", function () {
  async function deployRouterFixture() {
    const [owner, amlSigner, user] = await ethers.getSigners();

    // 1. Deploy Mock Asset
    const MockToken = await ethers.getContractFactory("MockERC20");
    const asset = await MockToken.deploy("USDC", "USDC");

    // 2. Deploy AssetVault (Underlying is USDC) - Uses Specialized Async Mock
    const MockAsyncVault = await ethers.getContractFactory(
      "MockAsyncRedemptionVault",
    );
    const assetVault = await MockAsyncVault.deploy(
      await asset.getAddress(),
      "Vault Shares",
      "vUSDC",
    );

    // 3. Deploy StakingVault (Underlying is AssetVault Shares!) - Uses Standard Mock
    const MockVault = await ethers.getContractFactory("MockERC4626");
    const stakingVault = await MockVault.deploy(
      await assetVault.getAddress(),
      "Staking Shares",
      "stkUSDC",
    );

    // 4. Deploy NuvaVault via Proxy (Underlying is StakingVault Shares!)
    const NuvaVault = await ethers.getContractFactory("NuvaVault");
    const nuvaVault = await upgrades.deployProxy(
      NuvaVault,
      [
        await stakingVault.getAddress(),
        "Nuva Shares",
        "nuvUSDC",
        owner.address,
        await amlSigner.getAddress(), // NEW: Pass amlSigner address
      ],
      { kind: "uups" },
    );

    // 5. Deploy Router via Proxy
    const Router = await ethers.getContractFactory("DedicatedVaultRouter");
    const router = await upgrades.deployProxy(
      Router,
      [
        await assetVault.getAddress(),
        await stakingVault.getAddress(),
        await nuvaVault.getAddress(), // NEW: Pass nuvaVault address
        await amlSigner.getAddress(),
        await owner.getAddress(),
      ],
      { kind: "uups" },
    );

    // 6. Setup balances
    const amount = ethers.parseUnits("100", 18);
    await asset.mint(user.address, amount);

    // 7. Authorize router
    await nuvaVault
      .connect(owner)
      .addAuthorizedCaller(await router.getAddress());

    return {
      router,
      asset,
      assetVault,
      stakingVault,
      nuvaVault,
      owner,
      amlSigner,
      user,
      amount,
    }; // NEW: Return nuvaVault
  }

  // NEW: Fixture for deploying RedemptionProxy master copy
  async function deployRedemptionProxyFixture() {
    // Deploy RedemptionProxy master copy
    const RedemptionProxy = await ethers.getContractFactory("RedemptionProxy");
    const redemptionProxyImplementation = await RedemptionProxy.deploy();

    return { redemptionProxyImplementation };
  }

  async function signAML(
    signer,
    routerAddr,
    userAddr,
    amount,
    receiver,
    deadline,
  ) {
    const network = await ethers.provider.getNetwork();

    const domain = {
      name: "DedicatedVaultRouter",
      version: "1",
      chainId: network.chainId,
      verifyingContract: routerAddr,
    };

    const types = {
      Deposit: [
        { name: "sender", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "receiver", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const value = {
      sender: userAddr,
      amount: amount,
      receiver: receiver,
      deadline: deadline,
    };

    return await signer.signTypedData(domain, types, value);
  }

  async function signRedeemAML(
    signer,
    routerAddr,
    userAddr,
    amountNuvaShares,
    deadline,
  ) {
    const network = await ethers.provider.getNetwork();

    const domain = {
      name: "DedicatedVaultRouter",
      version: "1",
      chainId: network.chainId,
      verifyingContract: routerAddr,
    };

    const types = {
      Redeem: [
        { name: "sender", type: "address" },
        { name: "amountNuvaShares", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const value = {
      sender: userAddr,
      amountNuvaShares: amountNuvaShares,
      deadline: deadline,
    };

    return await signer.signTypedData(domain, types, value);
  }

  it("Should complete a double-hop deposit with a valid AML signature", async function () {
    const { router, asset, user, amlSigner, amount } =
      await loadFixture(deployRouterFixture);

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const minVault = 0n;
    const minStaking = 0n;
    const minNuva = 0n; // NEW

    // Standard approval (Permit is tried/skipped in contract)
    await asset.connect(user).approve(await router.getAddress(), amount);

    // Generate Signature
    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline,
    );

    // Execute
    const expectedNuvaShares = amount * 1000000000000n; // NuvaVault has decimalsOffset = 12
    await expect(
      router.connect(user).depositWithPermit(
        amount,
        user.address,
        minVault,
        minStaking,
        minNuva, // NEW
        signature,
        deadline,
        0, // permitDeadline
        0, // v
        ethers.ZeroHash, // r
        ethers.ZeroHash, // s
      ),
    )
      .to.emit(router, "Deposited")
      .withArgs(
        user.address,
        user.address,
        amount,
        amount,
        amount,
        expectedNuvaShares,
      );
  }); // FIX: Added missing closing brace

  it("Should revert if the AML signature is tampered with", async function () {
    const { router, amlSigner, user, amount } =
      await loadFixture(deployRouterFixture);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // Sign for 0 slippage
    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline,
    ); // NEW: Added 0n for minNuva

    // Attempt to execute with tampered deadline (Signature mismatch)
    await expect(
      router.connect(user).depositWithPermit(
        amount,
        user.address,
        50n,
        0n,
        0n,
        signature,
        deadline + 1,
        0,
        0,
        ethers.ZeroHash,
        ethers.ZeroHash, // NEW: Added 0n for minNuvaVaultSharesOut
      ),
    ).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
  });

  it("Should revert if the AML signature has expired", async function () {
    const { router, amlSigner, user, amount } =
      await loadFixture(deployRouterFixture);
    const pastDeadline = Math.floor(Date.now() / 1000) - 60; // 1 minute ago

    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      pastDeadline,
    ); // NEW: Added 0n for minNuva

    await expect(
      router.connect(user).depositWithPermit(
        amount,
        user.address,
        0n,
        0n,
        0n,
        signature,
        pastDeadline,
        0,
        0,
        ethers.ZeroHash,
        ethers.ZeroHash, // NEW: Added 0n for minNuvaVaultSharesOut
      ),
    ).to.be.revertedWithCustomError(router, "AmlSignatureExpired");
  });

  it("Should revert if the AML deadline is too far in the future", async function () {
    const { router, amlSigner, user, amount } =
      await loadFixture(deployRouterFixture);
    const futureDeadline =
      (await ethers.provider.getBlock("latest")).timestamp + 86400 * 2; // 2 days in the future

    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      futureDeadline,
    );

    await expect(
      router
        .connect(user)
        .depositWithPermit(
          amount,
          user.address,
          0n,
          0n,
          0n,
          signature,
          futureDeadline,
          0,
          0,
          ethers.ZeroHash,
          ethers.ZeroHash,
        ),
    ).to.be.revertedWithCustomError(router, "AmlDeadlineTooLong");
  });

  it("Should prevent reusing the same AML signature", async function () {
    const { router, asset, user, amlSigner, amount } =
      await loadFixture(deployRouterFixture);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await asset.connect(user).approve(await router.getAddress(), amount * 2n);
    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline,
    ); // NEW: Added 0n for minNuva

    // First use: Success
    await router
      .connect(user)
      .depositWithPermit(
        amount,
        user.address,
        0n,
        0n,
        0n,
        signature,
        deadline,
        0,
        0,
        ethers.ZeroHash,
        ethers.ZeroHash,
      ); // NEW: Added 0n for minNuvaVaultSharesOut

    // Second use: Revert
    await expect(
      router.connect(user).depositWithPermit(
        amount,
        user.address,
        0n,
        0n,
        0n,
        signature,
        deadline,
        0,
        0,
        ethers.ZeroHash,
        ethers.ZeroHash, // NEW: Added 0n for minNuvaVaultSharesOut
      ),
    ).to.be.revertedWithCustomError(router, "AmlSignatureAlreadyUsed");
  });

  it("Should revert if the vault returns fewer shares than minVaultSharesOut", async function () {
    const { router, asset, user, amlSigner, amount } =
      await loadFixture(deployRouterFixture);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // We expect 100 shares, but we demand 101 (impossible)
    const minVaultOut = amount + 1n;

    await asset.connect(user).approve(await router.getAddress(), amount);
    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline,
    ); // NEW: Added 0n for minNuva

    await expect(
      router.connect(user).depositWithPermit(
        amount,
        user.address,
        minVaultOut,
        0n,
        0n,
        signature,
        deadline,
        0,
        0,
        ethers.ZeroHash,
        ethers.ZeroHash, // NEW: Added 0n for minNuvaVaultSharesOut
      ),
    ).to.be.revertedWithCustomError(router, "SlippageExceeded");
  });

  it("Should revert if the receiver does not match the signed receiver", async function () {
    const { router, asset, user, amlSigner, amount } =
      await loadFixture(deployRouterFixture);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const attacker = (await ethers.getSigners())[4];

    // Signature is for user.address
    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline,
    ); // NEW: Added 0n for minNuva

    await asset.connect(user).approve(await router.getAddress(), amount);

    // Attempt to send shares to attacker instead of user
    await expect(
      router.connect(user).depositWithPermit(
        amount,
        attacker.address,
        0n,
        0n,
        0n,
        signature,
        deadline,
        0,
        0,
        ethers.ZeroHash,
        ethers.ZeroHash, // NEW: Added 0n for minNuvaVaultSharesOut
      ),
    ).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
  });

  it("Should still deposit via standard approval if permit fails (Incompatibility Test)", async function () {
    const { router, asset, user, amlSigner, amount } =
      await loadFixture(deployRouterFixture);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // 1. Manually approve the router (Simulating a token without Permit support)
    await asset.connect(user).approve(await router.getAddress(), amount);

    // 2. Generate AML signature (This is still required by your contract logic)
    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline,
    ); // NEW: Added 0n for minNuva

    // 3. Call with GARBAGE permit data (v=0, r/s=Zero)
    // The try/catch will swallow the permit failure, and safeTransferFrom will use the manual approval.
    const expectedNuvaShares = amount * 1000000000000n;
    await expect(
      router.connect(user).depositWithPermit(
        amount,
        user.address,
        0n,
        0n,
        0n,
        signature,
        deadline,
        0,
        0,
        ethers.ZeroHash,
        ethers.ZeroHash, // NEW: Added 0n for minNuvaVaultSharesOut
      ),
    )
      .to.emit(router, "Deposited")
      .withArgs(
        user.address,
        user.address,
        amount,
        amount,
        amount,
        expectedNuvaShares,
      );
  });

  it("Should upgrade the contract and preserve state", async function () {
    const { router, amlSigner, nuvaVault, owner } =
      await loadFixture(deployRouterFixture); // NEW: Added nuvaVault

    // 1. Capture state before upgrade
    const amlSignerBefore = await router.amlSigner();
    const nuvaVaultBefore = await router.nuvaVault(); // NEW: Capture nuvaVault state

    // 2. Upgrade to V2
    const RouterV2Factory = await ethers.getContractFactory(
      "DedicatedVaultRouterV2",
    );
    const initialFee = 100n; // 1%
    const upgraded = await upgrades.upgradeProxy(
      await router.getAddress(),
      RouterV2Factory,
      {
        call: { fn: "initializeV2", args: [initialFee] },
        kind: "uups",
      },
    );

    // 3. Verify state is preserved
    expect(await upgraded.amlSigner()).to.equal(amlSignerBefore);
    expect(await upgraded.nuvaVault()).to.equal(nuvaVaultBefore); // NEW: Verify nuvaVault state

    // 4. Verify new logic works
    expect(await upgraded.version()).to.equal("V2");
    expect(await upgraded.routerFee()).to.equal(initialFee);
    const newFee = 200n; // 2%
    await expect(upgraded.connect(owner).setRouterFee(newFee))
      .to.emit(upgraded, "RouterFeeUpdated")
      .withArgs(initialFee, newFee);
    expect(await upgraded.routerFee()).to.equal(newFee);
  });

  it("Should verify that variables occupy the correct storage slots", async function () {
    const { router, amlSigner, nuvaVault } =
      await loadFixture(deployRouterFixture); // NEW: Added nuvaVault

    // Slot 0: assetVault (address)
    // Slot 1: asset (address)
    // Slot 2: stakingVault (address)
    // Slot 3: stakingAsset (address)
    // Slot 4: nuvaVault (address) // NEW
    // Slot 5: nuvaAsset (address) // NEW
    // Slot 6: amlSigner (address) // UPDATED

    const slot4Value = await ethers.provider.getStorage(
      await router.getAddress(),
      4,
    ); // Check nuvaVault at slot 4
    const normalizedNuvaVault = ethers
      .zeroPadValue(await nuvaVault.getAddress(), 32)
      .toLowerCase(); // NEW
    expect(slot4Value.toLowerCase()).to.equal(
      normalizedNuvaVault,
      "nuvaVault is not in Slot 4!",
    ); // NEW

    const slot6Value = await ethers.provider.getStorage(
      await router.getAddress(),
      6,
    ); // Check amlSigner at slot 6
    const normalizedSigner = ethers
      .zeroPadValue(await amlSigner.getAddress(), 32)
      .toLowerCase();

    expect(slot6Value.toLowerCase()).to.equal(
      normalizedSigner,
      "amlSigner is not in Slot 6!",
    ); // UPDATED
  });

  it("Should verify the __gap starts after the used slots", async function () {
    const { router } = await loadFixture(deployRouterFixture);

    // Slot 11 should be the start of your uint256[39] gap.
    // Since it's uninitialized, it should be 0x00...00.
    const slot11Value = await ethers.provider.getStorage(
      await router.getAddress(),
      11,
    ); // UPDATED: Slot 11

    expect(slot11Value).to.equal(ethers.ZeroHash);
  });

  it("Should verify the physical storage layout matches the schema", async function () {
    const { router, assetVault, amlSigner, nuvaVault, owner } =
      await loadFixture(deployRouterFixture);
    const { redemptionProxyImplementation } = await loadFixture(
      deployRedemptionProxyFixture,
    );
    await router
      .connect(owner)
      .setRedemptionProxyImplementation(
        await redemptionProxyImplementation.getAddress(),
      );

    const routerAddress = await router.getAddress();
    const rawSlot0 = await ethers.provider.getStorage(routerAddress, 0);
    const expectedSlot0 = ethers
      .zeroPadValue(await assetVault.getAddress(), 32)
      .toLowerCase();
    expect(rawSlot0.toLowerCase()).to.equal(
      expectedSlot0,
      "assetVault is not in Slot 0!",
    );

    /**
     * SLOT 4: nuvaVault // NEW
     * 0: assetVault, 1: asset, 2: stakingVault, 3: stakingAsset, 4: nuvaVault
     */
    const rawSlot4 = await ethers.provider.getStorage(routerAddress, 4);
    const expectedSlot4 = ethers
      .zeroPadValue(await nuvaVault.getAddress(), 32)
      .toLowerCase();
    expect(rawSlot4.toLowerCase()).to.equal(
      expectedSlot4,
      "nuvaVault is not in Slot 4!",
    );

    /**
     * SLOT 5: nuvaAsset // NEW
     */
    const rawSlot5 = await ethers.provider.getStorage(routerAddress, 5);
    const expectedSlot5 = ethers
      .zeroPadValue(
        await (
          await ethers.getContractAt("IERC4626", await nuvaVault.getAddress())
        ).asset(),
        32,
      )
      .toLowerCase();
    expect(rawSlot5.toLowerCase()).to.equal(
      expectedSlot5,
      "nuvaAsset is not in Slot 5!",
    );

    /**
     * SLOT 6: amlSigner
     */
    const rawSlot6 = await ethers.provider.getStorage(routerAddress, 6);
    const expectedSlot6 = ethers
      .zeroPadValue(await amlSigner.getAddress(), 32)
      .toLowerCase();
    expect(rawSlot6.toLowerCase()).to.equal(
      expectedSlot6,
      "amlSigner is not in Slot 6!",
    );

    /**
     * SLOT 7: redemptionProxyImplementation // NEW
     */
    const rawSlot7 = await ethers.provider.getStorage(routerAddress, 7);
    const expectedSlot7 = ethers
      .zeroPadValue(await redemptionProxyImplementation.getAddress(), 32)
      .toLowerCase();
    expect(rawSlot7.toLowerCase()).to.equal(
      expectedSlot7,
      "redemptionProxyImplementation is not in Slot 7!",
    );

    /**
     * SLOT 8: redemptionProxyToUser (mapping base)
     */
    const rawSlot8 = await ethers.provider.getStorage(routerAddress, 8);
    expect(rawSlot8).to.equal(
      ethers.ZeroHash,
      "redemptionProxyToUser mapping base slot is not zero!",
    );

    /**
     * SLOT 9: redemptionProxyToTimestamp (mapping base)
     */
    const rawSlot9 = await ethers.provider.getStorage(routerAddress, 9);
    expect(rawSlot9).to.equal(
      ethers.ZeroHash,
      "redemptionProxyToTimestamp mapping base slot is not zero!",
    );

    /**
     * SLOT 10: usedSignatures (mapping base)
     */
    const rawSlot10 = await ethers.provider.getStorage(routerAddress, 10);
    expect(rawSlot10).to.equal(
      ethers.ZeroHash,
      "usedSignatures mapping base slot is not zero!",
    );

    /**
     * SLOT 11: The Gap Start
     * Your gap is uint256[39] private __gap;
     * It starts here. If Slot 11 is non-zero, you have a collision.
     */
    const rawSlot11 = await ethers.provider.getStorage(routerAddress, 11);
    expect(rawSlot11).to.equal(
      ethers.ZeroHash,
      "Storage gap collision detected at Slot 11",
    );
  });

  it("Should verify ReentrancyGuard is in Namespaced Storage and base slots are clear", async function () {
    const { router } = await loadFixture(deployRouterFixture);
    const routerAddress = await router.getAddress();

    // 1. Verify Slot 11 is empty (Confirming it's part of your __gap now)
    const rawSlot11 = await ethers.provider.getStorage(routerAddress, 11);
    expect(ethers.toBigInt(rawSlot11)).to.equal(
      0n,
      "Slot 11 should be empty (part of the gap)",
    );

    // 2. Calculate the ERC-7201 Namespaced Slot for ReentrancyGuard
    // Formula: keccak256(keccak256("openzeppelin.storage.ReentrancyGuard") - 1) & ~0xff
    const namespace = "openzeppelin.storage.ReentrancyGuard";
    const baseSlot = ethers.keccak256(ethers.toUtf8Bytes(namespace));
    const reentrancySlot =
      BigInt(ethers.keccak256(ethers.toBeArray(BigInt(baseSlot) - 1n))) &
      ~0xffn;

    // 3. Look up the value at that specific hashed location
    const namespacedValue = await ethers.provider.getStorage(
      routerAddress,
      reentrancySlot,
    );

    // It should be 1 (NOT_ENTERED)
    expect(ethers.toBigInt(namespacedValue)).to.equal(
      1n,
      "ReentrancyGuard not found in Namespaced Storage",
    );

    console.log(
      "Verified: ReentrancyGuard is safely hidden at Namespaced Slot:",
      reentrancySlot.toString(16),
    );
  });

  it("Should complete a standard deposit with manual approval", async function () {
    const { router, asset, user, amlSigner, amount, nuvaVault } =
      await loadFixture(deployRouterFixture); // NEW: Added nuvaVault
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // 1. Manual Approval (Simulating the 'Standard' way)
    await asset.connect(user).approve(await router.getAddress(), amount);

    // 2. Generate AML Signature
    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline, // NEW: Added 0n for minNuva
    );

    // 3. Execute standard deposit
    const expectedNuvaShares = amount * 1000000000000n;
    await expect(
      router.connect(user).deposit(
        amount,
        user.address,
        0n,
        0n,
        0n, // NEW: minNuvaVaultSharesOut
        signature,
        deadline,
      ),
    )
      .to.emit(router, "Deposited")
      .withArgs(
        user.address,
        user.address,
        amount,
        amount,
        amount,
        expectedNuvaShares,
      );

    // Verify final shares reached the user
    // (Assuming your MockVault gives 1:1 shares)
    expect(
      await (
        await ethers.getContractAt("NuvaVault", await nuvaVault.getAddress())
      ).balanceOf(user.address),
    ).to.equal(expectedNuvaShares);
  });

  it("Should successfully deposit into the Nuva Vault and emit Deposited event", async function () {
    const { router, asset, user, amlSigner, amount, nuvaVault } =
      await loadFixture(deployRouterFixture);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await asset.connect(user).approve(await router.getAddress(), amount);

    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline,
    );

    const expectedNuvaShares = amount * 1000000000000n;
    await expect(
      router
        .connect(user)
        .deposit(amount, user.address, 0n, 0n, 0n, signature, deadline),
    )
      .to.emit(router, "Deposited")
      .withArgs(
        user.address,
        user.address,
        amount,
        amount,
        amount,
        expectedNuvaShares,
      );

    // Verify final shares reached the user in Nuva Vault
    expect(
      await (
        await ethers.getContractAt("NuvaVault", await nuvaVault.getAddress())
      ).balanceOf(user.address),
    ).to.equal(expectedNuvaShares);
  });

  it("Should revert if deposit is called without prior approval", async function () {
    const { router, user, amlSigner, amount } =
      await loadFixture(deployRouterFixture);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // We skip asset.approve(...) here

    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline, // NEW: Added 0n for minNuva
    );

    // Should revert because the Router doesn't have allowance to pull tokens
    // Note: Standard OpenZeppelin ERC20s revert with 'ERC20InsufficientAllowance'
    await expect(
      router.connect(user).deposit(
        amount,
        user.address,
        0n,
        0n,
        0n, // NEW: minNuvaVaultSharesOut
        signature,
        deadline,
      ),
    ).to.be.revertedWithCustomError(
      await ethers.getContractAt("MockERC20", await router.asset()),
      "ERC20InsufficientAllowance",
    );
  });

  it("Should revert if deposit (standard) is called with a tampered AML signature", async function () {
    const { router, asset, user, amlSigner, amount } =
      await loadFixture(deployRouterFixture);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await asset.connect(user).approve(await router.getAddress(), amount);

    // Sign for 0 slippage
    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline,
    );

    // Attempt to execute with tampered deadline (Signature mismatch)
    await expect(
      router
        .connect(user)
        .deposit(amount, user.address, 50n, 0n, 0n, signature, deadline + 1),
    ).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
  });

  it("Should revert if deposit (standard) is called with an expired AML signature", async function () {
    const { router, asset, user, amlSigner, amount } =
      await loadFixture(deployRouterFixture);
    const pastDeadline = Math.floor(Date.now() / 1000) - 60; // 1 minute ago

    await asset.connect(user).approve(await router.getAddress(), amount);

    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      pastDeadline,
    );

    await expect(
      router
        .connect(user)
        .deposit(amount, user.address, 0n, 0n, 0n, signature, pastDeadline),
    ).to.be.revertedWithCustomError(router, "AmlSignatureExpired");
  });

  it("Should revert if deposit (standard) is called with an AML deadline too far in the future", async function () {
    const { router, asset, user, amlSigner, amount } =
      await loadFixture(deployRouterFixture);
    const futureDeadline =
      (await ethers.provider.getBlock("latest")).timestamp + 86400 * 2; // 2 days in the future
    console.log("Future Deadline:", futureDeadline);

    await asset.connect(user).approve(await router.getAddress(), amount);

    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      futureDeadline,
    );

    await expect(
      router
        .connect(user)
        .deposit(amount, user.address, 0n, 0n, 0n, signature, futureDeadline),
    ).to.be.revertedWithCustomError(router, "AmlDeadlineTooLong");
  });

  it("Should prevent reusing the same AML signature for standard deposit", async function () {
    const { router, asset, user, amlSigner, amount } =
      await loadFixture(deployRouterFixture);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await asset.connect(user).approve(await router.getAddress(), amount * 2n); // Approve for two deposits
    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline,
    );

    // First use: Success
    await router
      .connect(user)
      .deposit(amount, user.address, 0n, 0n, 0n, signature, deadline);

    // Second use: Revert
    await expect(
      router
        .connect(user)
        .deposit(amount, user.address, 0n, 0n, 0n, signature, deadline),
    ).to.be.revertedWithCustomError(router, "AmlSignatureAlreadyUsed");
  });

  it("Should revert if deposit (standard) returns fewer shares than minVaultSharesOut", async function () {
    const { router, asset, user, amlSigner, amount } =
      await loadFixture(deployRouterFixture);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // We expect 100 shares, but we demand 101 (impossible)
    const minVaultOut = amount + 1n;

    await asset.connect(user).approve(await router.getAddress(), amount);
    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline,
    );

    await expect(
      router
        .connect(user)
        .deposit(
          amount,
          user.address,
          minVaultOut,
          0n,
          0n,
          signature,
          deadline,
        ),
    ).to.be.revertedWithCustomError(router, "SlippageExceeded");
  });

  it("Should revert if deposit (standard) receiver does not match the signed receiver", async function () {
    const { router, asset, user, amlSigner, amount } =
      await loadFixture(deployRouterFixture);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const attacker = (await ethers.getSigners())[4];

    // Signature is for user.address
    const signature = await signAML(
      amlSigner,
      await router.getAddress(),
      user.address,
      amount,
      user.address,
      deadline,
    );

    await asset.connect(user).approve(await router.getAddress(), amount);

    // Attempt to send shares to attacker instead of user
    await expect(
      router
        .connect(user)
        .deposit(amount, attacker.address, 0n, 0n, 0n, signature, deadline),
    ).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
  });

  // NEW: Tests for Redemption Proxy functionality
  describe("Redemption Proxy", function () {
    it("Should allow owner to set redemption proxy implementation", async function () {
      const { router, owner } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );

      await expect(
        router
          .connect(owner)
          .setRedemptionProxyImplementation(
            await redemptionProxyImplementation.getAddress(),
          ),
      )
        .to.emit(router, "RedemptionProxyImplementationUpdated")
        .withArgs(
          ethers.ZeroAddress,
          await redemptionProxyImplementation.getAddress(),
        );

      expect(await router.redemptionProxyImplementation()).to.equal(
        await redemptionProxyImplementation.getAddress(),
      );
    });

    it("Should not allow non-owner to set redemption proxy implementation", async function () {
      const { router, user } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );

      await expect(
        router
          .connect(user)
          .setRedemptionProxyImplementation(
            await redemptionProxyImplementation.getAddress(),
          ),
      ).to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
    });

    it("Should revert if redemption proxy implementation is set to zero address", async function () {
      const { router, owner } = await loadFixture(deployRouterFixture);

      await expect(
        router
          .connect(owner)
          .setRedemptionProxyImplementation(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(
        router,
        "InvalidRedemptionProxyImplementation",
      );
    });

    it("Should allow a user to request redemption and create a RedemptionProxy clone", async function () {
      const {
        router,
        assetVault,
        stakingVault,
        nuvaVault,
        owner,
        user,
        amount,
        asset: routerAsset,
      } = await loadFixture(deployRouterFixture); // FIX: Destructure routerAsset
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );

      // Set the redemption proxy implementation
      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );

      // User first deposits to get nuvaShares
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const routerAddress = await router.getAddress(); // FIX: Define routerAddress for signAML
      await routerAsset.connect(user).approve(routerAddress, amount); // FIX: Use routerAsset
      const amlSigner = (await ethers.getSigners())[1]; // Get amlSigner for the deposit
      const signature = await signAML(
        amlSigner,
        routerAddress,
        user.address,
        amount,
        user.address,
        deadline,
      ); // FIX: Pass routerAddress
      await router
        .connect(user)
        .depositWithPermit(
          amount,
          user.address,
          0n,
          0n,
          0n,
          signature,
          deadline,
          0,
          0,
          ethers.ZeroHash,
          ethers.ZeroHash,
        );

      const userNuvaBalance = await nuvaVault.balanceOf(user.address);
      expect(userNuvaBalance).to.equal(amount * 1000000000000n);

      // Approve router to pull nuvaShares from user
      await nuvaVault.connect(user).approve(routerAddress, userNuvaBalance); // FIX: Use routerAddress

      // Request redemption
      const amountToRedeem = userNuvaBalance;
      const redeemDeadline = Math.floor(Date.now() / 1000) + 3600;
      const redeemSignature = await signRedeemAML(
        amlSigner,
        routerAddress,
        user.address,
        amountToRedeem,
        redeemDeadline,
      );

      const requestRedeemTx = await router
        .connect(user)
        .requestRedeem(amountToRedeem, 0n, redeemSignature, redeemDeadline);
      const requestRedeemReceipt = await requestRedeemTx.wait();
      const redemptionRequestedEvent = requestRedeemReceipt.logs.find(
        (log) => log.fragment && log.fragment.name === "RedemptionRequested",
      );
      const emittedUser = redemptionRequestedEvent.args[0];
      const redemptionProxyCloneAddress = redemptionRequestedEvent.args[1];

      await expect(requestRedeemTx)
        .to.emit(router, "RedemptionRequested")
        .withArgs(user.address, redemptionProxyCloneAddress, amountToRedeem);
      expect(redemptionProxyCloneAddress).to.not.equal(ethers.ZeroAddress);

      // Verify the clone's state variables (initialized correctly)
      const redemptionProxyClone = await ethers.getContractAt(
        "RedemptionProxy",
        redemptionProxyCloneAddress,
      );
      expect(await redemptionProxyClone.user()).to.equal(user.address);

      // Verify that user's nuvaBalance decreased
      expect(await nuvaVault.balanceOf(user.address)).to.equal(0n);
    });

    it("Should allow a user to request redemption using Permit", async function () {
      const {
        router,
        nuvaVault,
        owner,
        user,
        amount,
        asset: routerAsset,
        amlSigner,
      } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );

      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );

      // 1. Get Nuva Shares
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const routerAddress = await router.getAddress();
      await routerAsset.connect(user).approve(routerAddress, amount);
      const sigAML = await signAML(
        amlSigner,
        routerAddress,
        user.address,
        amount,
        user.address,
        deadline,
      );
      await router
        .connect(user)
        .depositWithPermit(
          amount,
          user.address,
          0n,
          0n,
          0n,
          sigAML,
          deadline,
          0,
          0,
          ethers.ZeroHash,
          ethers.ZeroHash,
        );

      const expectedNuvaBalance = amount * 1000000000000n;
      const userNuvaBalance = await nuvaVault.balanceOf(user.address);
      expect(userNuvaBalance).to.equal(expectedNuvaBalance);

      // 2. Generate Permit Signature for NuvaVault shares
      const nonce = await nuvaVault.nonces(user.address);
      const name = await nuvaVault.name();
      const network = await ethers.provider.getNetwork();

      const domain = {
        name: name,
        version: "1",
        chainId: network.chainId,
        verifyingContract: await nuvaVault.getAddress(),
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        owner: user.address,
        spender: routerAddress,
        value: userNuvaBalance,
        nonce: nonce,
        deadline: deadline,
      };

      const permitSignature = await user.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(permitSignature);

      // 3. Generate AML Signature for redemption
      const redeemDeadline = Math.floor(Date.now() / 1000) + 3600;
      const redeemSignature = await signRedeemAML(
        amlSigner,
        routerAddress,
        user.address,
        userNuvaBalance,
        redeemDeadline,
      );

      // 4. Request Redeem with Permit
      await expect(
        router
          .connect(user)
          .requestRedeemWithPermit(
            userNuvaBalance,
            0n,
            redeemSignature,
            redeemDeadline,
            deadline,
            v,
            r,
            s,
          ),
      ).to.emit(router, "RedemptionRequested");

      expect(await nuvaVault.balanceOf(user.address)).to.equal(0n);
    });

    it("Should revert if redemption AML signature is tampered with", async function () {
      const {
        router,
        nuvaVault,
        owner,
        user,
        amount,
        asset: routerAsset,
        amlSigner,
      } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );
      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );

      // 1. Get Nuva Shares
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const routerAddress = await router.getAddress();
      await routerAsset.connect(user).approve(routerAddress, amount);
      const sigAML = await signAML(
        amlSigner,
        routerAddress,
        user.address,
        amount,
        user.address,
        deadline,
      );
      await router
        .connect(user)
        .deposit(amount, user.address, 0n, 0n, 0n, sigAML, deadline);

      const userNuvaBalance = await nuvaVault.balanceOf(user.address);
      await nuvaVault.connect(user).approve(routerAddress, userNuvaBalance);

      // 2. Sign for one amount, try to redeem another
      const redeemDeadline = Math.floor(Date.now() / 1000) + 3600;
      const redeemSignature = await signRedeemAML(
        amlSigner,
        routerAddress,
        user.address,
        userNuvaBalance,
        redeemDeadline,
      );

      await expect(
        router
          .connect(user)
          .requestRedeem(
            userNuvaBalance - 1n,
            0n,
            redeemSignature,
            redeemDeadline,
          ),
      ).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
    });

    it("Should allow the owner to sweep redemptions from multiple proxies", async function () {
      const {
        router,
        nuvaVault,
        owner,
        user,
        amount,
        asset: routerAsset,
      } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );
      const user2 = (await ethers.getSigners())[4];
      const routerAddress = await router.getAddress();

      // 1. Setup Implementation
      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );

      // --- Helper to create a redemption ---
      async function createRedemption(targetUser) {
        // A. Deposit to get Nuva Shares
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const amlSigner = (await ethers.getSigners())[1];

        // Mint asset to user first if needed (fixture gives user 100, user2 needs funds)
        if (targetUser === user2) {
          await routerAsset.mint(targetUser.address, amount);
        }

        await routerAsset.connect(targetUser).approve(routerAddress, amount);
        const sig = await signAML(
          amlSigner,
          routerAddress,
          targetUser.address,
          amount,
          targetUser.address,
          deadline,
        );

        await router
          .connect(targetUser)
          .depositWithPermit(
            amount,
            targetUser.address,
            0n,
            0n,
            0n,
            sig,
            deadline,
            0,
            0,
            ethers.ZeroHash,
            ethers.ZeroHash,
          );

        // B. Request Redeem
        const nuvaShares = await nuvaVault.balanceOf(targetUser.address);
        await nuvaVault.connect(targetUser).approve(routerAddress, nuvaShares);

        const redeemDeadline = Math.floor(Date.now() / 1000) + 3600;
        const redeemSig = await signRedeemAML(
          amlSigner,
          routerAddress,
          targetUser.address,
          nuvaShares,
          redeemDeadline,
        );

        const tx = await router
          .connect(targetUser)
          .requestRedeem(nuvaShares, 0n, redeemSig, redeemDeadline);
        const receipt = await tx.wait();
        const event = receipt.logs.find(
          (log) => log.fragment && log.fragment.name === "RedemptionRequested",
        );
        return event.args[1]; // Returns proxyAddress
      }

      // 2. Create Redemptions
      const proxy1 = await createRedemption(user);
      const proxy2 = await createRedemption(user2);

      // 3. Simulate Async Unlock (Send USDC to the proxies)
      // The proxies now hold NuvaShares -> Locked. We simulate the underlying vault sending USDC to the proxy.
      await routerAsset.mint(proxy1, amount);
      await routerAsset.mint(proxy2, amount);

      // 4. Sweep
      // Must pass [ProxyAddress] and [Amount]
      const proxies = [proxy1, proxy2];
      const amounts = [amount, amount];

      const balanceBefore = await routerAsset.balanceOf(user.address);

      await expect(router.connect(owner).sweepRedemptions(proxies, amounts))
        .to.emit(router, "RedemptionsSwept")
        .withArgs(proxies, [user.address, user2.address], amounts, amount * 2n);

      // 5. Verify funds reached users
      expect(await routerAsset.balanceOf(user.address)).to.equal(
        balanceBefore + amount,
      );
      expect(await routerAsset.balanceOf(user2.address)).to.equal(amount); // user2 started with 0 (minted in helper used up)

      // 6. Verify Proxy mapping is cleared (Direct storage check or check if re-sweep fails)
      // Attempting to sweep again should yield 0 swept
      await expect(router.connect(owner).sweepRedemptions(proxies, amounts))
        .to.emit(router, "RedemptionsSwept")
        .withArgs(
          proxies,
          [ethers.ZeroAddress, ethers.ZeroAddress],
          amounts,
          0,
        );
    });

    it("Should sweep successfully when batch includes a non-existent proxy alongside valid proxies", async function () {
      const {
        router,
        nuvaVault,
        owner,
        user,
        amount,
        asset: routerAsset,
      } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );
      const user2 = (await ethers.getSigners())[4];
      const routerAddress = await router.getAddress();

      // 1. Setup Implementation
      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );

      // --- Helper to create a redemption ---
      async function createRedemption(targetUser) {
        // A. Deposit to get Nuva Shares
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const amlSigner = (await ethers.getSigners())[1];

        // Mint asset to user first if needed (fixture gives user 100, user2 needs funds)
        if (targetUser === user2) {
          await routerAsset.mint(targetUser.address, amount);
        }

        await routerAsset.connect(targetUser).approve(routerAddress, amount);
        const sig = await signAML(
          amlSigner,
          routerAddress,
          targetUser.address,
          amount,
          targetUser.address,
          deadline,
        );

        await router
          .connect(targetUser)
          .deposit(amount, targetUser.address, 0n, 0n, 0n, sig, deadline);

        // B. Request Redemption
        const expectedNuvaShares = await nuvaVault.balanceOf(
          targetUser.address,
        );
        await nuvaVault
          .connect(targetUser)
          .approve(routerAddress, expectedNuvaShares);

        const sigAML = await signRedeemAML(
          amlSigner,
          routerAddress,
          targetUser.address,
          expectedNuvaShares,
          deadline,
        );

        const tx = await router
          .connect(targetUser)
          .requestRedeem(expectedNuvaShares, 0n, sigAML, deadline);
        const receipt = await tx.wait();

        const event = receipt.logs.find(
          (log) => log.fragment && log.fragment.name === "RedemptionRequested",
        );
        return event.args[1]; // Returns proxyAddress
      }

      // 2. Create Redemptions
      const proxy1 = await createRedemption(user);
      const proxy2 = await createRedemption(user2);

      // 3. Simulate Async Unlock (Send USDC to the proxies)
      await routerAsset.mint(proxy1, amount);
      await routerAsset.mint(proxy2, amount);

      // 4. Sweep with an invalid proxy in the middle
      const nonExistentProxy = (await ethers.getSigners())[5].address;
      const proxies = [proxy1, nonExistentProxy, proxy2];
      const amounts = [amount, 0n, amount];

      const balanceBeforeUser1 = await routerAsset.balanceOf(user.address);

      await expect(router.connect(owner).sweepRedemptions(proxies, amounts))
        .to.emit(router, "RedemptionsSwept")
        .withArgs(
          proxies,
          [user.address, ethers.ZeroAddress, user2.address],
          amounts,
          amount * 2n,
        );

      // 5. Verify funds reached users
      expect(await routerAsset.balanceOf(user.address)).to.equal(
        balanceBeforeUser1 + amount,
      );
      expect(await routerAsset.balanceOf(user2.address)).to.equal(amount);
    });

    it("Should handle sweeping of non-existent or already swept redemptions", async function () {
      const { router, owner } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );

      // Set the redemption proxy implementation
      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );

      // Attempt to sweep a non-existent user address - should not revert, just emit 0 swept
      const nonExistentUser = (await ethers.getSigners())[5].address;
      await expect(
        router.connect(owner).sweepRedemptions([nonExistentUser], [0n]),
      )
        .to.emit(router, "RedemptionsSwept")
        .withArgs([nonExistentUser], [ethers.ZeroAddress], [0n], 0);
    });

    it("Should correctly manage mapping deletion for full and partial sweeps", async function () {
      const {
        router,
        nuvaVault,
        owner,
        user,
        amount,
        asset: routerAsset,
      } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );
      const user2 = (await ethers.getSigners())[4];
      const routerAddress = await router.getAddress();

      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );

      // Helper to create a redemption
      async function createRedemption(targetUser) {
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const amlSigner = (await ethers.getSigners())[1];

        if (targetUser === user2) {
          await routerAsset.mint(targetUser.address, amount);
        }

        await routerAsset.connect(targetUser).approve(routerAddress, amount);
        const sig = await signAML(
          amlSigner,
          routerAddress,
          targetUser.address,
          amount,
          targetUser.address,
          deadline,
        );

        await router
          .connect(targetUser)
          .depositWithPermit(
            amount,
            targetUser.address,
            0n,
            0n,
            0n,
            sig,
            deadline,
            0,
            0,
            ethers.ZeroHash,
            ethers.ZeroHash,
          );

        const nuvaShares = await nuvaVault.balanceOf(targetUser.address);
        await nuvaVault.connect(targetUser).approve(routerAddress, nuvaShares);

        const redeemDeadline = Math.floor(Date.now() / 1000) + 3600;
        const redeemSig = await signRedeemAML(
          amlSigner,
          routerAddress,
          targetUser.address,
          nuvaShares,
          redeemDeadline,
        );

        const tx = await router
          .connect(targetUser)
          .requestRedeem(nuvaShares, 0n, redeemSig, redeemDeadline);
        const receipt = await tx.wait();
        const event = receipt.logs.find(
          (log) => log.fragment && log.fragment.name === "RedemptionRequested",
        );
        return event.args[1];
      }

      // 1. Create Redemptions for both users
      const proxy1 = await createRedemption(user);
      const proxy2 = await createRedemption(user2);

      // 2. Fund Proxies
      await routerAsset.mint(proxy1, amount);
      await routerAsset.mint(proxy2, amount);

      // --- Scenario A: Full Sweep ---
      // Sweeping the full amount in one go should delete the mapping immediately
      const fullSweepTx = await router
        .connect(owner)
        .sweepRedemptions([proxy1], [amount]);
      await expect(fullSweepTx)
        .to.emit(router, "RedemptionsSwept")
        .withArgs([proxy1], [user.address], [amount], amount);

      // Verify mapping for proxy1 is deleted by attempting another sweep
      const extraAmount = 100n;
      const extraSweepTx = await router
        .connect(owner)
        .sweepRedemptions([proxy1], [extraAmount]);
      await expect(extraSweepTx)
        .to.emit(router, "RedemptionsSwept")
        .withArgs([proxy1], [ethers.ZeroAddress], [extraAmount], 0);

      // --- Scenario B: Multiple Partial Sweeps ---
      const firstHalf = amount / 2n;
      const secondHalf = amount - firstHalf;

      // First Sweep on proxy2
      // Mapping should NOT be deleted because balance > 0
      const partialSweep1Tx = await router
        .connect(owner)
        .sweepRedemptions([proxy2], [firstHalf]);
      await expect(partialSweep1Tx)
        .to.emit(router, "RedemptionsSwept")
        .withArgs([proxy2], [user2.address], [firstHalf], firstHalf);

      // Second Sweep on proxy2 - Sweeps the remaining balance
      // Mapping should be deleted after this because balance becomes 0
      const partialSweep2Tx = await router
        .connect(owner)
        .sweepRedemptions([proxy2], [secondHalf]);
      await expect(partialSweep2Tx)
        .to.emit(router, "RedemptionsSwept")
        .withArgs([proxy2], [user2.address], [secondHalf], secondHalf);

      // Verify mapping for proxy2 is deleted by attempting a third sweep
      const finalSweepTx = await router
        .connect(owner)
        .sweepRedemptions([proxy2], [extraAmount]);
      await expect(finalSweepTx)
        .to.emit(router, "RedemptionsSwept")
        .withArgs([proxy2], [ethers.ZeroAddress], [extraAmount], 0);
    });

    it("Should allow a designated keeper to sweep redemptions", async function () {
      const {
        router,
        owner,
        user,
        amount,
        asset: routerAsset,
        nuvaVault,
      } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );
      const keeper = (await ethers.getSigners())[6];
      const KEEPER_ROLE = await router.KEEPER_ROLE();

      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );
      await router.connect(owner).addKeeper(keeper.address);

      // 1. Setup Redemption
      const routerAddress = await router.getAddress();
      await routerAsset.connect(user).approve(routerAddress, amount);
      const sig = await signAML(
        (await ethers.getSigners())[1],
        routerAddress,
        user.address,
        amount,
        user.address,
        Math.floor(Date.now() / 1000) + 3600,
      );
      await router
        .connect(user)
        .depositWithPermit(
          amount,
          user.address,
          0n,
          0n,
          0n,
          sig,
          Math.floor(Date.now() / 1000) + 3600,
          0,
          0,
          ethers.ZeroHash,
          ethers.ZeroHash,
        );

      const nuvaShares = await nuvaVault.balanceOf(user.address);
      await nuvaVault.connect(user).approve(routerAddress, nuvaShares);

      const redeemDeadline = Math.floor(Date.now() / 1000) + 3600;
      const redeemSig = await signRedeemAML(
        (await ethers.getSigners())[1],
        routerAddress,
        user.address,
        nuvaShares,
        redeemDeadline,
      );

      const tx = await router
        .connect(user)
        .requestRedeem(nuvaShares, 0n, redeemSig, redeemDeadline);
      const receipt = await tx.wait();
      const proxyAddress = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "RedemptionRequested",
      ).args[1];

      await routerAsset.mint(proxyAddress, amount);

      // 2. Keeper Sweep
      await expect(
        router.connect(keeper).sweepRedemptions([proxyAddress], [amount]),
      )
        .to.emit(router, "RedemptionsSwept")
        .withArgs([proxyAddress], [user.address], [amount], amount);

      expect(await routerAsset.balanceOf(user.address)).to.be.at.least(amount);
    });

    it("Should revert if a non-keeper attempts to sweep", async function () {
      const { router, user } = await loadFixture(deployRouterFixture);
      const KEEPER_ROLE = await router.KEEPER_ROLE();

      await expect(
        router.connect(user).sweepRedemptions([ethers.ZeroAddress], [0n]),
      )
        .to.be.revertedWithCustomError(
          router,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(user.address, KEEPER_ROLE);
    });

    it("Should allow admin to add and remove keeper", async function () {
      const { router, owner } = await loadFixture(deployRouterFixture);
      const keeper = (await ethers.getSigners())[7];
      const KEEPER_ROLE = await router.KEEPER_ROLE();

      // Add
      await expect(router.connect(owner).addKeeper(keeper.address))
        .to.emit(router, "RoleGranted")
        .withArgs(KEEPER_ROLE, keeper.address, owner.address);
      expect(await router.hasRole(KEEPER_ROLE, keeper.address)).to.be.true;

      // Remove
      await expect(router.connect(owner).removeKeeper(keeper.address))
        .to.emit(router, "RoleRevoked")
        .withArgs(KEEPER_ROLE, keeper.address, owner.address);
      expect(await router.hasRole(KEEPER_ROLE, keeper.address)).to.be.false;
    });

    it("Should prevent non-admins from managing keepers", async function () {
      const { router, user } = await loadFixture(deployRouterFixture);
      const otherUser = (await ethers.getSigners())[8];

      await expect(router.connect(user).addKeeper(otherUser.address))
        .to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount")
        .withArgs(user.address);

      await expect(router.connect(user).removeKeeper(otherUser.address))
        .to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount")
        .withArgs(user.address);
    });

    it("Should allow a user to sweep their own proxy after 7 days", async function () {
      const {
        router,
        nuvaVault,
        owner,
        user,
        amount,
        asset: routerAsset,
      } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );

      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );

      const routerAddress = await router.getAddress();
      const amlSigner = (await ethers.getSigners())[1];
      const depDeadline =
        (await ethers.provider.getBlock("latest")).timestamp + 3600;
      await routerAsset.connect(user).approve(routerAddress, amount);
      const depSignature = await signAML(
        amlSigner,
        routerAddress,
        user.address,
        amount,
        user.address,
        depDeadline,
      );
      await router
        .connect(user)
        .depositWithPermit(
          amount,
          user.address,
          0n,
          0n,
          0n,
          depSignature,
          depDeadline,
          0,
          0,
          ethers.ZeroHash,
          ethers.ZeroHash,
        );

      const nuvaShares = await nuvaVault.balanceOf(user.address);
      await nuvaVault.connect(user).approve(routerAddress, nuvaShares);

      const deadline =
        (await ethers.provider.getBlock("latest")).timestamp + 3600;
      const redSig = await signRedeemAML(
        amlSigner,
        routerAddress,
        user.address,
        nuvaShares,
        deadline,
      );

      const tx = await router
        .connect(user)
        .requestRedeem(nuvaShares, 0n, redSig, deadline);
      const receipt = await tx.wait();
      const proxyAddress = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "RedemptionRequested",
      ).args[1];

      await time.increase(7 * 24 * 60 * 60 + 1);

      // Simulate proxy receiving assets from async payout
      const sweepAmount = 100n;
      await routerAsset.mint(proxyAddress, sweepAmount);

      await expect(router.connect(user).sweepUserRedemption(proxyAddress))
        .to.emit(router, "RedemptionsSwept")
        .withArgs([proxyAddress], [user.address], [sweepAmount], sweepAmount);

      expect(await router.redemptionProxyToUser(proxyAddress)).to.equal(
        ethers.ZeroAddress,
      );
      expect(await router.redemptionProxyToTimestamp(proxyAddress)).to.equal(
        0n,
      );
    });

    it("Should revert if user tries to sweep before 7 days", async function () {
      const {
        router,
        nuvaVault,
        owner,
        user,
        amount,
        asset: routerAsset,
      } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );

      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );

      const routerAddress = await router.getAddress();
      const amlSigner = (await ethers.getSigners())[1];
      const depDeadline =
        (await ethers.provider.getBlock("latest")).timestamp + 3600;
      await routerAsset.connect(user).approve(routerAddress, amount);
      const depSignature = await signAML(
        amlSigner,
        routerAddress,
        user.address,
        amount,
        user.address,
        depDeadline,
      );
      await router
        .connect(user)
        .depositWithPermit(
          amount,
          user.address,
          0n,
          0n,
          0n,
          depSignature,
          depDeadline,
          0,
          0,
          ethers.ZeroHash,
          ethers.ZeroHash,
        );

      const nuvaShares = await nuvaVault.balanceOf(user.address);
      await nuvaVault.connect(user).approve(routerAddress, nuvaShares);

      const deadline =
        (await ethers.provider.getBlock("latest")).timestamp + 3600;
      const redSig = await signRedeemAML(
        amlSigner,
        routerAddress,
        user.address,
        nuvaShares,
        deadline,
      );

      const tx = await router
        .connect(user)
        .requestRedeem(nuvaShares, 0n, redSig, deadline);
      const receipt = await tx.wait();
      const proxyAddress = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "RedemptionRequested",
      ).args[1];

      await time.increase(2 * 24 * 60 * 60);

      await expect(
        router.connect(user).sweepUserRedemption(proxyAddress),
      ).to.be.revertedWithCustomError(router, "TimeoutNotReached");
    });

    it("Should revert if unauthorized user tries to sweep", async function () {
      const {
        router,
        nuvaVault,
        owner,
        user,
        amount,
        asset: routerAsset,
      } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );

      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );

      const routerAddress = await router.getAddress();
      const amlSigner = (await ethers.getSigners())[1];
      const depDeadline =
        (await ethers.provider.getBlock("latest")).timestamp + 3600;
      await routerAsset.connect(user).approve(routerAddress, amount);
      const depSignature = await signAML(
        amlSigner,
        routerAddress,
        user.address,
        amount,
        user.address,
        depDeadline,
      );
      await router
        .connect(user)
        .depositWithPermit(
          amount,
          user.address,
          0n,
          0n,
          0n,
          depSignature,
          depDeadline,
          0,
          0,
          ethers.ZeroHash,
          ethers.ZeroHash,
        );

      const nuvaShares = await nuvaVault.balanceOf(user.address);
      await nuvaVault.connect(user).approve(routerAddress, nuvaShares);

      const deadline =
        (await ethers.provider.getBlock("latest")).timestamp + 3600;
      const redSig = await signRedeemAML(
        amlSigner,
        routerAddress,
        user.address,
        nuvaShares,
        deadline,
      );

      const tx = await router
        .connect(user)
        .requestRedeem(nuvaShares, 0n, redSig, deadline);
      const receipt = await tx.wait();
      const proxyAddress = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "RedemptionRequested",
      ).args[1];

      await time.increase(8 * 24 * 60 * 60);

      const unauthorizedUser = (await ethers.getSigners())[5];

      await expect(
        router.connect(unauthorizedUser).sweepUserRedemption(proxyAddress),
      ).to.be.revertedWithCustomError(router, "Unauthorized");
    });
  });

  describe("Ownership Transfers (Ownable2Step)", function () {
    it("Should transfer ownership in two steps", async function () {
      const { router, owner } = await loadFixture(deployRouterFixture);
      const newOwner = (await ethers.getSigners())[5];

      await router.connect(owner).transferOwnership(newOwner.address);
      expect(await router.owner()).to.equal(owner.address); // Still old owner
      expect(await router.pendingOwner()).to.equal(newOwner.address);

      await router.connect(newOwner).acceptOwnership();
      expect(await router.owner()).to.equal(newOwner.address);
    });
  });

  describe("NuvaVault Authorized Callers", function () {
    it("Should allow the owner to add and remove authorized callers", async function () {
      const { nuvaVault, owner, user } = await loadFixture(deployRouterFixture);
      const vault = await ethers.getContractAt(
        "NuvaVault",
        await nuvaVault.getAddress(),
      );

      // Add user as authorized caller
      await expect(vault.connect(owner).addAuthorizedCaller(user.address))
        .to.emit(vault, "AuthorizedCallerAdded")
        .withArgs(user.address);
      expect(await vault.authorizedCallers(user.address)).to.be.true;

      // Remove user as authorized caller
      await expect(vault.connect(owner).removeAuthorizedCaller(user.address))
        .to.emit(vault, "AuthorizedCallerRemoved")
        .withArgs(user.address);
      expect(await vault.authorizedCallers(user.address)).to.be.false;
    });

    it("Should allow an authorized caller to add and remove another authorized caller", async function () {
      const { nuvaVault, owner, user } = await loadFixture(deployRouterFixture);
      const vault = await ethers.getContractAt(
        "NuvaVault",
        await nuvaVault.getAddress(),
      );

      // Owner adds user1
      await vault.connect(owner).addAuthorizedCaller(user.address);

      const user2 = (await ethers.getSigners())[4];

      // user1 (authorized) adds user2
      await expect(vault.connect(user).addAuthorizedCaller(user2.address))
        .to.emit(vault, "AuthorizedCallerAdded")
        .withArgs(user2.address);
      expect(await vault.authorizedCallers(user2.address)).to.be.true;

      // user1 (authorized) removes user2
      await expect(vault.connect(user).removeAuthorizedCaller(user2.address))
        .to.emit(vault, "AuthorizedCallerRemoved")
        .withArgs(user2.address);
      expect(await vault.authorizedCallers(user2.address)).to.be.false;
    });

    it("Should revert if an unauthorized user tries to add or remove a caller", async function () {
      const { nuvaVault, user } = await loadFixture(deployRouterFixture);
      const vault = await ethers.getContractAt(
        "NuvaVault",
        await nuvaVault.getAddress(),
      );
      const user2 = (await ethers.getSigners())[4];

      await expect(
        vault.connect(user).addAuthorizedCaller(user2.address),
      ).to.be.revertedWithCustomError(vault, "Unauthorized");

      await expect(
        vault.connect(user).removeAuthorizedCaller(user2.address),
      ).to.be.revertedWithCustomError(vault, "Unauthorized");
    });
  });

  describe("NuvaVault Pausing", function () {
    it("Should return 0 for maxDeposit, maxMint, maxWithdraw, and maxRedeem when paused, and >0 otherwise", async function () {
      const {
        router,
        nuvaVault,
        owner,
        user,
        amlSigner,
        amount,
        asset: routerAsset,
      } = await loadFixture(deployRouterFixture);
      const vault = await ethers.getContractAt(
        "NuvaVault",
        await nuvaVault.getAddress(),
      );

      // Perform an initial deposit so the user has shares to withdraw/redeem
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await routerAsset
        .connect(user)
        .approve(await router.getAddress(), amount);
      const signature = await signAML(
        amlSigner,
        await router.getAddress(),
        user.address,
        amount,
        user.address,
        deadline,
      );
      await router
        .connect(user)
        .deposit(amount, user.address, 0n, 0n, 0n, signature, deadline);

      // Verify non-zero before pause
      expect(await vault.maxDeposit(user.address)).to.not.equal(0n);
      expect(await vault.maxMint(user.address)).to.not.equal(0n);
      expect(await vault.maxWithdraw(user.address)).to.not.equal(0n);
      expect(await vault.maxRedeem(user.address)).to.not.equal(0n);

      // Pause the vault
      await vault.connect(owner).pause();
      expect(await vault.paused()).to.be.true;

      // Verify all are 0 when paused
      expect(await vault.maxDeposit(user.address)).to.equal(0n);
      expect(await vault.maxMint(user.address)).to.equal(0n);
      expect(await vault.maxWithdraw(user.address)).to.equal(0n);
      expect(await vault.maxRedeem(user.address)).to.equal(0n);

      // Unpause the vault
      await vault.connect(owner).unpause();
      expect(await vault.paused()).to.be.false;

      // Verify all are > 0 again after unpausing
      expect(await vault.maxDeposit(user.address)).to.not.equal(0n);
      expect(await vault.maxMint(user.address)).to.not.equal(0n);
      expect(await vault.maxWithdraw(user.address)).to.not.equal(0n);
      expect(await vault.maxRedeem(user.address)).to.not.equal(0n);
    });

    it("Should block deposits when NuvaVault is paused", async function () {
      const {
        router,
        nuvaVault,
        owner,
        user,
        amlSigner,
        amount,
        asset: routerAsset,
      } = await loadFixture(deployRouterFixture);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Pause the vault
      const vault = await ethers.getContractAt(
        "NuvaVault",
        await nuvaVault.getAddress(),
      );
      await vault.connect(owner).pause();
      expect(await vault.paused()).to.be.true;

      // Setup deposit
      await routerAsset
        .connect(user)
        .approve(await router.getAddress(), amount);
      const signature = await signAML(
        amlSigner,
        await router.getAddress(),
        user.address,
        amount,
        user.address,
        deadline,
      );

      // Attempt deposit (should revert because the final hop to NuvaVault is paused)
      await expect(
        router
          .connect(user)
          .deposit(amount, user.address, 0n, 0n, 0n, signature, deadline),
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");

      // Unpause and verify it works
      await vault.connect(owner).unpause();
      await expect(
        router
          .connect(user)
          .deposit(amount, user.address, 0n, 0n, 0n, signature, deadline),
      ).to.emit(router, "Deposited");
    });
  });

  describe("NuvaVault Upgradeability", function () {
    it("Should upgrade NuvaVault and preserve state", async function () {
      const { nuvaVault, owner, user, amount, amlSigner, router } =
        await loadFixture(deployRouterFixture);

      // 1. Setup initial state: Perform a deposit to NuvaVault
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const routerAddress = await router.getAddress();
      const routerAsset = await ethers.getContractAt(
        "MockERC20",
        await router.asset(),
      );
      await routerAsset.connect(user).approve(routerAddress, amount);

      const signature = await signAML(
        amlSigner,
        routerAddress,
        user.address,
        amount,
        user.address,
        deadline,
      );
      await router
        .connect(user)
        .deposit(amount, user.address, 0n, 0n, 0n, signature, deadline);

      const expectedNuvaShares = amount * 1000000000000n;
      const balanceBefore = await nuvaVault.balanceOf(user.address);
      const totalAssetsBefore = await nuvaVault.totalAssets();
      const ownerBefore = await nuvaVault.owner();
      const assetBefore = await nuvaVault.asset();

      expect(balanceBefore).to.equal(expectedNuvaShares);

      // 2. Upgrade to V2
      const NuvaVaultV2 = await ethers.getContractFactory("NuvaVaultV2");
      const initialLimit = ethers.parseEther("1000");
      const upgraded = await upgrades.upgradeProxy(
        await nuvaVault.getAddress(),
        NuvaVaultV2,
        {
          call: { fn: "initializeV2", args: [initialLimit] },
          kind: "uups",
        },
      );

      // 3. Verify state is preserved
      expect(await upgraded.balanceOf(user.address)).to.equal(balanceBefore);
      expect(await upgraded.totalAssets()).to.equal(totalAssetsBefore);
      expect(await upgraded.owner()).to.equal(ownerBefore);
      expect(await upgraded.asset()).to.equal(assetBefore);

      // 4. Verify new logic works
      expect(await upgraded.version()).to.equal("V2");
      expect(await upgraded.withdrawalLimit()).to.equal(initialLimit);
      const newLimit = ethers.parseEther("2000");
      await expect(upgraded.connect(owner).setWithdrawalLimit(newLimit))
        .to.emit(upgraded, "WithdrawalLimitUpdated")
        .withArgs(initialLimit, newLimit);
      expect(await upgraded.withdrawalLimit()).to.equal(newLimit);
    });

    it("Should prevent non-owners from upgrading NuvaVault", async function () {
      const { nuvaVault, user } = await loadFixture(deployRouterFixture);
      const NuvaVaultV2 = await ethers.getContractFactory("NuvaVaultV2");

      await expect(
        upgrades.upgradeProxy(
          await nuvaVault.getAddress(),
          NuvaVaultV2.connect(user),
        ),
      )
        .to.be.revertedWithCustomError(nuvaVault, "OwnableUnauthorizedAccount")
        .withArgs(user.address);
    });
  });

  describe("Input Validation (New Changes)", function () {
    it("Should revert deposit if amount is zero", async function () {
      const { router, user, amlSigner } =
        await loadFixture(deployRouterFixture);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const signature = await signAML(
        amlSigner,
        await router.getAddress(),
        user.address,
        0n,
        user.address,
        deadline,
      );
      await expect(
        router
          .connect(user)
          .depositWithPermit(
            0n,
            user.address,
            0n,
            0n,
            0n,
            signature,
            deadline,
            0,
            0,
            ethers.ZeroHash,
            ethers.ZeroHash,
          ),
      ).to.be.revertedWithCustomError(router, "InvalidAmount");
    });

    it("Should revert deposit if receiver is zero address", async function () {
      const { router, user, amlSigner, amount } =
        await loadFixture(deployRouterFixture);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const signature = await signAML(
        amlSigner,
        await router.getAddress(),
        user.address,
        amount,
        ethers.ZeroAddress,
        deadline,
      );
      await expect(
        router
          .connect(user)
          .depositWithPermit(
            amount,
            ethers.ZeroAddress,
            0n,
            0n,
            0n,
            signature,
            deadline,
            0,
            0,
            ethers.ZeroHash,
            ethers.ZeroHash,
          ),
      ).to.be.revertedWithCustomError(router, "InvalidAddress");
    });

    it("Should revert requestRedeem if amount is zero", async function () {
      const { router, user, amlSigner } =
        await loadFixture(deployRouterFixture);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const signature = await signRedeemAML(
        amlSigner,
        await router.getAddress(),
        user.address,
        0n,
        deadline,
      );
      await expect(
        router.connect(user).requestRedeem(0n, 0n, signature, deadline),
      ).to.be.revertedWithCustomError(router, "InvalidAmount");
    });

    it("Should revert requestRedeem if amountAssetShares is less than minAssetsOut", async function () {
      const { router, user, owner, amlSigner, amount, asset } =
        await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );

      // Set RedemptionProxy master copy on the router
      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );

      // Setup: user makes a deposit to get NuvaShares
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await asset.connect(user).approve(await router.getAddress(), amount);
      const depositSignature = await signAML(
        amlSigner,
        await router.getAddress(),
        user.address,
        amount,
        user.address,
        deadline,
      );
      await router
        .connect(user)
        .deposit(amount, user.address, 0n, 0n, 0n, depositSignature, deadline);

      const nuvaVault = await ethers.getContractAt(
        "NuvaVault",
        await router.nuvaVault(),
      );
      const nuvaShares = await nuvaVault.balanceOf(user.address);
      await nuvaVault
        .connect(user)
        .approve(await router.getAddress(), nuvaShares);

      // Now request redemption with impossibly high minAssetsOut
      const redeemSignature = await signRedeemAML(
        amlSigner,
        await router.getAddress(),
        user.address,
        nuvaShares,
        deadline,
      );

      const impossibleMinAssetsOut = ethers.parseUnits("9999999999", 18);

      const tx = router
        .connect(user)
        .requestRedeem(
          nuvaShares,
          impossibleMinAssetsOut,
          redeemSignature,
          deadline,
        );

      const RedemptionProxy =
        await ethers.getContractFactory("RedemptionProxy");
      await expect(tx).to.be.revertedWithCustomError(
        RedemptionProxy,
        "SlippageExceeded",
      );
    });

    it("Should handle sweepRedemptions with zero proxy address", async function () {
      const { router, owner } = await loadFixture(deployRouterFixture);
      const { redemptionProxyImplementation } = await loadFixture(
        deployRedemptionProxyFixture,
      );
      const KEEPER_ROLE = await router.KEEPER_ROLE();
      await router.connect(owner).addKeeper(owner.address);

      // Set implementation first
      await router
        .connect(owner)
        .setRedemptionProxyImplementation(
          await redemptionProxyImplementation.getAddress(),
        );

      await expect(
        router.connect(owner).sweepRedemptions([ethers.ZeroAddress], [100n]),
      )
        .to.emit(router, "RedemptionsSwept")
        .withArgs([ethers.ZeroAddress], [ethers.ZeroAddress], [100n], 0);
    });

    it("Should NOT delete mapping in sweepRedemptions if amount is zero but proxy has balance", async function () {
      const {
        router,
        owner,
        user,
        amlSigner,
        amount,
        asset: routerAsset,
        nuvaVault,
      } = await loadFixture(deployRouterFixture);
      const KEEPER_ROLE = await router.KEEPER_ROLE();
      await router.connect(owner).addKeeper(owner.address);

      // 1. Setup a redemption proxy
      const RedemptionProxy =
        await ethers.getContractFactory("RedemptionProxy");
      const impl = await RedemptionProxy.deploy();
      await router
        .connect(owner)
        .setRedemptionProxyImplementation(await impl.getAddress());

      // 2. Do a deposit to have shares
      await routerAsset
        .connect(user)
        .approve(await router.getAddress(), amount);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const depSig = await signAML(
        amlSigner,
        await router.getAddress(),
        user.address,
        amount,
        user.address,
        deadline,
      );
      await router
        .connect(user)
        .depositWithPermit(
          amount,
          user.address,
          0n,
          0n,
          0n,
          depSig,
          deadline,
          0,
          0,
          ethers.ZeroHash,
          ethers.ZeroHash,
        );

      const nuvaShares = await nuvaVault.balanceOf(user.address);
      await nuvaVault
        .connect(user)
        .approve(await router.getAddress(), nuvaShares);

      const redSig = await signRedeemAML(
        amlSigner,
        await router.getAddress(),
        user.address,
        nuvaShares,
        deadline,
      );
      const tx = await router
        .connect(user)
        .requestRedeem(nuvaShares, 0n, redSig, deadline);
      const receipt = await tx.wait();
      const proxyAddress = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "RedemptionRequested",
      ).args[1];

      // Give proxy some balance so it is not considered "fully drained"
      await routerAsset.mint(proxyAddress, 100n);

      // 3. Sweep with zero amount
      await router.connect(owner).sweepRedemptions([proxyAddress], [0n]);

      // 4. Check if mapping is NOT deleted
      expect(await router.redemptionProxyToUser(proxyAddress)).to.equal(
        user.address,
      );
    });

    it("Should correctly clean up mapping in sweepRedemptions if amount is zero and proxy balance is zero", async function () {
      const {
        router,
        owner,
        user,
        amlSigner,
        amount,
        asset: routerAsset,
        nuvaVault,
      } = await loadFixture(deployRouterFixture);
      const KEEPER_ROLE = await router.KEEPER_ROLE();
      await router.connect(owner).addKeeper(owner.address);

      // 1. Setup a redemption proxy
      const RedemptionProxy =
        await ethers.getContractFactory("RedemptionProxy");
      const impl = await RedemptionProxy.deploy();
      await router
        .connect(owner)
        .setRedemptionProxyImplementation(await impl.getAddress());

      // 2. Do a deposit to have shares
      await routerAsset
        .connect(user)
        .approve(await router.getAddress(), amount);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const depSig = await signAML(
        amlSigner,
        await router.getAddress(),
        user.address,
        amount,
        user.address,
        deadline,
      );
      await router
        .connect(user)
        .depositWithPermit(
          amount,
          user.address,
          0n,
          0n,
          0n,
          depSig,
          deadline,
          0,
          0,
          ethers.ZeroHash,
          ethers.ZeroHash,
        );

      const nuvaShares = await nuvaVault.balanceOf(user.address);
      await nuvaVault
        .connect(user)
        .approve(await router.getAddress(), nuvaShares);

      const redSig = await signRedeemAML(
        amlSigner,
        await router.getAddress(),
        user.address,
        nuvaShares,
        deadline,
      );
      const tx = await router
        .connect(user)
        .requestRedeem(nuvaShares, 0n, redSig, deadline);
      const receipt = await tx.wait();
      const proxyAddress = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "RedemptionRequested",
      ).args[1];

      // Proxy balance is 0 here since it's a mock or assets are still async locked

      // 3. Sweep with zero amount
      await router.connect(owner).sweepRedemptions([proxyAddress], [0n]);

      // 4. Check if mapping IS deleted
      expect(await router.redemptionProxyToUser(proxyAddress)).to.equal(
        ethers.ZeroAddress,
      );
    });
  });

  describe("NuvaVault depositWithPermit", function () {
    async function signNuvaVaultAML(
      signer,
      vaultAddr,
      userAddr,
      assets,
      receiver,
      deadline,
    ) {
      const network = await ethers.provider.getNetwork();
      const domain = {
        name: "NuvaVault",
        version: "1",
        chainId: network.chainId,
        verifyingContract: vaultAddr,
      };
      const types = {
        Deposit: [
          { name: "sender", type: "address" },
          { name: "assets", type: "uint256" },
          { name: "receiver", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = {
        sender: userAddr,
        assets: assets,
        receiver: receiver,
        deadline: deadline,
      };
      return await signer.signTypedData(domain, types, value);
    }

    it("Should deposit directly into NuvaVault using depositWithPermit and valid AML signature (with Permit)", async function () {
      const {
        nuvaVault,
        user,
        amlSigner,
        amount,
        stakingVault,
        assetVault,
        asset,
      } = await loadFixture(deployRouterFixture);

      // 1. Manually get user some stakingVault shares directly
      await asset.connect(user).approve(await assetVault.getAddress(), amount);
      await assetVault.connect(user).deposit(amount, user.address);

      const vaultShares = await assetVault.balanceOf(user.address);
      await assetVault
        .connect(user)
        .approve(await stakingVault.getAddress(), vaultShares);
      await stakingVault.connect(user).deposit(vaultShares, user.address);

      const stakingShares = await stakingVault.balanceOf(user.address);
      expect(stakingShares).to.be.gt(0n);

      // 2. NuvaVault direct deposit with Permit
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const vaultAddr = await nuvaVault.getAddress();

      // Permit data for stakingVault
      const nonce = await stakingVault.nonces(user.address);
      const name = await stakingVault.name();
      const network = await ethers.provider.getNetwork();
      const domain = {
        name: name,
        version: "1",
        chainId: network.chainId,
        verifyingContract: await stakingVault.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = {
        owner: user.address,
        spender: vaultAddr,
        value: stakingShares,
        nonce: nonce,
        deadline: deadline,
      };

      const permitSig = await user.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(permitSig);

      // AML signature
      const amlSig = await signNuvaVaultAML(
        amlSigner,
        vaultAddr,
        user.address,
        stakingShares,
        user.address,
        deadline,
      );

      await expect(
        nuvaVault
          .connect(user)
          .depositWithPermit(
            stakingShares,
            user.address,
            amlSig,
            deadline,
            deadline,
            v,
            r,
            s,
          ),
      ).to.emit(nuvaVault, "Deposit");

      const expectedNuvaShares = stakingShares * 1000000000000n; // offset 12
      expect(await nuvaVault.balanceOf(user.address)).to.equal(
        expectedNuvaShares,
      );
    });

    it("Should fallback to existing allowance if permit fails", async function () {
      const {
        nuvaVault,
        user,
        amlSigner,
        amount,
        stakingVault,
        assetVault,
        asset,
      } = await loadFixture(deployRouterFixture);

      await asset.connect(user).approve(await assetVault.getAddress(), amount);
      await assetVault.connect(user).deposit(amount, user.address);

      const vaultShares = await assetVault.balanceOf(user.address);
      await assetVault
        .connect(user)
        .approve(await stakingVault.getAddress(), vaultShares);
      await stakingVault.connect(user).deposit(vaultShares, user.address);

      const stakingShares = await stakingVault.balanceOf(user.address);
      const vaultAddr = await nuvaVault.getAddress();

      // Manual approve instead of valid permit
      await stakingVault.connect(user).approve(vaultAddr, stakingShares);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const amlSig = await signNuvaVaultAML(
        amlSigner,
        vaultAddr,
        user.address,
        stakingShares,
        user.address,
        deadline,
      );

      // Send invalid permit data
      await expect(
        nuvaVault
          .connect(user)
          .depositWithPermit(
            stakingShares,
            user.address,
            amlSig,
            deadline,
            0,
            0,
            ethers.ZeroHash,
            ethers.ZeroHash,
          ),
      ).to.emit(nuvaVault, "Deposit");

      expect(await nuvaVault.balanceOf(user.address)).to.be.gt(0n);
    });

    it("Should revert depositWithPermit if AML signature is invalid", async function () {
      const { nuvaVault, user, amlSigner, amount, stakingVault } =
        await loadFixture(deployRouterFixture);

      const vaultAddr = await nuvaVault.getAddress();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const stakingShares = 100n; // arbitrary amount

      // Sign with a wrong address
      const otherSigner = (await ethers.getSigners())[4];
      const badAmlSig = await signNuvaVaultAML(
        otherSigner,
        vaultAddr,
        user.address,
        stakingShares,
        user.address,
        deadline,
      );

      await expect(
        nuvaVault
          .connect(user)
          .depositWithPermit(
            stakingShares,
            user.address,
            badAmlSig,
            deadline,
            0,
            0,
            ethers.ZeroHash,
            ethers.ZeroHash,
          ),
      ).to.be.revertedWithCustomError(nuvaVault, "InvalidAmlSignature");
    });

    it("Should revert depositWithPermit if AML deadline is too far in the future", async function () {
      const { nuvaVault, user, amlSigner } = await deployRouterFixture();

      const vaultAddr = await nuvaVault.getAddress();
      const futureDeadline =
        (await ethers.provider.getBlock("latest")).timestamp + 86400 * 2; // 2 days
      const stakingShares = 100n;

      const amlSig = await signNuvaVaultAML(
        amlSigner,
        vaultAddr,
        user.address,
        stakingShares,
        user.address,
        futureDeadline,
      );

      await expect(
        nuvaVault
          .connect(user)
          .depositWithPermit(
            stakingShares,
            user.address,
            amlSig,
            futureDeadline,
            0,
            0,
            ethers.ZeroHash,
            ethers.ZeroHash,
          ),
      ).to.be.revertedWithCustomError(nuvaVault, "AmlDeadlineTooLong");
    });
  });

  describe("NuvaVault Admin Functions", function () {
    it("Should allow owner to set AML signer", async function () {
      const { nuvaVault, owner, amlSigner } =
        await loadFixture(deployRouterFixture);
      const newSigner = (await ethers.getSigners())[4];

      await expect(nuvaVault.connect(owner).setAmlSigner(newSigner.address))
        .to.emit(nuvaVault, "AmlSignerUpdated")
        .withArgs(await amlSigner.getAddress(), newSigner.address);

      expect(await nuvaVault.amlSigner()).to.equal(newSigner.address);
    });

    it("Should not allow non-owner to set AML signer", async function () {
      const { nuvaVault, user } = await loadFixture(deployRouterFixture);
      const newSigner = (await ethers.getSigners())[4];

      await expect(
        nuvaVault.connect(user).setAmlSigner(newSigner.address),
      ).to.be.revertedWithCustomError(nuvaVault, "OwnableUnauthorizedAccount");
    });

    it("Should revert if AML signer is set to zero address", async function () {
      const { nuvaVault, owner } = await loadFixture(deployRouterFixture);

      await expect(
        nuvaVault.connect(owner).setAmlSigner(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(nuvaVault, "InvalidAmlSigner");
    });
  });

  describe("NuvaVault redeemWithPermit", function () {
    async function signNuvaVaultAML(
      signer,
      vaultAddr,
      userAddr,
      assets,
      receiver,
      deadline,
    ) {
      const network = await ethers.provider.getNetwork();
      const domain = {
        name: "NuvaVault",
        version: "1",
        chainId: network.chainId,
        verifyingContract: vaultAddr,
      };
      const types = {
        Deposit: [
          { name: "sender", type: "address" },
          { name: "assets", type: "uint256" },
          { name: "receiver", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = {
        sender: userAddr,
        assets: assets,
        receiver: receiver,
        deadline: deadline,
      };
      return await signer.signTypedData(domain, types, value);
    }

    async function signNuvaVaultRedeemAML(
      signer,
      vaultAddr,
      userAddr,
      shares,
      receiver,
      owner,
      deadline,
    ) {
      const network = await ethers.provider.getNetwork();
      const domain = {
        name: "NuvaVault",
        version: "1",
        chainId: network.chainId,
        verifyingContract: vaultAddr,
      };
      const types = {
        Redeem: [
          { name: "sender", type: "address" },
          { name: "shares", type: "uint256" },
          { name: "receiver", type: "address" },
          { name: "owner", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = {
        sender: userAddr,
        shares: shares,
        receiver: receiver,
        owner: owner,
        deadline: deadline,
      };
      return await signer.signTypedData(domain, types, value);
    }

    it("Should redeem directly from NuvaVault using redeemWithPermit and valid AML signature", async function () {
      const { nuvaVault, user, amlSigner, stakingVault } =
        await loadFixture(deployRouterFixture);

      const vaultAddr = await nuvaVault.getAddress();
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // 1. Manually get user some stakingVault shares directly
      const { asset, assetVault, amount } =
        await loadFixture(deployRouterFixture);
      await asset.connect(user).approve(await assetVault.getAddress(), amount);
      await assetVault.connect(user).deposit(amount, user.address);

      const vaultShares = await assetVault.balanceOf(user.address);
      await assetVault
        .connect(user)
        .approve(await stakingVault.getAddress(), vaultShares);
      await stakingVault.connect(user).deposit(vaultShares, user.address);

      const stakingShares = await stakingVault.balanceOf(user.address);
      expect(stakingShares).to.be.gt(0n);

      // Generate permit data for stakingVault deposit
      const network = await ethers.provider.getNetwork();
      const stakingNonce = await stakingVault.nonces(user.address);
      const stakingDomain = {
        name: await stakingVault.name(),
        version: "1",
        chainId: network.chainId,
        verifyingContract: await stakingVault.getAddress(),
      };
      const permitTypes = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const stakingPermitValue = {
        owner: user.address,
        spender: vaultAddr,
        value: stakingShares,
        nonce: stakingNonce,
        deadline: deadline,
      };

      const depPermitSig = await user.signTypedData(
        stakingDomain,
        permitTypes,
        stakingPermitValue,
      );
      const { v: depV, r: depR, s: depS } = ethers.Signature.from(depPermitSig);

      const depAmlSig = await signNuvaVaultAML(
        amlSigner,
        vaultAddr,
        user.address,
        stakingShares,
        user.address,
        deadline,
      );

      await nuvaVault
        .connect(user)
        .depositWithPermit(
          stakingShares,
          user.address,
          depAmlSig,
          deadline,
          deadline,
          depV,
          depR,
          depS,
        );

      const nuvaShares = await nuvaVault.balanceOf(user.address);
      expect(nuvaShares).to.be.gt(0n);

      // 2. Third-party redeems NuvaVault shares using permit
      const thirdParty = (await ethers.getSigners())[5];

      const nuvaNonce = await nuvaVault.nonces(user.address);
      const nuvaDomain = {
        name: await nuvaVault.name(),
        version: "1",
        chainId: network.chainId,
        verifyingContract: vaultAddr,
      };
      const nuvaPermitValue = {
        owner: user.address,
        spender: thirdParty.address,
        value: nuvaShares,
        nonce: nuvaNonce,
        deadline: deadline,
      };

      const redeemPermitSig = await user.signTypedData(
        nuvaDomain,
        permitTypes,
        nuvaPermitValue,
      );
      const {
        v: redV,
        r: redR,
        s: redS,
      } = ethers.Signature.from(redeemPermitSig);

      const redeemAmlSig = await signNuvaVaultRedeemAML(
        amlSigner,
        vaultAddr,
        thirdParty.address, // messageHash expects the caller's address as sender
        nuvaShares,
        user.address,
        user.address,
        deadline,
      );

      await expect(
        nuvaVault
          .connect(thirdParty)
          .redeemWithPermit(
            nuvaShares,
            user.address,
            user.address,
            redeemAmlSig,
            deadline,
            deadline,
            redV,
            redR,
            redS,
          ),
      ).to.emit(nuvaVault, "Withdraw");

      expect(await nuvaVault.balanceOf(user.address)).to.equal(0n);
    });

    it("Should revert redeemWithPermit if AML signature is invalid", async function () {
      const { nuvaVault, user, amlSigner } =
        await loadFixture(deployRouterFixture);

      const vaultAddr = await nuvaVault.getAddress();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const sharesToRedeem = 50n; // arbitrary

      const otherSigner = (await ethers.getSigners())[4];
      const badAmlSig = await signNuvaVaultRedeemAML(
        otherSigner,
        vaultAddr,
        user.address,
        sharesToRedeem,
        user.address,
        user.address,
        deadline,
      );

      await expect(
        nuvaVault
          .connect(user)
          .redeemWithPermit(
            sharesToRedeem,
            user.address,
            user.address,
            badAmlSig,
            deadline,
            0,
            0,
            ethers.ZeroHash,
            ethers.ZeroHash,
          ),
      ).to.be.revertedWithCustomError(nuvaVault, "InvalidAmlSignature");
    });
  });
});
