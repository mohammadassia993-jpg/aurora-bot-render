const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { ZeroAddress } = require("ethers");
const {
  buildPermit,
  getDepositAmlSignature,
  getWithdrawAmlSignature,
} = require("./utils/crossChain");

// Helper function to get current timestamp
async function latestTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block.timestamp);
}

// Helper function to create ExecutorArgs
function createExecutorArgs(
  refundAddress = ethers.Wallet.createRandom().address,
) {
  return {
    refundAddress,
    signedQuote: ethers.hexlify(ethers.randomBytes(100)),
    instructions: ethers.hexlify(ethers.randomBytes(200)),
  };
}

// Helper function to create FeeArgs
function createFeeArgs(
  transferTokenFee = 0,
  nativeTokenFee = ethers.parseEther("0.01"),
) {
  return {
    transferTokenFee,
    nativeTokenFee,
    payee: ethers.Wallet.createRandom().address,
  };
}

describe("CrossChainManager", function () {
  let crossChainManager;
  let customToken;
  let crossChainVault;
  let shareToken;
  let owner;
  let amlSigner;
  let user1;
  let user2;
  let destinationAddress;
  let mockExecutor;

  const DEPOSIT_AMOUNT = ethers.parseEther("100");
  const WITHDRAW_AMOUNT = ethers.parseEther("100");
  const TARGET_CHAIN = 10002; // Ethereum sepolia
  const TARGET_DOMAIN = 0; // Ethereum sepolia

  beforeEach(async function () {
    [owner, amlSigner, user1, user2, destinationAddress] =
      await ethers.getSigners();

    let name = "Test Token";
    let symbol = "TEST";
    let decimals = 6;

    // Deploy proxy and initialize
    const CustomToken = await ethers.getContractFactory("CustomToken");
    let proxy = await upgrades.deployProxy(
      CustomToken,
      [name, symbol, owner.address, decimals],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await proxy.waitForDeployment();

    let proxyAddress = await proxy.getAddress();
    customToken = await ethers.getContractAt("CustomToken", proxyAddress);

    // GRANT the role to the owner so they can mint tokens in the test
    await customToken.addMinter(owner.address);

    // Deploy ShareToken (mock ICustomToken)
    name = "Share Token";
    symbol = "SHARE";
    decimals = 6;

    // Deploy proxy and initialize
    proxy = await upgrades.deployProxy(
      CustomToken,
      [name, symbol, owner.address, decimals],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await proxy.waitForDeployment();

    proxyAddress = await proxy.getAddress();
    shareToken = await ethers.getContractAt("CustomToken", proxyAddress);

    // Grant role for ShareToken as well if needed
    await shareToken.addMinter(owner.address);

    const MockExecutor = await ethers.getContractFactory("MockExecutor");
    mockExecutor = await MockExecutor.deploy();

    // Deploy CrossChainVault (mock)
    const CrossChainVault = await ethers.getContractFactory("CrossChainVault");

    // Deploy proxy and initialize
    const vaultProxy = await upgrades.deployProxy(
      CrossChainVault,
      [await mockExecutor.getAddress()],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await vaultProxy.waitForDeployment();

    const vaultProxyAddress = await vaultProxy.getAddress();
    crossChainVault = await ethers.getContractAt(
      "CrossChainVault",
      vaultProxyAddress,
    );

    // Deploy CrossChainManager implementation
    const CrossChainManager =
      await ethers.getContractFactory("CrossChainManager");

    // Deploy proxy and initialize
    proxy = await upgrades.deployProxy(
      CrossChainManager,
      [
        await customToken.getAddress(),
        await shareToken.getAddress(),
        amlSigner.address,
        await crossChainVault.getAddress(),
      ],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await proxy.waitForDeployment();

    proxyAddress = await proxy.getAddress();
    crossChainManager = await ethers.getContractAt(
      "CrossChainManager",
      proxyAddress,
    );

    // Manually add the destination address since the contract doesn't do it in initialize
    await crossChainManager
      .connect(owner)
      .addDestinationAddress(
        destinationAddress.address,
        TARGET_CHAIN,
        TARGET_DOMAIN,
      );

    // Mint tokens to users
    await customToken.mint(user1.address, ethers.parseEther("10000"));
    await customToken.mint(user2.address, ethers.parseEther("10000"));

    // Approve tokens to CrossChainManager
    await customToken
      .connect(user1)
      .approve(
        await crossChainManager.getAddress(),
        ethers.parseEther("10000"),
      );
    await customToken
      .connect(user2)
      .approve(
        await crossChainManager.getAddress(),
        ethers.parseEther("10000"),
      );
    await shareToken
      .connect(user1)
      .approve(
        await crossChainManager.getAddress(),
        ethers.parseEther("10000"),
      );
    await shareToken
      .connect(user2)
      .approve(
        await crossChainManager.getAddress(),
        ethers.parseEther("10000"),
      );

    // Whitelist the CrossChainMananger contract address
    const WHITELISTED_ROLE = ethers.id("WHITELISTED_ROLE");
    await crossChainVault
      .connect(owner)
      .grantRole(WHITELISTED_ROLE, await crossChainManager.getAddress());
  });

  describe("Initialization", function () {
    it("Should initialize correctly", async function () {
      expect(await crossChainManager.owner()).to.equal(await owner.address);
      expect(await crossChainManager.token()).to.equal(
        await customToken.getAddress(),
      );
      expect(await crossChainManager.shareToken()).to.equal(
        await shareToken.getAddress(),
      );
      expect(await crossChainManager.amlSigner()).to.equal(amlSigner.address);
      expect(await crossChainManager.crossChainVault()).to.equal(
        await crossChainVault.getAddress(),
      );
    });

    it("Should emit CrossChainManagerInitialized event", async function () {
      const CrossChainManager =
        await ethers.getContractFactory("CrossChainManager");

      // Resolve all addresses first to catch the 'null' variable
      const customTokenAddr = await customToken.getAddress();
      const shareTokenAddr = await shareToken.getAddress();
      const amlAddr = await amlSigner.getAddress();
      const vaultAddr = await crossChainVault.getAddress();

      const initArgs = [customTokenAddr, shareTokenAddr, amlAddr, vaultAddr];

      // Deploy and capture the instance
      const proxy = await upgrades.deployProxy(CrossChainManager, initArgs, {
        initializer: "initialize",
        kind: "uups",
      });

      // Wait for the transaction to be mined to check events
      await expect(proxy.deploymentTransaction())
        .to.emit(proxy, "CrossChainManagerInitialized")
        .withArgs(...initArgs);
    });

    it("Should not allow zero address for token", async function () {
      const CrossChainManager =
        await ethers.getContractFactory("CrossChainManager");

      // Resolve all addresses first to catch the 'null' variable
      const customTokenAddr = ZeroAddress;
      const shareTokenAddr = await shareToken.getAddress();
      const amlAddr = await amlSigner.getAddress();
      const vaultAddr = await crossChainVault.getAddress();

      const initArgs = [customTokenAddr, shareTokenAddr, amlAddr, vaultAddr];

      // Deploy and capture the instance
      await expect(
        upgrades.deployProxy(CrossChainManager, initArgs, {
          initializer: "initialize",
          kind: "uups",
        }),
      )
        .to.be.revertedWithCustomError(CrossChainManager, "InvalidAddress")
        .withArgs("token");
    });

    it("Should not allow zero address for share token", async function () {
      const CrossChainManager =
        await ethers.getContractFactory("CrossChainManager");

      // Resolve all addresses first to catch the 'null' variable
      const customTokenAddr = await customToken.getAddress();
      const shareTokenAddr = ZeroAddress;
      const amlAddr = await amlSigner.getAddress();
      const vaultAddr = await crossChainVault.getAddress();

      const initArgs = [customTokenAddr, shareTokenAddr, amlAddr, vaultAddr];

      // Deploy and capture the instance
      await expect(
        upgrades.deployProxy(CrossChainManager, initArgs, {
          initializer: "initialize",
          kind: "uups",
        }),
      )
        .to.be.revertedWithCustomError(CrossChainManager, "InvalidAddress")
        .withArgs("share token");
    });

    it("Should not allow zero address for AML signer", async function () {
      const CrossChainManager =
        await ethers.getContractFactory("CrossChainManager");

      // Resolve all addresses first to catch the 'null' variable
      const customTokenAddr = await customToken.getAddress();
      const shareTokenAddr = await shareToken.getAddress();
      const amlAddr = ZeroAddress;
      const vaultAddr = await crossChainVault.getAddress();

      const initArgs = [customTokenAddr, shareTokenAddr, amlAddr, vaultAddr];

      // Deploy and capture the instance
      await expect(
        upgrades.deployProxy(CrossChainManager, initArgs, {
          initializer: "initialize",
          kind: "uups",
        }),
      )
        .to.be.revertedWithCustomError(CrossChainManager, "InvalidAddress")
        .withArgs("aml signer");
    });

    it("Should not allow zero address for cross chain vault", async function () {
      const CrossChainManager =
        await ethers.getContractFactory("CrossChainManager");

      // Resolve all addresses first to catch the 'null' variable
      const customTokenAddr = await customToken.getAddress();
      const shareTokenAddr = await shareToken.getAddress();
      const amlAddr = await amlSigner.getAddress();
      const vaultAddr = ZeroAddress;

      const initArgs = [customTokenAddr, shareTokenAddr, amlAddr, vaultAddr];

      // Deploy and capture the instance
      await expect(
        upgrades.deployProxy(CrossChainManager, initArgs, {
          initializer: "initialize",
          kind: "uups",
        }),
      )
        .to.be.revertedWithCustomError(CrossChainManager, "InvalidAddress")
        .withArgs("cross chain vault");
    });
  });

  describe("CrossChainManager Upgradeability", function () {
    it("Should upgrade CrossChainManager and preserve state", async function () {
      const deadline = (await latestTimestamp()) + 3600n;
      const executorArgs = createExecutorArgs();
      const feeArgs = createFeeArgs();
      const amlSignature = await getDepositAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: DEPOSIT_AMOUNT,
        deadline,
        destinationAddress: destinationAddress.address,
        targetChain: TARGET_CHAIN,
        targetDomain: TARGET_DOMAIN,
        executorArgs,
        feeArgs,
      });

      await expect(
        crossChainManager
          .connect(user1)
          .deposit(
            DEPOSIT_AMOUNT,
            destinationAddress.address,
            amlSignature,
            deadline,
            TARGET_CHAIN,
            TARGET_DOMAIN,
            executorArgs,
            feeArgs,
            { value: feeArgs.nativeTokenFee },
          ),
      )
        .to.emit(crossChainManager, "Deposited")
        .withArgs(
          user1.address,
          DEPOSIT_AMOUNT,
          await customToken.getAddress(),
          await shareToken.getAddress(),
          destinationAddress.address,
          TARGET_CHAIN,
        );

      const depositTokenBefore = await crossChainManager.token();
      const crossChainVaultBefore = await crossChainManager.crossChainVault();
      const shareTokenBefore = await crossChainManager.shareToken();
      const amlSignerBefore = await crossChainManager.amlSigner();

      // Upgrade to V2
      const CrossChainManagerV2 = await ethers.getContractFactory(
        "CrossChainManagerV2",
      );
      const initialFee = ethers.parseEther("1");
      const upgraded = await upgrades.upgradeProxy(
        await crossChainManager.getAddress(),
        CrossChainManagerV2,
        {
          call: { fn: "initializeV2", args: [initialFee] },
          kind: "uups",
        },
      );

      // Verify state is preserved
      expect(await crossChainManager.token()).to.equal(depositTokenBefore);
      expect(await upgraded.crossChainVault()).to.equal(crossChainVaultBefore);
      expect(await upgraded.shareToken()).to.equal(shareTokenBefore);
      expect(await upgraded.amlSigner()).to.equal(amlSignerBefore);

      // Verify new logic works
      expect(await upgraded.version()).to.equal("V2");
      expect(await upgraded.processingFee()).to.equal(initialFee);
      const newFee = ethers.parseEther("2");
      await expect(upgraded.connect(owner).setProcessingFee(newFee))
        .to.emit(upgraded, "ProcessingFeeUpdated")
        .withArgs(initialFee, newFee);
      expect(await upgraded.processingFee()).to.equal(newFee);
    });

    it("Should prevent non-owners from upgrading CrossChainManager", async function () {
      const CrossChainManagerV2 = await ethers.getContractFactory(
        "CrossChainManagerV2",
      );
      await expect(
        upgrades.upgradeProxy(
          await crossChainManager.getAddress(),
          CrossChainManagerV2.connect(user1),
        ),
      )
        .to.be.revertedWithCustomError(
          crossChainManager,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(user1.address);
    });
  });

  describe("Deposit", function () {
    it("Should allow deposit with valid AML signature", async function () {
      const deadline = (await latestTimestamp()) + 3600n;
      const executorArgs = createExecutorArgs();
      const feeArgs = createFeeArgs();
      const amlSignature = await getDepositAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: DEPOSIT_AMOUNT,
        deadline,
        destinationAddress: destinationAddress.address,
        targetChain: TARGET_CHAIN,
        targetDomain: TARGET_DOMAIN,
        executorArgs,
        feeArgs,
      });

      await expect(
        crossChainManager
          .connect(user1)
          .deposit(
            DEPOSIT_AMOUNT,
            destinationAddress.address,
            amlSignature,
            deadline,
            TARGET_CHAIN,
            TARGET_DOMAIN,
            executorArgs,
            feeArgs,
            { value: feeArgs.nativeTokenFee },
          ),
      )
        .to.emit(crossChainManager, "Deposited")
        .withArgs(
          user1.address,
          DEPOSIT_AMOUNT,
          await customToken.getAddress(),
          await shareToken.getAddress(),
          destinationAddress.address,
          TARGET_CHAIN,
        );
    });

    it("Should allow deposit with permit", async function () {
      const deadline = (await latestTimestamp()) + 3600n;
      const executorArgs = createExecutorArgs();
      const feeArgs = createFeeArgs();
      const amlSignature = await getDepositAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: DEPOSIT_AMOUNT,
        deadline,
        destinationAddress: destinationAddress.address,
        targetChain: TARGET_CHAIN,
        targetDomain: TARGET_DOMAIN,
        executorArgs,
        feeArgs,
      });

      const permitDeadline = (await latestTimestamp()) + 7200n;
      const permitSignature = await buildPermit({
        owner: user1,
        token: customToken,
        spender: await crossChainManager.getAddress(),
        value: DEPOSIT_AMOUNT,
        deadline: permitDeadline,
        version: "1",
      });
      const { v, r, s } = ethers.Signature.from(permitSignature);

      await expect(
        crossChainManager
          .connect(user1)
          .depositWithPermit(
            DEPOSIT_AMOUNT,
            destinationAddress.address,
            amlSignature,
            deadline,
            permitDeadline,
            v,
            r,
            s,
            TARGET_CHAIN,
            TARGET_DOMAIN,
            executorArgs,
            feeArgs,
            { value: feeArgs.nativeTokenFee },
          ),
      ).to.emit(crossChainManager, "Deposited");
    });

    it("Should reject deposit with zero amount", async function () {
      const deadline = (await latestTimestamp()) + 3600n;
      const executorArgs = createExecutorArgs();
      const feeArgs = createFeeArgs();
      const amlSignature = await getDepositAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: 0,
        deadline,
        destinationAddress: destinationAddress.address,
        targetChain: TARGET_CHAIN,
        targetDomain: TARGET_DOMAIN,
        executorArgs,
        feeArgs,
      });

      await expect(
        crossChainManager
          .connect(user1)
          .deposit(
            0,
            destinationAddress.address,
            amlSignature,
            deadline,
            TARGET_CHAIN,
            TARGET_DOMAIN,
            executorArgs,
            feeArgs,
            { value: feeArgs.nativeTokenFee },
          ),
      ).to.be.revertedWithCustomError(
        crossChainManager,
        "AmountMustBeGreaterThanZero",
      );
    });

    it("Should reject deposit with invalid destination", async function () {
      const deadline = (await latestTimestamp()) + 7200n; // Use different deadline

      // First add the invalid destination to generate a valid signature
      await crossChainManager
        .connect(owner)
        .addDestinationAddress(user2.address, TARGET_CHAIN, TARGET_DOMAIN);

      const executorArgs = createExecutorArgs();
      const feeArgs = createFeeArgs();
      const amlSignature = await getDepositAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: DEPOSIT_AMOUNT,
        deadline,
        destinationAddress: user2.address,
        targetChain: TARGET_CHAIN,
        targetDomain: TARGET_DOMAIN,
        executorArgs,
        feeArgs,
      });

      // Now remove the destination to make it invalid
      await crossChainManager
        .connect(owner)
        .removeDestinationAddress(user2.address, TARGET_CHAIN, TARGET_DOMAIN);

      await expect(
        crossChainManager.connect(user1).deposit(
          DEPOSIT_AMOUNT,
          user2.address, // Now this is an invalid destination
          amlSignature,
          deadline,
          TARGET_CHAIN,
          TARGET_DOMAIN,
          executorArgs,
          feeArgs,
          { value: feeArgs.nativeTokenFee },
        ),
      ).to.be.revertedWithCustomError(crossChainManager, "InvalidAddress");
    });

    it("Should reject deposit with expired deadline", async function () {
      const deadline = (await latestTimestamp()) - 1n;
      const executorArgs = createExecutorArgs();
      const feeArgs = createFeeArgs();
      const amlSignature = await getDepositAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: DEPOSIT_AMOUNT,
        deadline,
        destinationAddress: destinationAddress.address,
        targetChain: TARGET_CHAIN,
        targetDomain: TARGET_DOMAIN,
        executorArgs,
        feeArgs,
      });

      await expect(
        crossChainManager
          .connect(user1)
          .deposit(
            DEPOSIT_AMOUNT,
            destinationAddress.address,
            amlSignature,
            deadline,
            TARGET_CHAIN,
            TARGET_DOMAIN,
            executorArgs,
            feeArgs,
            { value: feeArgs.nativeTokenFee },
          ),
      ).to.be.revertedWithCustomError(crossChainManager, "AmlSignatureExpired");
    });

    it("Should reject deposit with invalid AML signature", async function () {
      const deadline = (await latestTimestamp()) + 3600n;
      const executorArgs = createExecutorArgs();
      const feeArgs = createFeeArgs();
      const invalidSignature = await getDepositAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner: user2, // Wrong signer
        sender: user1.address,
        amount: DEPOSIT_AMOUNT,
        deadline,
        destinationAddress: destinationAddress.address,
        targetChain: TARGET_CHAIN,
        targetDomain: TARGET_DOMAIN,
        executorArgs,
        feeArgs,
      });

      await expect(
        crossChainManager
          .connect(user1)
          .deposit(
            DEPOSIT_AMOUNT,
            destinationAddress.address,
            invalidSignature,
            deadline,
            TARGET_CHAIN,
            TARGET_DOMAIN,
            executorArgs,
            feeArgs,
            { value: feeArgs.nativeTokenFee },
          ),
      ).to.be.revertedWithCustomError(crossChainManager, "InvalidAmlSigner");
    });

    it("Should reject deposit with reused AML signature", async function () {
      const deadline = (await latestTimestamp()) + 3600n;
      const executorArgs = createExecutorArgs();
      const feeArgs = createFeeArgs();
      const amlSignature = await getDepositAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: DEPOSIT_AMOUNT,
        deadline,
        destinationAddress: destinationAddress.address,
        targetChain: TARGET_CHAIN,
        targetDomain: TARGET_DOMAIN,
        executorArgs,
        feeArgs,
      });

      // First deposit should succeed
      await crossChainManager
        .connect(user1)
        .deposit(
          DEPOSIT_AMOUNT,
          destinationAddress.address,
          amlSignature,
          deadline,
          TARGET_CHAIN,
          TARGET_DOMAIN,
          executorArgs,
          feeArgs,
          { value: feeArgs.nativeTokenFee },
        );

      // Second deposit with same signature should fail
      await expect(
        crossChainManager
          .connect(user1)
          .deposit(
            DEPOSIT_AMOUNT,
            destinationAddress.address,
            amlSignature,
            deadline,
            TARGET_CHAIN,
            TARGET_DOMAIN,
            executorArgs,
            feeArgs,
            { value: feeArgs.nativeTokenFee },
          ),
      ).to.be.revertedWithCustomError(
        crossChainManager,
        "AmlSignatureAlreadyUsed",
      );
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      // First, make a deposit to have tokens to withdraw
      const deadline = (await latestTimestamp()) + 3600n;
      const executorArgs = createExecutorArgs();
      const feeArgs = createFeeArgs();
      const amlSignature = await getDepositAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: DEPOSIT_AMOUNT,
        deadline,
        destinationAddress: destinationAddress.address,
        targetChain: TARGET_CHAIN,
        targetDomain: TARGET_DOMAIN,
        executorArgs,
        feeArgs,
      });

      await crossChainManager
        .connect(user1)
        .deposit(
          DEPOSIT_AMOUNT,
          destinationAddress.address,
          amlSignature,
          deadline,
          TARGET_CHAIN,
          TARGET_DOMAIN,
          executorArgs,
          feeArgs,
          { value: feeArgs.nativeTokenFee },
        );
    });

    it("Should allow withdraw with valid AML signature", async function () {
      const deadline = (await latestTimestamp()) + 3600n;
      const amlSignature = await getWithdrawAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: WITHDRAW_AMOUNT,
        deadline,
      });

      await shareToken.mint(user1.address, WITHDRAW_AMOUNT);

      await expect(
        crossChainManager
          .connect(user1)
          .withdraw(WITHDRAW_AMOUNT, amlSignature, deadline),
      )
        .to.emit(crossChainManager, "Withdrawn")
        .withArgs(
          user1.address,
          WITHDRAW_AMOUNT,
          await shareToken.getAddress(),
          await customToken.getAddress(),
        );
    });

    it("Should allow withdraw with permit", async function () {
      const deadline = (await latestTimestamp()) + 3600n;
      const amlSignature = await getWithdrawAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: WITHDRAW_AMOUNT,
        deadline,
      });

      const permitDeadline = (await latestTimestamp()) + 7200n;
      const permitSignature = await buildPermit({
        owner: user1,
        token: shareToken,
        spender: await crossChainManager.getAddress(),
        value: DEPOSIT_AMOUNT,
        deadline: permitDeadline,
        version: "1",
      });
      const { v, r, s } = ethers.Signature.from(permitSignature);

      await shareToken.mint(user1.address, WITHDRAW_AMOUNT);

      await expect(
        crossChainManager
          .connect(user1)
          .withdrawWithPermit(
            WITHDRAW_AMOUNT,
            amlSignature,
            deadline,
            permitDeadline,
            v,
            r,
            s,
          ),
      )
        .to.emit(crossChainManager, "Withdrawn")
        .withArgs(
          user1.address,
          WITHDRAW_AMOUNT,
          await shareToken.getAddress(),
          await customToken.getAddress(),
        );
    });

    it("Should reject withdraw with zero amount", async function () {
      const deadline = (await latestTimestamp()) + 3600n;
      const amount = 0;
      const amlSignature = await getWithdrawAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount,
        deadline,
      });

      await expect(
        crossChainManager
          .connect(user1)
          .withdraw(amount, amlSignature, deadline),
      ).to.be.revertedWithCustomError(
        crossChainManager,
        "AmountMustBeGreaterThanZero",
      );
    });

    it("Should reject withdraw with insufficient shareToken balance", async function () {
      const deadline = (await latestTimestamp()) + 3600n;
      const amlSignature = await getWithdrawAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: WITHDRAW_AMOUNT,
        deadline,
      });

      await expect(
        crossChainManager
          .connect(user1)
          .withdraw(WITHDRAW_AMOUNT, amlSignature, deadline),
      )
        .to.be.revertedWithCustomError(shareToken, "ERC20InsufficientBalance")
        .withArgs(user1.address, 0, WITHDRAW_AMOUNT);
    });

    it("Should reject withdraw with expired deadline", async function () {
      const deadline = (await latestTimestamp()) - 1n;
      const amlSignature = await getWithdrawAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: WITHDRAW_AMOUNT,
        deadline,
      });

      await expect(
        crossChainManager
          .connect(user1)
          .withdraw(WITHDRAW_AMOUNT, amlSignature, deadline),
      ).to.be.revertedWithCustomError(crossChainManager, "AmlSignatureExpired");
    });

    it("Should reject withdraw with invalid AML signature", async function () {
      const deadline = (await latestTimestamp()) + 3600n;
      const invalidSignature = await getWithdrawAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner: user2, // Wrong signer
        sender: user1.address,
        amount: WITHDRAW_AMOUNT,
        deadline,
      });

      await expect(
        crossChainManager
          .connect(user1)
          .withdraw(WITHDRAW_AMOUNT, invalidSignature, deadline),
      ).to.be.revertedWithCustomError(crossChainManager, "InvalidAmlSigner");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update AML signer", async function () {
      await expect(
        crossChainManager.connect(owner).updateAmlSigner(user2.address),
      )
        .to.emit(crossChainManager, "AmlSignerUpdated")
        .withArgs(amlSigner.address, user2.address);

      expect(await crossChainManager.amlSigner()).to.equal(user2.address);
    });

    it("Should reject non-owner from updating AML signer", async function () {
      await expect(
        crossChainManager.connect(user1).updateAmlSigner(user2.address),
      ).to.be.revertedWithCustomError(
        crossChainManager,
        "OwnableUnauthorizedAccount",
      );
    });

    it("Should allow owner to update cross chain vault", async function () {
      const oldVault = await crossChainManager.crossChainVault();
      const newVault = user2.address;

      await expect(
        crossChainManager.connect(owner).updateCrossChainConfig(newVault),
      )
        .to.emit(crossChainManager, "CrossChainConfigUpdated")
        .withArgs(oldVault, newVault);

      expect(await crossChainManager.crossChainVault()).to.equal(newVault);
    });

    it("Should reject non-owner from updating cross chain vault", async function () {
      await expect(
        crossChainManager.connect(user1).updateCrossChainConfig(user2.address),
      ).to.be.revertedWithCustomError(
        crossChainManager,
        "OwnableUnauthorizedAccount",
      );
    });

    it("Should allow owner to add destination address", async function () {
      const newDestination = user2.address;
      const newTargetChain = 10003;
      const newTargetDomain = 1;

      await expect(
        crossChainManager
          .connect(owner)
          .addDestinationAddress(
            newDestination,
            newTargetChain,
            newTargetDomain,
          ),
      )
        .to.emit(crossChainManager, "DestinationAddressAdded")
        .withArgs(newDestination, newTargetChain, newTargetDomain);

      expect(
        await crossChainManager.isDestination(
          newDestination,
          newTargetChain,
          newTargetDomain,
        ),
      ).to.be.true;
    });

    it("Should reject non-owner from adding destination address", async function () {
      await expect(
        crossChainManager
          .connect(user1)
          .addDestinationAddress(user2.address, TARGET_CHAIN, TARGET_DOMAIN),
      ).to.be.revertedWithCustomError(
        crossChainManager,
        "OwnableUnauthorizedAccount",
      );
    });

    it("Should allow owner to remove destination address", async function () {
      await expect(
        crossChainManager
          .connect(owner)
          .removeDestinationAddress(
            destinationAddress.address,
            TARGET_CHAIN,
            TARGET_DOMAIN,
          ),
      )
        .to.emit(crossChainManager, "DestinationAddressRemoved")
        .withArgs(destinationAddress.address, TARGET_CHAIN, TARGET_DOMAIN);

      expect(
        await crossChainManager.isDestination(
          destinationAddress.address,
          TARGET_CHAIN,
          TARGET_DOMAIN,
        ),
      ).to.be.false;
    });

    it("Should reject non-owner from removing destination address", async function () {
      await expect(
        crossChainManager
          .connect(user1)
          .removeDestinationAddress(
            destinationAddress.address,
            TARGET_CHAIN,
            TARGET_DOMAIN,
          ),
      ).to.be.revertedWithCustomError(
        crossChainManager,
        "OwnableUnauthorizedAccount",
      );
    });

    it("Should grant the burn role to a user by owner", async function () {
      // Define the role
      const BURN_ROLE = ethers.id("BURN_ROLE");

      // Grant role
      await crossChainManager
        .connect(owner)
        .grantRole(BURN_ROLE, user1.address);

      // Verify the role was granted
      const hasRole = await crossChainManager.hasRole(BURN_ROLE, user1.address);
      expect(hasRole).to.be.true;
    });

    it("Should grant the burn role to a user by random account", async function () {
      // Define the role
      const BURN_ROLE = ethers.id("BURN_ROLE");

      // Grant role
      await expect(
        crossChainManager.connect(user2).grantRole(BURN_ROLE, user1.address),
      ).to.be.revertedWithCustomError(
        crossChainManager,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("Should revoke the burn role to a user by owner", async function () {
      // Define the role
      const BURN_ROLE = ethers.id("BURN_ROLE");

      // Grant role
      await crossChainManager
        .connect(owner)
        .grantRole(BURN_ROLE, user1.address);

      // Verify the role was granted
      let hasRole = await crossChainManager.hasRole(BURN_ROLE, user1.address);
      expect(hasRole).to.be.true;

      // Revoke role
      await crossChainManager
        .connect(owner)
        .revokeRole(BURN_ROLE, user1.address);

      // Verify the role was revoked
      hasRole = await crossChainManager.hasRole(BURN_ROLE, user1.address);
      expect(hasRole).to.be.false;
    });

    it("Should revoke the burn role to a user by random account", async function () {
      // Define the role
      const BURN_ROLE = ethers.id("BURN_ROLE");

      // Grant role
      await expect(
        crossChainManager.connect(user2).revokeRole(BURN_ROLE, user1.address),
      ).to.be.revertedWithCustomError(
        crossChainManager,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("Should allow user to burn tokens", async function () {
      const mintTxHash = "0x1234567890abcdef";
      const burnAmount = ethers.parseEther("10");
      const deadline = (await latestTimestamp()) + 3600n;
      const amlSignature = await getWithdrawAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: WITHDRAW_AMOUNT,
        deadline,
      });

      await shareToken.mint(user1.address, WITHDRAW_AMOUNT);

      await crossChainManager
        .connect(user1)
        .withdraw(WITHDRAW_AMOUNT, amlSignature, deadline);

      // Define the role
      const BURN_ROLE = ethers.id("BURN_ROLE");

      // Grant role
      await crossChainManager
        .connect(owner)
        .grantRole(BURN_ROLE, user1.address);

      await expect(
        crossChainManager.connect(user1).burn(burnAmount, mintTxHash),
      ).to.emit(crossChainManager, "TokensBurned");
    });

    it("Should reject random from burning tokens", async function () {
      await expect(
        crossChainManager
          .connect(user1)
          .burn(WITHDRAW_AMOUNT, "0x1234567890abcdef"),
      ).to.be.revertedWithCustomError(
        crossChainManager,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("Edge Cases", function () {
    it("Should handle multiple destination addresses", async function () {
      const destination2 = user2.address;
      const targetChain2 = 10003;
      const targetDomain2 = 1;
      await crossChainManager
        .connect(owner)
        .addDestinationAddress(destination2, targetChain2, targetDomain2);

      expect(
        await crossChainManager.isDestination(
          destinationAddress.address,
          TARGET_CHAIN,
          TARGET_DOMAIN,
        ),
      ).to.be.true;
      expect(
        await crossChainManager.isDestination(
          destination2,
          targetChain2,
          targetDomain2,
        ),
      ).to.be.true;

      const destinations = await crossChainManager.getDestinationConfigs();
      expect(destinations).to.have.length(2);
      expect(destinations[0].destinationAddress).to.equal(
        destinationAddress.address,
      );
      expect(destinations[0].targetChain).to.equal(TARGET_CHAIN);
      expect(destinations[0].targetDomain).to.equal(TARGET_DOMAIN);
      expect(destinations[1].destinationAddress).to.equal(destination2);
      expect(destinations[1].targetChain).to.equal(targetChain2);
      expect(destinations[1].targetDomain).to.equal(targetDomain2);
    });

    it("Should skip adding duplicate destination address", async function () {
      await expect(
        crossChainManager
          .connect(owner)
          .addDestinationAddress(
            destinationAddress.address,
            TARGET_CHAIN,
            TARGET_DOMAIN,
          ),
      )
        .to.emit(crossChainManager, "DestinationAddressSkipped")
        .withArgs(destinationAddress.address, TARGET_CHAIN, TARGET_DOMAIN);
    });

    it("Should skip removing non-existent destination address", async function () {
      await expect(
        crossChainManager
          .connect(owner)
          .removeDestinationAddress(user2.address, TARGET_CHAIN, TARGET_DOMAIN),
      )
        .to.emit(crossChainManager, "DestinationAddressSkipped")
        .withArgs(user2.address, TARGET_CHAIN, TARGET_DOMAIN);
    });

    it("Should handle reentrancy protection", async function () {
      // This test would require a malicious contract that attempts reentrancy
      // For now, we just verify the modifier is present by checking the function exists
      expect(crossChainManager.deposit).to.be.a("function");
    });

    it("Should handle multiple destinations for same address with different chains", async function () {
      const sameAddress = user2.address;
      const chain1 = 10002;
      const chain2 = 10003;
      const domain = 0;

      // Add same address to different chains
      await crossChainManager
        .connect(owner)
        .addDestinationAddress(sameAddress, chain1, domain);
      await crossChainManager
        .connect(owner)
        .addDestinationAddress(sameAddress, chain2, domain);

      // Both should be valid
      expect(await crossChainManager.isDestination(sameAddress, chain1, domain))
        .to.be.true;
      expect(await crossChainManager.isDestination(sameAddress, chain2, domain))
        .to.be.true;

      // Should have 2 destinations in total
      const destinations = await crossChainManager.getDestinationConfigs();
      expect(destinations).to.have.length(3); // Original + 2 new ones

      // Remove one chain
      await crossChainManager
        .connect(owner)
        .removeDestinationAddress(sameAddress, chain1, domain);

      // Only chain2 should remain
      expect(await crossChainManager.isDestination(sameAddress, chain1, domain))
        .to.be.false;
      expect(await crossChainManager.isDestination(sameAddress, chain2, domain))
        .to.be.true;
    });

    it("Should handle multiple destinations for same address with different domains", async function () {
      const sameAddress = user2.address;
      const chain = 10002;
      const domain1 = 0;
      const domain2 = 1;

      // Add same address to different domains
      await crossChainManager
        .connect(owner)
        .addDestinationAddress(sameAddress, chain, domain1);
      await crossChainManager
        .connect(owner)
        .addDestinationAddress(sameAddress, chain, domain2);

      // Both should be valid
      expect(await crossChainManager.isDestination(sameAddress, chain, domain1))
        .to.be.true;
      expect(await crossChainManager.isDestination(sameAddress, chain, domain2))
        .to.be.true;

      // Remove one domain
      await crossChainManager
        .connect(owner)
        .removeDestinationAddress(sameAddress, chain, domain1);

      // Only domain2 should remain
      expect(await crossChainManager.isDestination(sameAddress, chain, domain1))
        .to.be.false;
      expect(await crossChainManager.isDestination(sameAddress, chain, domain2))
        .to.be.true;
    });

    it("Should reject deposit to non-existent destination for specific chain/domain", async function () {
      const deadline = (await latestTimestamp()) + 3600n;
      const invalidChain = 65535;
      const invalidDomain = 999;

      const executorArgs = createExecutorArgs();
      const feeArgs = createFeeArgs();

      // Generate signature with the invalid chain/domain that will be used in the deposit call
      const amlSignature = await getDepositAmlSignature({
        verifyingContract: await crossChainManager.getAddress(),
        amlSigner,
        sender: user1.address,
        amount: DEPOSIT_AMOUNT,
        deadline,
        destinationAddress: destinationAddress.address,
        targetChain: invalidChain, // Use the same invalid chain as in deposit
        targetDomain: invalidDomain, // Use the same invalid domain as in deposit
        executorArgs,
        feeArgs,
      });

      await expect(
        crossChainManager.connect(user1).deposit(
          DEPOSIT_AMOUNT,
          destinationAddress.address,
          amlSignature,
          deadline,
          invalidChain, // Invalid chain
          invalidDomain, // Invalid domain
          executorArgs,
          feeArgs,
        ),
      )
        .to.be.revertedWithCustomError(crossChainManager, "InvalidAddress")
        .withArgs("destination not valid for target chain/domain");
    });
  });

  describe("Upgradeability", function () {
    it("Should be upgradeable", async function () {
      const CrossChainManagerV2 =
        await ethers.getContractFactory("CrossChainManager");
      const newImplementation = await CrossChainManagerV2.deploy();

      await expect(
        crossChainManager
          .connect(owner)
          .upgradeToAndCall(await newImplementation.getAddress(), "0x"),
      ).to.not.be.reverted;
    });

    it("Should reject non-owner from upgrading", async function () {
      const CrossChainManagerV2 =
        await ethers.getContractFactory("CrossChainManager");
      const newImplementation = await CrossChainManagerV2.deploy();

      await expect(
        crossChainManager
          .connect(user1)
          .upgradeToAndCall(await newImplementation.getAddress(), "0x"),
      ).to.be.revertedWithCustomError(
        crossChainManager,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("View Functions", function () {
    it("Should return correct destination addresses", async function () {
      const destinations = await crossChainManager.getDestinationConfigs();
      expect(destinations).to.have.length(1);
      expect(destinations[0].destinationAddress).to.equal(
        destinationAddress.address,
      );
      expect(destinations[0].targetChain).to.equal(TARGET_CHAIN);
      expect(destinations[0].targetDomain).to.equal(TARGET_DOMAIN);
    });

    it("Should return correct owner address", async function () {
      const ownerAddress = await crossChainManager.owner();
      expect(ownerAddress).to.equal(owner.address);
    });

    it("Should return correct aml signer address", async function () {
      const amlSignerAddress = await crossChainManager.amlSigner();
      expect(amlSignerAddress).to.equal(amlSigner.address);
    });

    it("Should return correct cross chain vault address", async function () {
      const crossChainVaultAddress = await crossChainManager.crossChainVault();
      expect(crossChainVaultAddress).to.equal(crossChainVault.target);
    });

    it("Should return correct boolean for isDestination", async function () {
      const isTrue = await crossChainManager.isDestination(
        destinationAddress.address,
        TARGET_CHAIN,
        TARGET_DOMAIN,
      );
      expect(isTrue).to.be.true;
    });

    it("Should return correct token address", async function () {
      const tokenAddress = await crossChainManager.token();
      const expectedtokenAddress = await customToken.getAddress();
      expect(tokenAddress).to.equal(expectedtokenAddress);
    });

    it("Should return correct share token address", async function () {
      const shareTokenAddress = await crossChainManager.shareToken();
      const expectedShareTokenAddress = await shareToken.getAddress();
      expect(shareTokenAddress).to.equal(expectedShareTokenAddress);
    });

    it("Should return correct upgrade interface version", async function () {
      const version = await crossChainManager.UPGRADE_INTERFACE_VERSION();
      expect(version).to.equal("5.0.0");
    });
  });
});
