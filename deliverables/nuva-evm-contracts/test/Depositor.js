const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getAmlSignature, buildPermit } = require("./utils/traditional");

// Helpers
async function latestTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block.timestamp);
}

describe("Depositor", function () {
  async function deployFixture() {
    const [deployer, user, amlSigner, destinationManager, destination] =
      await ethers.getSigners();

    const name = "USD Coin";
    const symbol = "USDC";
    const decimals = 6;

    // Deploy CustomToken
    const CustomToken = await ethers.getContractFactory("CustomToken");

    // Deploy proxy and initialize
    const proxy = await upgrades.deployProxy(
      CustomToken,
      [name, symbol, deployer.address, decimals],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await proxy.waitForDeployment();

    const proxyAddress = await proxy.getAddress();
    const customToken = await ethers.getContractAt("CustomToken", proxyAddress);

    // Mint tokens to user for deposits
    const scale = 10n ** BigInt(decimals);

    // Check if deployer already has MINTER_ROLE
    const MINTER_ROLE = await customToken.MINTER_ROLE();
    const deployerAddress = await deployer.getAddress();
    const hasMinterRole = await customToken.hasRole(
      MINTER_ROLE,
      deployerAddress,
    );

    if (!hasMinterRole) {
      // Only add minter if deployer doesn't already have it
      await expect(
        customToken.connect(deployer).addMinter(deployerAddress),
      ).to.emit(customToken, "RoleGranted");
    }
    await customToken
      .connect(deployer)
      .mint(await user.getAddress(), 1_000_000n * scale);

    // Deploy Depositor implementation with linked library
    const DepositorImpl = await ethers.getContractFactory("Depositor");
    const depositorImpl = await DepositorImpl.deploy();
    await depositorImpl.waitForDeployment();

    const DepositorFactory =
      await ethers.getContractFactory("DepositorFactory");
    const depositorFactory = await DepositorFactory.deploy(
      await depositorImpl.getAddress(),
    );
    await depositorFactory.waitForDeployment();

    // Create a depositor via factory
    const shareToken = ethers.Wallet.createRandom().address; // arbitrary address placeholder
    await (
      await depositorFactory.createDepositor(
        shareToken,
        await customToken.getAddress(),
        await amlSigner.getAddress(),
      )
    ).wait();
    const depositorAddr = await depositorFactory.depositors(
      shareToken,
      await customToken.getAddress(),
    );
    const depositor = await ethers.getContractAt("Depositor", depositorAddr);
    const DESTINATION_MANAGER_ROLE = await depositor.DESTINATION_MANAGER_ROLE();
    await expect(
      depositor
        .connect(deployer)
        .grantRole(
          DESTINATION_MANAGER_ROLE,
          await destinationManager.getAddress(),
        ),
    ).to.emit(depositor, "RoleGranted");
    await expect(
      depositor
        .connect(destinationManager)
        .addDestinationAddress(await destination.getAddress()),
    ).to.emit(depositor, "DestinationAddressAdded");

    return {
      deployer,
      user,
      amlSigner,
      destination,
      token: customToken,
      decimals,
      depositor,
      shareToken,
      destinationManager,
    };
  }

  it("initializes correctly", async function () {
    const { depositor, token, shareToken, amlSigner } = await deployFixture();
    expect(await depositor.shareToken()).to.equal(shareToken);
    expect(await depositor.amlSigner()).to.equal(await amlSigner.getAddress());
    expect(await depositor.depositToken()).to.equal(await token.getAddress());
  });

  it("deposit with prior approve transfers tokens and emits event", async function () {
    const {
      user,
      destination,
      token,
      decimals,
      depositor,
      amlSigner,
      shareToken,
    } = await deployFixture();

    const amt = 1234n * 10n ** BigInt(decimals);
    await token.connect(user).approve(await depositor.getAddress(), amt);

    const deadline = (await latestTimestamp()) + 3600n;
    const signature = await getAmlSignature({
      name: "Depositor",
      verifyingContract: await depositor.getAddress(),
      amlSigner,
      sender: user.address,
      amount: amt,
      destinationAddress: await destination.getAddress(),
      deadline,
    });

    const balBefore = await token.balanceOf(await destination.getAddress());
    await expect(
      depositor
        .connect(user)
        .deposit(amt, await destination.getAddress(), signature, deadline),
    )
      .to.emit(depositor, "Deposit")
      .withArgs(
        await user.getAddress(),
        amt,
        await depositor.depositToken(),
        shareToken,
        await destination.getAddress(),
      );

    const balAfter = await token.balanceOf(await destination.getAddress());
    expect(balAfter - balBefore).to.equal(amt);
  });

  it("reverts deposit on AML expired, wrong signer, and replay", async function () {
    const {
      user,
      destination,
      token,
      decimals,
      depositor,
      amlSigner,
      shareToken,
    } = await deployFixture();
    const amt = 5n * 10n ** BigInt(decimals);
    await token.connect(user).approve(await depositor.getAddress(), amt);

    const nowTs = await latestTimestamp();

    // expired
    const sigExpired = await getAmlSignature({
      name: "Depositor",
      verifyingContract: await depositor.getAddress(),
      amlSigner,
      sender: user.address,
      amount: amt,
      destinationAddress: await destination.getAddress(),
      deadline: nowTs - 1n,
    });

    // Test expired signature - should revert with AmlSignatureExpired
    await expect(
      depositor
        .connect(user)
        .deposit(amt, await destination.getAddress(), sigExpired, nowTs - 1n),
    ).to.be.revertedWithCustomError(depositor, "AmlSignatureExpired");

    // Test wrong signer
    const imposter = (await ethers.getSigners())[3];
    const deadline = nowTs + 3600n;
    const sigWrong = await getAmlSignature({
      name: "Depositor",
      verifyingContract: await depositor.getAddress(),
      amlSigner: imposter,
      sender: user.address,
      amount: amt,
      destinationAddress: await destination.getAddress(),
      deadline,
    });
    await expect(
      depositor
        .connect(user)
        .deposit(amt, await destination.getAddress(), sigWrong, deadline),
    ).to.be.revertedWithCustomError(depositor, "InvalidAmlSigner");

    // Test replay protection
    const signature = await getAmlSignature({
      name: "Depositor",
      verifyingContract: await depositor.getAddress(),
      amlSigner,
      sender: user.address,
      amount: amt,
      destinationAddress: await destination.getAddress(),
      deadline,
    });

    // First deposit should succeed
    await expect(
      depositor
        .connect(user)
        .deposit(amt, await destination.getAddress(), signature, deadline),
    ).to.emit(depositor, "Deposit");

    // Second deposit with same signature should fail
    await expect(
      depositor
        .connect(user)
        .deposit(amt, await destination.getAddress(), signature, deadline),
    ).to.be.revertedWithCustomError(depositor, "AmlSignatureAlreadyUsed");
  });

  it("validates destination manager can manage destination addresses", async function () {
    const { deployer, user, destination, depositor, destinationManager } =
      await deployFixture();

    await expect(
      depositor
        .connect(destinationManager)
        .removeDestinationAddress(await destination.getAddress()),
    ).to.emit(depositor, "DestinationAddressRemoved");
    await expect(
      depositor
        .connect(destinationManager)
        .addDestinationAddress(await destination.getAddress()),
    ).to.emit(depositor, "DestinationAddressAdded");
    await expect(
      depositor
        .connect(destinationManager)
        .addDestinationAddress(await destination.getAddress()),
    ).to.emit(depositor, "DestinationAddressSkipped");

    // user cannot manage
    await expect(
      depositor
        .connect(user)
        .removeDestinationAddress(await destination.getAddress()),
    ).to.be.revertedWithCustomError(
      depositor,
      "AccessControlUnauthorizedAccount",
    );
    await expect(
      depositor
        .connect(user)
        .addDestinationAddress(await destination.getAddress()),
    ).to.be.revertedWithCustomError(
      depositor,
      "AccessControlUnauthorizedAccount",
    );

    // user can manage after role addition
    const DESTINATION_MANAGER_ROLE = await depositor.DESTINATION_MANAGER_ROLE();
    await expect(
      depositor
        .connect(deployer)
        .grantRole(DESTINATION_MANAGER_ROLE, await user.getAddress()),
    ).to.emit(depositor, "RoleGranted");
    await expect(
      depositor
        .connect(deployer)
        .revokeRole(
          DESTINATION_MANAGER_ROLE,
          await destinationManager.getAddress(),
        ),
    ).to.emit(depositor, "RoleRevoked");
    await expect(
      depositor
        .connect(user)
        .removeDestinationAddress(await destination.getAddress()),
    ).to.emit(depositor, "DestinationAddressRemoved");
    await expect(
      depositor
        .connect(user)
        .addDestinationAddress(await destination.getAddress()),
    ).to.emit(depositor, "DestinationAddressAdded");
    await expect(
      depositor
        .connect(user)
        .addDestinationAddress(await destination.getAddress()),
    ).to.emit(depositor, "DestinationAddressSkipped");
  });

  it("validates amount and destination", async function () {
    const {
      user,
      destination,
      token,
      depositor,
      amlSigner,
      destinationManager,
    } = await deployFixture();

    // approve some so we hit internal checks
    await token.connect(user).approve(await depositor.getAddress(), 100n);
    const deadline = (await latestTimestamp()) + 3600n;

    const build = async (amount, dest) =>
      getAmlSignature({
        name: "Depositor",
        verifyingContract: await depositor.getAddress(),
        amlSigner,
        sender: user.address,
        amount,
        destinationAddress: dest,
        deadline,
      });

    // Test zero amount
    {
      const signature = await build(0n, await destination.getAddress());
      // This is a contract-level error, not from AMLUtils
      await expect(
        depositor
          .connect(user)
          .deposit(0n, await destination.getAddress(), signature, deadline),
      ).to.be.revertedWithCustomError(depositor, "InvalidAmount");
    }

    // Test zero destination
    {
      const signature = await build(1n, ethers.ZeroAddress);
      // This is a contract-level error, not from AMLUtils
      await expect(
        depositor
          .connect(user)
          .deposit(1n, ethers.ZeroAddress, signature, deadline),
      )
        .to.be.revertedWithCustomError(depositor, "InvalidAddress")
        .withArgs("destination");
    }

    // Test destination not in allow list
    {
      const signature = await build(1n, await user.getAddress());
      // This is a contract-level error, not from AMLUtils
      await expect(
        depositor
          .connect(user)
          .deposit(1n, await user.getAddress(), signature, deadline),
      )
        .to.be.revertedWithCustomError(depositor, "InvalidAddress")
        .withArgs("destination");
    }

    // Test destination removed from allow list
    {
      await expect(
        depositor
          .connect(destinationManager)
          .removeDestinationAddress(await destination.getAddress()),
      ).to.emit(depositor, "DestinationAddressRemoved");
      const signature = await build(1n, await destination.getAddress());
      // This is a contract-level error, not from AMLUtils
      await expect(
        depositor
          .connect(user)
          .deposit(1n, await destination.getAddress(), signature, deadline),
      )
        .to.be.revertedWithCustomError(depositor, "InvalidAddress")
        .withArgs("destination");
    }
  });

  it("depositWithPermit performs permit then transfers in one tx", async function () {
    const { user, destination, token, decimals, depositor, amlSigner } =
      await deployFixture();

    const amt = 777n * 10n ** BigInt(decimals);
    const nowTs = await latestTimestamp();
    const permitDeadline = nowTs + 3600n;

    // Build AML signature
    const signature = await getAmlSignature({
      name: "Depositor",
      verifyingContract: await depositor.getAddress(),
      amlSigner,
      sender: user.address,
      amount: amt,
      destinationAddress: await destination.getAddress(),
      deadline: nowTs + 3600n,
    });

    // Build permit signature (spender is depositor)
    const { v, r, s } = await buildPermit({
      owner: user,
      token,
      spender: await depositor.getAddress(),
      value: amt,
      deadline: permitDeadline,
      version: "1",
    });

    const destBefore = await token.balanceOf(await destination.getAddress());

    await expect(
      depositor
        .connect(user)
        .depositWithPermit(
          amt,
          await destination.getAddress(),
          signature,
          nowTs + 3600n,
          permitDeadline,
          v,
          r,
          s,
        ),
    ).to.emit(token, "Approval"); // Approval from permit

    const destAfter = await token.balanceOf(await destination.getAddress());
    expect(destAfter - destBefore).to.equal(amt);

    // Allowance should be consumed down to 0 after transferFrom
    expect(
      await token.allowance(
        await user.getAddress(),
        await depositor.getAddress(),
      ),
    ).to.equal(0n);
  });
});
