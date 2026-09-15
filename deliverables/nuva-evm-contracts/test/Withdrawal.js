const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWithdrawal } = require("./helpers/fixtures");
const { getAmlSignature, buildPermit } = require("./utils/traditional");

describe("Withdrawal", function () {
  async function deployFixture() {
    const [owner, minter, burner, amlSigner, user, other] =
      await ethers.getSigners();

    const CustomToken = await ethers.getContractFactory("CustomToken");

    // Deploy proxy and initialize
    const proxy = await upgrades.deployProxy(
      CustomToken,
      ["Nu Token", "NU", owner.address, 18],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await proxy.waitForDeployment();

    const proxyAddress = await proxy.getAddress();
    const token = await ethers.getContractAt("CustomToken", proxyAddress);

    // paymentToken can be any address to log; use token address for simplicity
    const paymentToken = token.target;

    // Deploy Withdrawal contract
    const withdrawal = await deployWithdrawal();

    // Initialize the withdrawal contract with the deployer as the admin and burn user
    await withdrawal.initialize(
      token.target,
      paymentToken,
      amlSigner.address,
      owner.address,
    );
    const BURN_ROLE = await withdrawal.BURN_ROLE();
    await expect(
      withdrawal.connect(owner).grantRole(BURN_ROLE, burner.address),
    ).to.emit(withdrawal, "RoleGranted");

    // Mint tokens to user and approve when needed
    await expect(token.connect(owner).addMinter(minter.address)).to.emit(
      token,
      "RoleGranted",
    );
    await token
      .connect(minter)
      .mint(user.address, ethers.parseUnits("1000", 18));

    return {
      owner,
      minter,
      burner,
      amlSigner,
      user,
      other,
      token,
      withdrawal,
      paymentToken,
    };
  }

  it("withdraw: locks tokens with valid AML signature", async function () {
    const { user, amlSigner, token, withdrawal, paymentToken } =
      await deployFixture();

    const amount = ethers.parseUnits("100", 18);
    const amlDeadline =
      (await ethers.provider.getBlock("latest")).timestamp + 3600;

    // Pre approve for withdraw (non-permit flow)
    await token.connect(user).approve(withdrawal.target, amount);

    const amlSig = await getAmlSignature({
      name: "Withdrawal",
      verifyingContract: await withdrawal.getAddress(),
      amlSigner,
      sender: user.address,
      amount,
      deadline: amlDeadline,
    });

    await expect(withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline))
      .to.emit(withdrawal, "Withdraw")
      .withArgs(
        user.address,
        amount,
        await withdrawal.shareToken(),
        paymentToken,
      );

    expect(await token.balanceOf(withdrawal.target)).to.equal(amount);
    expect(await token.balanceOf(user.address)).to.equal(
      ethers.parseUnits("900", 18),
    );
  });

  it("withdrawWithPermit: allows withdrawal with permit and valid AML signature", async function () {
    const { user, amlSigner, token, withdrawal, paymentToken } =
      await deployFixture();

    const amount = ethers.parseUnits("50", 18);
    const amlDeadline =
      (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const permitDeadline = amlDeadline + 1000;

    const amlSig = await getAmlSignature({
      name: "Withdrawal",
      verifyingContract: await withdrawal.getAddress(),
      amlSigner,
      sender: user.address,
      amount,
      deadline: amlDeadline,
    });

    const { v, r, s } = await buildPermit({
      token,
      owner: user,
      spender: withdrawal.target,
      value: amount,
      deadline: permitDeadline,
      version: "1",
    });

    await expect(
      withdrawal
        .connect(user)
        .withdrawWithPermit(
          amount,
          amlSig,
          amlDeadline,
          permitDeadline,
          v,
          r,
          s,
        ),
    )
      .to.emit(withdrawal, "Withdraw")
      .withArgs(
        user.address,
        amount,
        await withdrawal.shareToken(),
        paymentToken,
      );

    expect(await token.balanceOf(withdrawal.target)).to.equal(amount);
  });

  it("reverts when AML signature expired", async function () {
    const { user, amlSigner, token, withdrawal } = await deployFixture();

    const amount = ethers.parseUnits("10", 18);
    const amlDeadline =
      (await ethers.provider.getBlock("latest")).timestamp - 1; // past

    await token.connect(user).approve(withdrawal.target, amount);

    const amlSig = await getAmlSignature({
      name: "Withdrawal",
      verifyingContract: await withdrawal.getAddress(),
      amlSigner,
      sender: user.address,
      amount,
      deadline: amlDeadline,
    });

    // Test expired signature - should revert with AmlSignatureExpired
    await expect(
      withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline),
    ).to.be.revertedWithCustomError(withdrawal, "AmlSignatureExpired");
  });

  it("reverts on AML signature replay", async function () {
    const { user, amlSigner, token, withdrawal } = await deployFixture();

    const amount = ethers.parseUnits("5", 18);
    const amlDeadline =
      (await ethers.provider.getBlock("latest")).timestamp + 3600;

    await token.connect(user).approve(withdrawal.target, amount * 2n);

    const amlSig = await getAmlSignature({
      name: "Withdrawal",
      verifyingContract: await withdrawal.getAddress(),
      amlSigner,
      sender: user.address,
      amount,
      deadline: amlDeadline,
    });

    await withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline);

    // Test replay protection - should revert with AmlSignatureAlreadyUsed
    await expect(
      withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline),
    ).to.be.revertedWithCustomError(withdrawal, "AmlSignatureAlreadyUsed");
  });

  it("reverts for invalid AML signer", async function () {
    const { user, other, token, withdrawal } = await deployFixture();

    const amount = ethers.parseUnits("20", 18);
    const amlDeadline =
      (await ethers.provider.getBlock("latest")).timestamp + 3600;

    await token.connect(user).approve(withdrawal.target, amount);

    // Signed by wrong signer
    const amlSig = await getAmlSignature({
      name: "Withdrawal",
      verifyingContract: await withdrawal.getAddress(),
      amlSigner: other,
      sender: user.address,
      amount,
      deadline: amlDeadline,
    });

    // Test invalid AML signer
    await expect(
      withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline),
    ).to.be.revertedWithCustomError(withdrawal, "InvalidAmlSigner");
  });

  it("reverts when permit deadline expired", async function () {
    const { user, amlSigner, token, withdrawal } = await deployFixture();

    const amount = ethers.parseUnits("15", 18);
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const amlDeadline = now - 3600;
    const permitDeadline = now - 1; // past

    const amlSig = await getAmlSignature({
      name: "Withdrawal",
      verifyingContract: await withdrawal.getAddress(),
      amlSigner,
      sender: user.address,
      amount,
      deadline: amlDeadline,
    });

    const { v, r, s } = await buildPermit({
      token,
      owner: user,
      spender: withdrawal.target,
      value: amount,
      deadline: permitDeadline,
      version: "1",
    });

    // Test that the transaction reverts with the expected error
    await expect(
      withdrawal
        .connect(user)
        .withdrawWithPermit(
          amount,
          amlSig,
          amlDeadline,
          permitDeadline,
          v,
          r,
          s,
        ),
    ).to.be.revertedWithCustomError(withdrawal, "AmlSignatureExpired");
  });

  describe("burn", function () {
    it("reverts when caller does not have BURNER_ROLE", async function () {
      const { owner, minter, withdrawal, token } =
        await loadFixture(deployFixture);
      const amount = ethers.parseUnits("100", 18);

      // Mint tokens to the withdrawal contract
      await token.connect(minter).mint(owner.address, amount);
      await token.connect(owner).transfer(withdrawal.target, amount);

      const mintTransactionHash =
        "0x1234567890123456789012345678901234567890123456789012345678901234";
      const BURN_ROLE = await withdrawal.BURN_ROLE();

      await expect(withdrawal.connect(owner).burn(amount, mintTransactionHash))
        .to.be.revertedWithCustomError(
          withdrawal,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(owner.address, BURN_ROLE);
    });

    it("reverts if non-admin tries to burn", async function () {
      const { other, withdrawal } = await deployFixture();
      const BURN_ROLE = await withdrawal.BURN_ROLE();
      await expect(
        withdrawal
          .connect(other)
          .burn(
            1,
            "0x1234567890123456789012345678901234567890123456789012345678901234",
          ),
      )
        .to.be.revertedWithCustomError(
          withdrawal,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(other.address, BURN_ROLE);
    });

    it("reverts when burn amount is zero", async function () {
      const { burner, withdrawal } = await deployFixture();
      await expect(
        withdrawal
          .connect(burner)
          .burn(
            0,
            "0x1234567890123456789012345678901234567890123456789012345678901234",
          ),
      ).to.be.revertedWithCustomError(
        withdrawal,
        "AmountMustBeGreaterThanZero",
      );
    });

    it("reverts when mint transaction hash is empty", async function () {
      const { burner, withdrawal } = await deployFixture();
      await expect(
        withdrawal.connect(burner).burn(1, ""),
      ).to.be.revertedWithCustomError(withdrawal, "InvalidMintTransactionHash");
    });
  });

  describe("withdrawWithPermit edge cases", function () {
    it("reverts when amount is zero", async function () {
      const { user, amlSigner, token, withdrawal } = await deployFixture();
      const amlDeadline =
        (await ethers.provider.getBlock("latest")).timestamp + 3600;
      const permitDeadline = amlDeadline + 1000;

      const amlSig = await getAmlSignature({
        name: "Withdrawal",
        verifyingContract: await withdrawal.getAddress(),
        amlSigner,
        sender: user.address,
        amount: 0,
        deadline: amlDeadline,
      });

      const { v, r, s } = await buildPermit({
        token,
        owner: user,
        spender: withdrawal.target,
        value: 0,
        deadline: permitDeadline,
        version: "1",
      });

      await expect(
        withdrawal
          .connect(user)
          .withdrawWithPermit(0, amlSig, amlDeadline, permitDeadline, v, r, s),
      ).to.be.revertedWithCustomError(
        withdrawal,
        "AmountMustBeGreaterThanZero",
      );
    });

    it("reverts with expired AML signature", async function () {
      const { user, amlSigner, withdrawal, token } =
        await loadFixture(deployFixture);
      const amount = ethers.parseUnits("100", 18);
      const amlDeadline =
        (await ethers.provider.getBlock("latest")).timestamp + 3600;
      const permitDeadline = amlDeadline + 1000;

      // Create an expired signature
      const expiredDeadline =
        (await ethers.provider.getBlock("latest")).timestamp - 1;

      // paymentToken can be any address to log; use token address for simplicity
      const paymentToken = token.target;

      const amlSig = await getAmlSignature({
        name: "Withdrawal",
        verifyingContract: await withdrawal.getAddress(),
        amlSigner,
        sender: user.address,
        amount,
        deadline: amlDeadline,
      });

      // Test expired signature - should revert with AmlSignatureExpired
      await expect(
        withdrawal.connect(user).withdraw(amount, amlSig, expiredDeadline),
      ).to.be.revertedWithCustomError(withdrawal, "AmlSignatureExpired");
    });
  });

  describe("ERC20 functions", function () {
    it("should have the correct initial state", async function () {
      const { withdrawal, token, paymentToken, amlSigner, owner, burner } =
        await loadFixture(deployFixture);

      const BURN_ADMIN_ROLE = await withdrawal.BURN_ADMIN_ROLE();
      const BURN_ROLE = await withdrawal.BURN_ROLE();

      expect(await withdrawal.shareToken()).to.equal(token.target);
      expect(await withdrawal.paymentToken()).to.equal(paymentToken);
      expect(await withdrawal.amlSigner()).to.equal(amlSigner.address);
      expect(await withdrawal.hasRole(BURN_ADMIN_ROLE, owner.address)).to.be
        .true;
      expect(await withdrawal.hasRole(BURN_ROLE, burner.address)).to.be.true;
    });

    it("should not have transfer function", async function () {
      const { withdrawal } = await deployFixture();

      // Check if transfer function exists and is not callable
      expect(await withdrawal.transfer).to.be.undefined;
    });

    it("should not have transferFrom function", async function () {
      const { withdrawal } = await deployFixture();

      // Check if transferFrom function exists and is not callable
      expect(await withdrawal.transferFrom).to.be.undefined;
    });
  });
});
