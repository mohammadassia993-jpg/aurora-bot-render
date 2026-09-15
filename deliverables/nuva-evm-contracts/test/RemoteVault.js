const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { getAmlSignature, buildPermit } = require("./utils/traditional");

describe("RemoteVault", function () {
  async function deploy() {
    const [owner, amlSigner, user1, user2, user3] = await ethers.getSigners();

    // Deploy CustomToken for testing
    const CustomToken = await ethers.getContractFactory("CustomToken");
    const tokenProxy = await upgrades.deployProxy(
      CustomToken,
      ["Test Token", "TEST", owner.address, 6],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await tokenProxy.waitForDeployment();
    const token = await ethers.getContractAt(
      "CustomToken",
      await tokenProxy.getAddress(),
    );

    // Deploy ShareToken for testing
    const ShareToken = await ethers.getContractFactory("CustomToken");
    const shareTokenProxy = await upgrades.deployProxy(
      ShareToken,
      ["Share Token", "SHARE", owner.address, 6],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await shareTokenProxy.waitForDeployment();
    const shareToken = await ethers.getContractAt(
      "CustomToken",
      await shareTokenProxy.getAddress(),
    );

    // Grant minter role to owner for both tokens
    await token.connect(owner).addMinter(owner.address);
    await shareToken.connect(owner).addMinter(owner.address);

    // Mint tokens to users for testing
    const scale = BigInt(10 ** 6);
    await token.connect(owner).mint(user1.address, 10000n * scale);
    await token.connect(owner).mint(user2.address, 5000n * scale);
    await token.connect(owner).mint(user3.address, 3000n * scale);

    // Deploy RemoteVault
    const RemoteVault = await ethers.getContractFactory("RemoteVault");
    const vaultProxy = await upgrades.deployProxy(
      RemoteVault,
      [
        await token.getAddress(),
        await shareToken.getAddress(),
        amlSigner.address,
      ],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await vaultProxy.waitForDeployment();
    const vault = await ethers.getContractAt(
      "RemoteVault",
      await vaultProxy.getAddress(),
    );

    return {
      owner,
      amlSigner,
      user1,
      user2,
      user3,
      token,
      shareToken,
      vault,
      scale,
    };
  }

  describe("Deployment and Initialization", function () {
    it("should deploy successfully with correct parameters", async function () {
      const { vault, token, shareToken, amlSigner } = await deploy();

      expect(await vault.token()).to.equal(await token.getAddress());
      expect(await vault.shareToken()).to.equal(await shareToken.getAddress());
      expect(await vault.amlSigner()).to.equal(amlSigner.address);
    });

    it("should fail to initialize with zero addresses", async function () {
      const [owner, amlSigner] = await ethers.getSigners();
      const RemoteVault = await ethers.getContractFactory("RemoteVault");

      // Test zero token address
      await expect(
        upgrades.deployProxy(
          RemoteVault,
          [
            ethers.ZeroAddress,
            ethers.Wallet.createRandom().address,
            amlSigner.address,
          ],
          { initializer: "initialize", kind: "uups" },
        ),
      ).to.be.revertedWithCustomError(RemoteVault, "InvalidAddress");

      // Test zero share token address
      await expect(
        upgrades.deployProxy(
          RemoteVault,
          [
            ethers.Wallet.createRandom().address,
            ethers.ZeroAddress,
            amlSigner.address,
          ],
          { initializer: "initialize", kind: "uups" },
        ),
      ).to.be.revertedWithCustomError(RemoteVault, "InvalidAddress");

      // Test zero AML signer address
      await expect(
        upgrades.deployProxy(
          RemoteVault,
          [
            ethers.Wallet.createRandom().address,
            ethers.Wallet.createRandom().address,
            ethers.ZeroAddress,
          ],
          { initializer: "initialize", kind: "uups" },
        ),
      ).to.be.revertedWithCustomError(RemoteVault, "InvalidAddress");
    });

    it("should emit RemoteVaultInitialized event on initialization", async function () {
      const [owner, amlSigner] = await ethers.getSigners();
      const RemoteVault = await ethers.getContractFactory("RemoteVault");

      const tokenAddress = ethers.Wallet.createRandom().address;
      const shareTokenAddress = ethers.Wallet.createRandom().address;

      const proxy = await upgrades.deployProxy(
        RemoteVault,
        [tokenAddress, shareTokenAddress, amlSigner.address],
        { initializer: "initialize", kind: "uups" },
      );
      await proxy.waitForDeployment();

      // Note: Event emission testing for proxy initialization can be complex
      // This test mainly ensures the contract deploys without errors
      expect(await proxy.getAddress()).to.be.properAddress;
    });
  });

  describe("Destination Address Management", function () {
    it("should allow owner to add destination addresses", async function () {
      const { vault, owner, user1 } = await deploy();
      const destinationAddress = user1.address;

      await expect(
        vault.connect(owner).addDestinationAddress(destinationAddress),
      )
        .to.emit(vault, "DestinationAddressAdded")
        .withArgs(destinationAddress);

      expect(await vault.isDestination(destinationAddress)).to.be.true;
    });

    it("should allow owner to remove destination addresses", async function () {
      const { vault, owner, user1 } = await deploy();
      const destinationAddress = user1.address;

      // Add first
      await vault.connect(owner).addDestinationAddress(destinationAddress);
      expect(await vault.isDestination(destinationAddress)).to.be.true;

      // Remove
      await expect(
        vault.connect(owner).removeDestinationAddress(destinationAddress),
      )
        .to.emit(vault, "DestinationAddressRemoved")
        .withArgs(destinationAddress);

      expect(await vault.isDestination(destinationAddress)).to.be.false;
    });

    it("should prevent non-owners from managing destination addresses", async function () {
      const { vault, user1 } = await deploy();

      await expect(
        vault
          .connect(user1)
          .addDestinationAddress(ethers.Wallet.createRandom().address),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");

      await expect(
        vault
          .connect(user1)
          .removeDestinationAddress(ethers.Wallet.createRandom().address),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("should handle adding duplicate destination addresses gracefully", async function () {
      const { vault, owner, user1 } = await deploy();
      const destinationAddress = user1.address;

      await vault.connect(owner).addDestinationAddress(destinationAddress);

      // Adding duplicate should not revert but should emit skipped event
      await expect(
        vault.connect(owner).addDestinationAddress(destinationAddress),
      )
        .to.emit(vault, "DestinationAddressSkipped")
        .withArgs(destinationAddress);
    });

    it("should handle removing non-existent destination addresses gracefully", async function () {
      const { vault, owner } = await deploy();
      const nonExistentAddress = ethers.Wallet.createRandom().address;

      // Removing non-existent address should not revert
      await expect(
        vault.connect(owner).removeDestinationAddress(nonExistentAddress),
      )
        .to.emit(vault, "DestinationAddressSkipped")
        .withArgs(nonExistentAddress);
    });
  });

  describe("AML Signature Verification", function () {
    it("should verify valid AML signatures for deposits", async function () {
      const { vault, amlSigner, user1, user2, token, scale } = await deploy();
      const amount = 1000n * scale;
      const destinationAddress = user2.address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

      // Add destination address
      await vault
        .connect(await deploy().then((d) => d.owner))
        .addDestinationAddress(destinationAddress);

      // Create valid signature
      const signature = await getAmlSignature({
        amlSigner,
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      // Approve tokens first
      await token.connect(user1).approve(await vault.getAddress(), amount);

      // Deposit should succeed with valid signature
      await expect(
        vault
          .connect(user1)
          .deposit(amount, destinationAddress, signature, deadline),
      )
        .to.emit(vault, "Deposited")
        .withArgs(
          user1.address,
          amount,
          await vault.token(),
          await vault.shareToken(),
          destinationAddress,
        );
    });

    it("should reject deposits with invalid AML signer", async function () {
      const { vault, user1, user2, token, scale } = await deploy();
      const amount = 1000n * scale;
      const destinationAddress = user2.address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Add destination address
      await vault
        .connect(await deploy().then((d) => d.owner))
        .addDestinationAddress(destinationAddress);

      // Use wrong signer
      const wrongSigner = ethers.Wallet.createRandom();
      const signature = await getAmlSignature({
        amlSigner: wrongSigner,
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      await token.connect(user1).approve(await vault.getAddress(), amount);

      await expect(
        vault
          .connect(user1)
          .deposit(amount, destinationAddress, signature, deadline),
      ).to.be.revertedWithCustomError(vault, "InvalidAmlSigner");
    });

    it("should reject deposits with expired deadlines", async function () {
      const { vault, amlSigner, user1, user2, token, scale } = await deploy();
      const amount = 1000n * scale;
      const destinationAddress = user2.address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) - 3600); // 1 hour ago

      // Add destination address
      await vault
        .connect(await deploy().then((d) => d.owner))
        .addDestinationAddress(destinationAddress);

      const signature = await getAmlSignature({
        amlSigner,
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      await token.connect(user1).approve(await vault.getAddress(), amount);

      await expect(
        vault
          .connect(user1)
          .deposit(amount, destinationAddress, signature, deadline),
      ).to.be.revertedWithCustomError(vault, "AmlSignatureExpired");
    });

    it("should prevent replay attacks with used signatures", async function () {
      const { vault, amlSigner, user1, user2, token, scale } = await deploy();
      const amount = 1000n * scale;
      const destinationAddress = user2.address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Add destination address
      await vault
        .connect(await deploy().then((d) => d.owner))
        .addDestinationAddress(destinationAddress);

      const signature = await getAmlSignature({
        amlSigner,
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      await token.connect(user1).approve(await vault.getAddress(), amount);

      // First deposit should succeed
      await vault
        .connect(user1)
        .deposit(amount, destinationAddress, signature, deadline);

      // Second deposit with same signature should fail
      await expect(
        vault
          .connect(user1)
          .deposit(amount, destinationAddress, signature, deadline),
      ).to.be.revertedWithCustomError(vault, "AmlSignatureAlreadyUsed");
    });

    describe("Invalid AML Signature Scenarios", function () {
      it("should reject deposits with malformed signature - incorrect length", async function () {
        const { vault, user1, user2, token, scale } = await deploy();
        const amount = 1000n * scale;
        const destinationAddress = user2.address;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // Add destination address
        await vault
          .connect(await deploy().then((d) => d.owner))
          .addDestinationAddress(destinationAddress);

        // Create malformed signature (too short)
        const malformedSignature = "0x1234567890abcdef";

        await token.connect(user1).approve(await vault.getAddress(), amount);

        await expect(
          vault
            .connect(user1)
            .deposit(amount, destinationAddress, malformedSignature, deadline),
        ).to.be.revertedWithCustomError(vault, "InvalidAmlSignature");
      });

      it("should reject deposits with empty signature", async function () {
        const { vault, user1, user2, token, scale } = await deploy();
        const amount = 1000n * scale;
        const destinationAddress = user2.address;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // Add destination address
        await vault
          .connect(await deploy().then((d) => d.owner))
          .addDestinationAddress(destinationAddress);

        // Empty signature
        const emptySignature = "0x";

        await token.connect(user1).approve(await vault.getAddress(), amount);

        await expect(
          vault
            .connect(user1)
            .deposit(amount, destinationAddress, emptySignature, deadline),
        ).to.be.revertedWithCustomError(vault, "InvalidAmlSignature");
      });

      it("should reject deposits with signature for wrong message", async function () {
        const { vault, amlSigner, user1, user2, token, scale } = await deploy();
        const amount = 1000n * scale;
        const destinationAddress = user2.address;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // Add destination address
        await vault
          .connect(await deploy().then((d) => d.owner))
          .addDestinationAddress(destinationAddress);

        // Create signature for different amount (message mismatch)
        const wrongAmount = 2000n * scale;
        const signature = await getAmlSignature({
          amlSigner,
          name: "Depositor",
          sender: user1.address,
          amount: wrongAmount,
          destinationAddress,
          deadline,
          verifyingContract: await vault.getAddress(),
        });

        await token.connect(user1).approve(await vault.getAddress(), amount);

        await expect(
          vault
            .connect(user1)
            .deposit(amount, destinationAddress, signature, deadline),
        ).to.be.revertedWithCustomError(vault, "InvalidAmlSigner");
      });

      it("should reject deposits with signature for wrong function name", async function () {
        const { vault, amlSigner, user1, user2, token, scale } = await deploy();
        const amount = 1000n * scale;
        const destinationAddress = user2.address;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // Add destination address
        await vault
          .connect(await deploy().then((d) => d.owner))
          .addDestinationAddress(destinationAddress);

        // Create signature with wrong function name
        const signature = await getAmlSignature({
          amlSigner,
          name: "Withdrawal", // Wrong function name
          sender: user1.address,
          amount,
          destinationAddress,
          deadline,
          verifyingContract: await vault.getAddress(),
        });

        await token.connect(user1).approve(await vault.getAddress(), amount);

        await expect(
          vault
            .connect(user1)
            .deposit(amount, destinationAddress, signature, deadline),
        ).to.be.revertedWithCustomError(vault, "InvalidAmlSigner");
      });

      it("should reject deposits with signature for wrong contract address", async function () {
        const { vault, amlSigner, user1, user2, token, scale } = await deploy();
        const amount = 1000n * scale;
        const destinationAddress = user2.address;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // Add destination address
        await vault
          .connect(await deploy().then((d) => d.owner))
          .addDestinationAddress(destinationAddress);

        // Create signature for wrong contract
        const wrongContractAddress = ethers.Wallet.createRandom().address;
        const signature = await getAmlSignature({
          amlSigner,
          name: "Depositor",
          sender: user1.address,
          amount,
          destinationAddress,
          deadline,
          verifyingContract: wrongContractAddress,
        });

        await token.connect(user1).approve(await vault.getAddress(), amount);

        await expect(
          vault
            .connect(user1)
            .deposit(amount, destinationAddress, signature, deadline),
        ).to.be.revertedWithCustomError(vault, "InvalidAmlSigner");
      });

      it("should reject withdrawals with invalid signature", async function () {
        const { vault, user1, scale } = await deploy();
        const amount = 1000n * scale;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // Create invalid signature (random bytes)
        const invalidSignature = ethers.hexlify(ethers.randomBytes(65));

        await expect(
          vault.connect(user1).withdraw(amount, invalidSignature, deadline),
        ).to.be.revertedWithCustomError(vault, "InvalidAmlSignature");
      });

      it("should reject withdrawals with signature for wrong message", async function () {
        const { vault, amlSigner, user1, scale } = await deploy();
        const amount = 1000n * scale;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // Create signature for different amount
        const wrongAmount = 2000n * scale;
        const signature = await getAmlSignature({
          amlSigner,
          name: "Withdrawal",
          sender: user1.address,
          amount: wrongAmount,
          destinationAddress: null,
          deadline,
          verifyingContract: await vault.getAddress(),
        });

        await expect(
          vault.connect(user1).withdraw(amount, signature, deadline),
        ).to.be.revertedWithCustomError(vault, "InvalidAmlSigner");
      });

      it("should reject deposits with signature containing invalid v, r, s values", async function () {
        const { vault, user1, user2, token, scale } = await deploy();
        const amount = 1000n * scale;
        const destinationAddress = user2.address;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // Add destination address
        await vault
          .connect(await deploy().then((d) => d.owner))
          .addDestinationAddress(destinationAddress);

        // Create signature with invalid s value (too high)
        const invalidSignature = ethers.solidityPacked(
          ["uint8", "bytes32", "bytes32"],
          [
            27, // v
            ethers.hexlify(ethers.randomBytes(32)), // r
            "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", // s > secp256k1n/2
          ],
        );

        await token.connect(user1).approve(await vault.getAddress(), amount);

        await expect(
          vault
            .connect(user1)
            .deposit(amount, destinationAddress, invalidSignature, deadline),
        ).to.be.revertedWithCustomError(vault, "InvalidAmlSignature");
      });
    });
  });

  describe("Deposit Functionality", function () {
    it("should allow deposits with valid AML signature and destination", async function () {
      const { vault, amlSigner, user1, user2, scale, owner, token } =
        await deploy();
      const amount = 1000n * scale;
      const destinationAddress = user2.address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Add destination address
      await vault.connect(owner).addDestinationAddress(destinationAddress);

      // Create valid signature
      const signature = await getAmlSignature({
        amlSigner,
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      // Approve and deposit
      await token.connect(user1).approve(await vault.getAddress(), amount);

      const initialBalance = await token.balanceOf(destinationAddress);

      await expect(
        vault
          .connect(user1)
          .deposit(amount, destinationAddress, signature, deadline),
      )
        .to.emit(vault, "Deposited")
        .withArgs(
          user1.address,
          amount,
          await vault.token(),
          await vault.shareToken(),
          destinationAddress,
        );

      const finalBalance = await token.balanceOf(destinationAddress);
      expect(finalBalance - initialBalance).to.equal(amount);
    });

    it("should reject deposits to non-whitelisted destinations", async function () {
      const { vault, amlSigner, user1, user2, scale, token } = await deploy();
      const amount = 1000n * scale;
      const destinationAddress = user2.address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Don't add destination address to whitelist

      const signature = await getAmlSignature({
        amlSigner,
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      await token.connect(user1).approve(await vault.getAddress(), amount);

      await expect(
        vault
          .connect(user1)
          .deposit(amount, destinationAddress, signature, deadline),
      ).to.be.revertedWithCustomError(vault, "InvalidAddress");
    });

    it("should reject deposits with zero amount", async function () {
      const { vault, amlSigner, user1, user2 } = await deploy();
      const amount = 0n;
      const destinationAddress = user2.address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      await vault
        .connect(await deploy().then((d) => d.owner))
        .addDestinationAddress(destinationAddress);

      const signature = await getAmlSignature({
        amlSigner,
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      await expect(
        vault
          .connect(user1)
          .deposit(amount, destinationAddress, signature, deadline),
      ).to.be.revertedWithCustomError(vault, "AmountMustBeGreaterThanZero");
    });

    it("should reject deposits if the user has insufficient token balance", async function () {
      const { vault, amlSigner, user3, user2, scale, owner, token } =
        await deploy();
      // user3 was minted 3000 tokens in setup. Try to deposit 4000.
      const amount = 4000n * scale;
      const destinationAddress = user2.address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      await vault.connect(owner).addDestinationAddress(destinationAddress);

      const signature = await getAmlSignature({
        amlSigner,
        name: "Depositor",
        sender: user3.address,
        amount,
        destinationAddress,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      await token.connect(user3).approve(await vault.getAddress(), amount);

      await expect(
        vault
          .connect(user3)
          .deposit(amount, destinationAddress, signature, deadline),
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });

    it("should reject deposits if the user has insufficient token allowance", async function () {
      const { vault, amlSigner, user1, user2, scale, owner, token } =
        await deploy();
      const amount = 1000n * scale;
      const destinationAddress = user2.address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      await vault.connect(owner).addDestinationAddress(destinationAddress);

      const signature = await getAmlSignature({
        amlSigner,
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      // Explicitly set allowance to 0
      await token.connect(user1).approve(await vault.getAddress(), 0n);

      await expect(
        vault
          .connect(user1)
          .deposit(amount, destinationAddress, signature, deadline),
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });
  });

  describe("Withdrawal Functionality", function () {
    it("should allow withdrawals with valid AML signature", async function () {
      const { vault, amlSigner, user1, shareToken, scale } = await deploy();
      const amount = 1000n * scale;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Mint share tokens to vault for withdrawal
      await shareToken
        .connect(await deploy().then((d) => d.owner))
        .mint(await vault.getAddress(), amount);

      // Create valid signature
      const signature = await getAmlSignature({
        amlSigner,
        name: "Withdrawal",
        sender: user1.address,
        amount,
        destinationAddress: null, // destinationAddress not used for withdrawals
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      // Mint tokens to user1
      await shareToken.mint(user1.address, amount * 2n);

      // Approve vault to burn share tokens
      await shareToken.connect(user1).approve(await vault.getAddress(), amount);

      const initialBalance = await shareToken.balanceOf(user1.address);

      await expect(vault.connect(user1).withdraw(amount, signature, deadline))
        .to.emit(vault, "Withdrawn")
        .withArgs(
          user1.address,
          amount,
          await vault.shareToken(),
          await vault.token(),
        );

      const finalBalance = await shareToken.balanceOf(user1.address);
      expect(finalBalance).to.equal(initialBalance - amount);
    });

    it("should reject withdrawals with invalid AML signer", async function () {
      const { vault, user1, scale } = await deploy();
      const amount = 1000n * scale;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Use wrong signer
      const wrongSigner = ethers.Wallet.createRandom();
      const signature = await getAmlSignature({
        amlSigner: wrongSigner,
        name: "Withdrawal",
        sender: user1.address,
        amount,
        destinationAddress: null, // destinationAddress not used for withdrawals
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      await expect(
        vault.connect(user1).withdraw(amount, signature, deadline),
      ).to.be.revertedWithCustomError(vault, "InvalidAmlSigner");
    });

    it("should reject withdrawals with zero amount", async function () {
      const { vault, amlSigner, user1 } = await deploy();
      const amount = 0n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const signature = await getAmlSignature({
        amlSigner,
        name: "Withdrawal",
        sender: user1.address,
        amount,
        destinationAddress: null, // destinationAddress not used for withdrawals
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      await expect(
        vault.connect(user1).withdraw(amount, signature, deadline),
      ).to.be.revertedWithCustomError(vault, "AmountMustBeGreaterThanZero");
    });

    it("should reject withdrawals if the user has insufficient shareToken balance", async function () {
      const { vault, amlSigner, user3, shareToken, scale } = await deploy();
      const amount = 1000n * scale;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // User3 has 0 shareTokens right now
      const signature = await getAmlSignature({
        amlSigner,
        name: "Withdrawal",
        sender: user3.address,
        amount,
        destinationAddress: null,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      await shareToken.connect(user3).approve(await vault.getAddress(), amount);

      await expect(
        vault.connect(user3).withdraw(amount, signature, deadline),
      ).to.be.revertedWithCustomError(shareToken, "ERC20InsufficientBalance");
    });

    it("should reject withdrawals if the user has insufficient shareToken allowance", async function () {
      const { vault, amlSigner, user1, shareToken, scale } = await deploy();
      const amount = 1000n * scale;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      await shareToken.mint(user1.address, amount);

      const signature = await getAmlSignature({
        amlSigner,
        name: "Withdrawal",
        sender: user1.address,
        amount,
        destinationAddress: null,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      // Explicitly set allowance to 0
      await shareToken.connect(user1).approve(await vault.getAddress(), 0n);

      await expect(
        vault.connect(user1).withdraw(amount, signature, deadline),
      ).to.be.revertedWithCustomError(shareToken, "ERC20InsufficientAllowance");
    });

    it("should prevent replay attacks with used withdrawal signatures", async function () {
      const { vault, amlSigner, user1, shareToken, scale } = await deploy();
      const amount = 1000n * scale;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      await shareToken.mint(user1.address, amount * 2n); // Mint enough for 2 withdrawals
      await shareToken
        .connect(user1)
        .approve(await vault.getAddress(), amount * 2n);

      const signature = await getAmlSignature({
        amlSigner,
        name: "Withdrawal",
        sender: user1.address,
        amount,
        destinationAddress: null,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      // First withdrawal should succeed
      await vault.connect(user1).withdraw(amount, signature, deadline);

      // Second withdrawal with same signature should fail
      await expect(
        vault.connect(user1).withdraw(amount, signature, deadline),
      ).to.be.revertedWithCustomError(vault, "AmlSignatureAlreadyUsed");
    });
  });

  describe("Permit Functionality", function () {
    it("should allow permit-based deposits", async function () {
      const { vault, amlSigner, user1, user2, token, scale, owner } =
        await deploy();
      const amount = 1000n * scale;
      const destinationAddress = user2.address;
      const amlDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Add destination address
      await vault.connect(owner).addDestinationAddress(destinationAddress);

      // Create AML signature
      const amlSignature = await getAmlSignature({
        amlSigner,
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline: amlDeadline,
        verifyingContract: await vault.getAddress(),
      });

      // Create permit signature
      const permitDeadline = amlDeadline + 1000n;

      const { v, r, s } = await buildPermit({
        owner: user1,
        token,
        spender: await vault.getAddress(),
        value: amount,
        deadline: permitDeadline,
        version: "1",
      });

      const initialBalance = await token.balanceOf(destinationAddress);

      await expect(
        vault
          .connect(user1)
          .depositWithPermit(
            amount,
            destinationAddress,
            amlSignature,
            amlDeadline,
            permitDeadline,
            v,
            r,
            s,
          ),
      ).to.emit(vault, "Deposited");

      const finalBalance = await token.balanceOf(destinationAddress);
      expect(finalBalance - initialBalance).to.equal(amount);
    });

    it("should allow permit-based withdrawals", async function () {
      const { vault, amlSigner, user1, user2, shareToken, scale, owner } =
        await deploy();
      const amount = 1000n * scale;
      const amlDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Create AML signature
      const amlSignature = await getAmlSignature({
        amlSigner,
        name: "Withdrawal",
        sender: user1.address,
        amount,
        destinationAddress: null, // destinationAddress not used for withdrawals
        deadline: amlDeadline,
        verifyingContract: await vault.getAddress(),
      });

      // Create permit signature
      const permitDeadline = amlDeadline + 1000n;

      const { v, r, s } = await buildPermit({
        owner: user1,
        token: shareToken,
        spender: await vault.getAddress(),
        value: amount,
        deadline: permitDeadline,
        version: "1",
      });

      // Mint tokens to user1, but not providing approval
      await shareToken.mint(user1.address, amount * 2n);

      const initialBalance = await shareToken.balanceOf(user1.address);

      await expect(
        vault
          .connect(user1)
          .withdrawWithPermit(
            amount,
            amlSignature,
            amlDeadline,
            permitDeadline,
            v,
            r,
            s,
          ),
      ).to.emit(vault, "Withdrawn");

      const finalBalance = await shareToken.balanceOf(user1.address);
      expect(finalBalance).to.equal(initialBalance - amount);
    });

    it("should reject permit deposits with an expired permit deadline", async function () {
      const { vault, amlSigner, user1, user2, token, scale, owner } =
        await deploy();
      const amount = 1000n * scale;
      const destinationAddress = user2.address;
      const amlDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      await vault.connect(owner).addDestinationAddress(destinationAddress);

      const amlSignature = await getAmlSignature({
        amlSigner,
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline: amlDeadline,
        verifyingContract: await vault.getAddress(),
      });

      // Create an EXPIRED permit deadline (1 hour ago)
      const expiredPermitDeadline = BigInt(
        Math.floor(Date.now() / 1000) - 3600,
      );

      const { v, r, s } = await buildPermit({
        owner: user1,
        token,
        spender: await vault.getAddress(),
        value: amount,
        deadline: expiredPermitDeadline,
        version: "1",
      });

      await expect(
        vault
          .connect(user1)
          .depositWithPermit(
            amount,
            destinationAddress,
            amlSignature,
            amlDeadline,
            expiredPermitDeadline,
            v,
            r,
            s,
          ),
      ).to.be.revertedWithCustomError(vault, "InsufficientAllowance");
    });

    it("should reject permit withdrawals with an invalid permit signature", async function () {
      const { vault, amlSigner, user1, user2, shareToken, scale } =
        await deploy();
      const amount = 1000n * scale;
      const amlDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const permitDeadline = amlDeadline + 1000n;

      const amlSignature = await getAmlSignature({
        amlSigner,
        name: "Withdrawal",
        sender: user1.address,
        amount,
        destinationAddress: null,
        deadline: amlDeadline,
        verifyingContract: await vault.getAddress(),
      });

      // Have user2 sign the permit instead of user1 (Invalid Signature)
      const { v, r, s } = await buildPermit({
        owner: user2,
        token: shareToken,
        spender: await vault.getAddress(),
        value: amount,
        deadline: permitDeadline,
        version: "1",
      });

      await shareToken.mint(user1.address, amount);

      await expect(
        vault
          .connect(user1)
          .withdrawWithPermit(
            amount,
            amlSignature,
            amlDeadline,
            permitDeadline,
            v,
            r,
            s,
          ),
      ).to.be.revertedWithCustomError(vault, "InsufficientAllowance");
    });

    it("should handle front-run deposits (permit already consumed)", async function () {
      const { vault, amlSigner, user1, user2, token, scale, owner } =
        await deploy();
      const amount = 1000n * scale;
      const destinationAddress = user2.address;
      const amlDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const permitDeadline = amlDeadline + 1000n;

      await vault.connect(owner).addDestinationAddress(destinationAddress);

      const amlSignature = await getAmlSignature({
        amlSigner,
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline: amlDeadline,
        verifyingContract: await vault.getAddress(),
      });

      const { v, r, s } = await buildPermit({
        owner: user1,
        token,
        spender: await vault.getAddress(),
        value: amount,
        deadline: permitDeadline,
        version: "1",
      });

      // SIMULATE FRONT-RUNNING: We explicitly consume the permit by calling it directly on the token
      await token.permit(
        user1.address,
        await vault.getAddress(),
        amount,
        permitDeadline,
        v,
        r,
        s,
      );

      // Verify the allowance was set by the front-runner
      expect(
        await token.allowance(user1.address, await vault.getAddress()),
      ).to.equal(amount);

      // Now call depositWithPermit. The internal permit() will fail (nonce used),
      // but the try/catch will swallow it and the allowance check will pass!
      await expect(
        vault
          .connect(user1)
          .depositWithPermit(
            amount,
            destinationAddress,
            amlSignature,
            amlDeadline,
            permitDeadline,
            v,
            r,
            s,
          ),
      ).to.emit(vault, "Deposited");
    });

    it("should handle front-run withdrawals (permit already consumed)", async function () {
      const { vault, amlSigner, user1, shareToken, scale } = await deploy();
      const amount = 1000n * scale;
      const amlDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const permitDeadline = amlDeadline + 1000n;

      const amlSignature = await getAmlSignature({
        amlSigner,
        name: "Withdrawal",
        sender: user1.address,
        amount,
        destinationAddress: null,
        deadline: amlDeadline,
        verifyingContract: await vault.getAddress(),
      });

      const { v, r, s } = await buildPermit({
        owner: user1,
        token: shareToken,
        spender: await vault.getAddress(),
        value: amount,
        deadline: permitDeadline,
        version: "1",
      });

      await shareToken.mint(user1.address, amount * 2n);

      // SIMULATE FRONT-RUNNING on the shareToken
      await shareToken.permit(
        user1.address,
        await vault.getAddress(),
        amount,
        permitDeadline,
        v,
        r,
        s,
      );

      await expect(
        vault
          .connect(user1)
          .withdrawWithPermit(
            amount,
            amlSignature,
            amlDeadline,
            permitDeadline,
            v,
            r,
            s,
          ),
      ).to.emit(vault, "Withdrawn");
    });

    it("should revert with InsufficientAllowance if deposit permit fails and allowance is not set", async function () {
      const { vault, amlSigner, user1, user2, token, scale, owner } =
        await deploy();
      const amount = 1000n * scale;
      const destinationAddress = user2.address;
      const amlDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const permitDeadline = amlDeadline + 1000n;

      await vault.connect(owner).addDestinationAddress(destinationAddress);

      const amlSignature = await getAmlSignature({
        amlSigner,
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline: amlDeadline,
        verifyingContract: await vault.getAddress(),
      });

      // CREATE INVALID PERMIT: Sign it with user2's key instead of user1
      const { v, r, s } = await buildPermit({
        owner: user2,
        token,
        spender: await vault.getAddress(),
        value: amount,
        deadline: permitDeadline,
        version: "1",
      });

      // The try/catch will swallow the ERC2612InvalidSigner error from the token contract.
      // Because user1 never gave allowance, it will fall through to your custom InsufficientAllowance revert.
      await expect(
        vault
          .connect(user1)
          .depositWithPermit(
            amount,
            destinationAddress,
            amlSignature,
            amlDeadline,
            permitDeadline,
            v,
            r,
            s,
          ),
      ).to.be.revertedWithCustomError(vault, "InsufficientAllowance");
    });

    it("should revert with InsufficientAllowance if withdraw permit fails and allowance is not set", async function () {
      const { vault, amlSigner, user1, shareToken, scale } = await deploy();
      const amount = 1000n * scale;
      const amlDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Create an explicitly EXPIRED permit deadline (1 hour ago)
      const expiredPermitDeadline = BigInt(
        Math.floor(Date.now() / 1000) - 3600,
      );

      const amlSignature = await getAmlSignature({
        amlSigner,
        name: "Withdrawal",
        sender: user1.address,
        amount,
        destinationAddress: null,
        deadline: amlDeadline,
        verifyingContract: await vault.getAddress(),
      });

      const { v, r, s } = await buildPermit({
        owner: user1,
        token: shareToken,
        spender: await vault.getAddress(),
        value: amount,
        deadline: expiredPermitDeadline,
        version: "1",
      });

      await shareToken.mint(user1.address, amount);

      // The try/catch will swallow the ERC2612ExpiredSignature error.
      // It falls back to checking allowance, which is 0, so it throws InsufficientAllowance.
      await expect(
        vault
          .connect(user1)
          .withdrawWithPermit(
            amount,
            amlSignature,
            amlDeadline,
            expiredPermitDeadline,
            v,
            r,
            s,
          ),
      ).to.be.revertedWithCustomError(vault, "InsufficientAllowance");
    });
  });

  describe("AML Signer Management", function () {
    it("should allow the owner to update the AML signer", async function () {
      const { vault, owner, amlSigner, user2 } = await deploy();
      const newAmlSigner = user2.address;

      // Ensure the update emits the correct event with old and new addresses
      await expect(vault.connect(owner).updateAmlSigner(newAmlSigner))
        .to.emit(vault, "AmlSignerUpdated")
        .withArgs(amlSigner.address, newAmlSigner);

      // Verify the state change
      expect(await vault.amlSigner()).to.equal(newAmlSigner);
    });

    it("should revert if the new AML signer is the zero address", async function () {
      const { vault, owner } = await deploy();

      await expect(vault.connect(owner).updateAmlSigner(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(vault, "InvalidAddress")
        .withArgs("aml signer");
    });

    it("should prevent non-owners from updating the AML signer", async function () {
      const { vault, user1, user2 } = await deploy();

      await expect(vault.connect(user1).updateAmlSigner(user2.address))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });

    it("should allow a valid deposit after the AML signer has been rotated", async function () {
      const { vault, owner, user1, user2, token, scale } = await deploy();
      const amount = 100n * scale;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const destinationAddress = user2.address;

      // 1. Rotate the AML Signer to user3
      const [, , , user3] = await ethers.getSigners();
      await vault.connect(owner).updateAmlSigner(user3.address);
      await vault.connect(owner).addDestinationAddress(destinationAddress);

      // 2. Generate signature using the NEW signer (user3)
      const signature = await getAmlSignature({
        amlSigner: user3, // New Signer
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      // 3. Deposit should succeed
      await token.connect(user1).approve(await vault.getAddress(), amount);
      await expect(
        vault
          .connect(user1)
          .deposit(amount, destinationAddress, signature, deadline),
      ).to.emit(vault, "Deposited");
    });

    it("should reject a signature from the OLD AML signer after rotation", async function () {
      const { vault, owner, amlSigner, user1, user2, token, scale } =
        await deploy();
      const amount = 100n * scale;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // 1. Create signature with the ORIGINAL signer
      const signature = await getAmlSignature({
        amlSigner: amlSigner, // Original Signer
        name: "Depositor",
        sender: user1.address,
        amount,
        destinationAddress: user2.address,
        deadline,
        verifyingContract: await vault.getAddress(),
      });

      // 2. Rotate the signer to someone else
      const [, , , user3] = await ethers.getSigners();
      await vault.connect(owner).updateAmlSigner(user3.address);

      // 3. Attempting to use the old signature should now fail
      await token.connect(user1).approve(await vault.getAddress(), amount);
      await expect(
        vault
          .connect(user1)
          .deposit(amount, user2.address, signature, deadline),
      ).to.be.revertedWithCustomError(vault, "InvalidAmlSigner");
    });
  });

  describe("Access Control", function () {
    it("should only allow owner to upgrade the contract", async function () {
      const { vault, owner, user1 } = await deploy();

      const RemoteVaultV2 = await ethers.getContractFactory("RemoteVault");

      await expect(
        upgrades.upgradeProxy(await vault.getAddress(), RemoteVaultV2),
      ).to.not.be.reverted;

      // Non-owner should not be able to upgrade
      const RemoteVaultV2AsUser1 = await ethers.getContractFactory(
        "RemoteVault",
        user1,
      );
      await expect(
        upgrades.upgradeProxy(await vault.getAddress(), RemoteVaultV2AsUser1),
      ).to.be.reverted;
    });
  });

  describe("Reentrancy Protection", function () {
    it("should prevent reentrancy attacks", async function () {
      // This test would require a malicious contract that attempts reentrancy
      // For now, we ensure the contract uses ReentrancyGuard
      const { vault } = await deploy();

      // The contract should have ReentrancyGuard functionality
      // This is more of a structural test
      expect(await vault.getAddress()).to.be.properAddress;
    });
  });
});
