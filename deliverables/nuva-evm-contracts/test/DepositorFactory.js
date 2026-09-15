const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DepositorFactory", function () {
  let owner, user, amlSigner;
  let Depositor, DepositorFactory, Token;
  let depositorFactory, depositorImplementation;
  let shareToken, depositToken;

  before(async function () {
    // Get signers
    [owner, user, amlSigner] = await ethers.getSigners();

    // Deploy implementation contract
    Depositor = await ethers.getContractFactory("Depositor");
    depositorImplementation = await Depositor.deploy();
    await depositorImplementation.waitForDeployment();

    // Deploy factory
    DepositorFactory = await ethers.getContractFactory("DepositorFactory");
    depositorFactory = await DepositorFactory.deploy(
      await depositorImplementation.getAddress(),
    );
    await depositorFactory.waitForDeployment();

    // Deploy test tokens
    Token = await ethers.getContractFactory("CustomToken");

    // Deploy share token with 18 decimals
    const ownerAddress = await owner.getAddress();

    // Deploy proxy and initialize
    let proxy = await upgrades.deployProxy(
      Token,
      ["Share Token", "SHR", ownerAddress, 18],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await proxy.waitForDeployment();

    let proxyAddress = await proxy.getAddress();
    shareToken = await ethers.getContractAt("CustomToken", proxyAddress);

    // Mint some tokens to the owner for testing
    // Check if owner already has MINTER_ROLE
    const MINTER_ROLE = await shareToken.MINTER_ROLE();
    const hasMinterRole = await shareToken.hasRole(MINTER_ROLE, ownerAddress);

    if (!hasMinterRole) {
      // Only add minter if owner doesn't already have it
      await expect(shareToken.connect(owner).addMinter(ownerAddress)).to.emit(
        shareToken,
        "RoleGranted",
      );
    }
    await shareToken.mint(ownerAddress, ethers.parseEther("1000000"));

    // Deploy deposit token with 6 decimals (like USDC)
    // Deploy proxy and initialize
    proxy = await upgrades.deployProxy(
      Token,
      ["Deposit Token", "USDC", ownerAddress, 6],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await proxy.waitForDeployment();

    proxyAddress = await proxy.getAddress();
    depositToken = await ethers.getContractAt("CustomToken", proxyAddress);

    // Mint some tokens to the owner for testing
    // Check if owner already has MINTER_ROLE
    const depositMINTER_ROLE = await depositToken.MINTER_ROLE();
    const depositHasMinterRole = await depositToken.hasRole(
      depositMINTER_ROLE,
      ownerAddress,
    );

    if (!depositHasMinterRole) {
      // Only add minter if owner doesn't already have it
      await expect(depositToken.connect(owner).addMinter(ownerAddress)).to.emit(
        depositToken,
        "RoleGranted",
      );
    }
    await depositToken.mint(ownerAddress, ethers.parseUnits("1000000", 6));
  });

  it("should deploy with correct implementation", async function () {
    const implementation = await depositorFactory.implementation();
    expect(implementation).to.equal(await depositorImplementation.getAddress());
  });

  it("should create a new depositor", async function () {
    const tx = await depositorFactory.createDepositor(
      await shareToken.getAddress(),
      await depositToken.getAddress(),
      await amlSigner.getAddress(),
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "DepositorCreated",
    );

    expect(event).to.exist;
    expect(event.args.shareToken).to.equal(await shareToken.getAddress());
    expect(event.args.depositToken).to.equal(await depositToken.getAddress());

    const depositorAddress = await depositorFactory.depositors(
      await shareToken.getAddress(),
      await depositToken.getAddress(),
    );

    expect(depositorAddress).to.not.equal(ethers.ZeroAddress);

    // Verify the depositor is initialized correctly
    const depositor = Depositor.attach(depositorAddress);
    expect(await depositor.shareToken()).to.equal(
      await shareToken.getAddress(),
    );
    expect(await depositor.depositToken()).to.equal(
      await depositToken.getAddress(),
    );
    expect(await depositor.amlSigner()).to.equal(await amlSigner.getAddress());
    const DESTINATION_MANAGER_ADMIN_ROLE =
      await depositor.DESTINATION_MANAGER_ADMIN_ROLE();
    expect(
      await depositor.hasRole(
        DESTINATION_MANAGER_ADMIN_ROLE,
        await owner.getAddress(),
      ),
    ).to.equal(true);
    const DESTINATION_MANAGER_ROLE = await depositor.DESTINATION_MANAGER_ROLE();
    expect(
      await depositor.hasRole(
        DESTINATION_MANAGER_ROLE,
        await owner.getAddress(),
      ),
    ).to.equal(false);
    await expect(
      depositor
        .connect(owner)
        .grantRole(DESTINATION_MANAGER_ROLE, await owner.getAddress()),
    ).to.emit(depositor, "RoleGranted");
    expect(
      await depositor.hasRole(
        DESTINATION_MANAGER_ROLE,
        await owner.getAddress(),
      ),
    ).to.equal(true);
  });

  it("should not allow creating duplicate depositor", async function () {
    await expect(
      depositorFactory.createDepositor(
        await shareToken.getAddress(),
        await depositToken.getAddress(),
        await amlSigner.getAddress(),
      ),
    ).to.be.revertedWithCustomError(depositorFactory, "DepositorAlreadyExists");
  });

  it("should not allow zero addresses in createDepositor", async function () {
    await expect(
      depositorFactory.createDepositor(
        ethers.ZeroAddress,
        await depositToken.getAddress(),
        await amlSigner.getAddress(),
      ),
    ).to.be.revertedWithCustomError(depositorFactory, "ZeroAddress");

    await expect(
      depositorFactory.createDepositor(
        await shareToken.getAddress(),
        ethers.ZeroAddress,
        await amlSigner.getAddress(),
      ),
    ).to.be.revertedWithCustomError(depositorFactory, "ZeroAddress");

    await expect(
      depositorFactory.createDepositor(
        await shareToken.getAddress(),
        await depositToken.getAddress(),
        ethers.ZeroAddress,
      ),
    ).to.be.revertedWithCustomError(depositorFactory, "ZeroAddress");
  });

  it("should allow owner to update implementation", async function () {
    // Deploy new implementation
    const newImplementation = await Depositor.deploy();
    await newImplementation.waitForDeployment();

    const tx = await depositorFactory.updateImplementation(
      await newImplementation.getAddress(),
    );
    await expect(tx)
      .to.emit(depositorFactory, "ImplementationUpdated")
      .withArgs(await newImplementation.getAddress());

    expect(await depositorFactory.implementation()).to.equal(
      await newImplementation.getAddress(),
    );
  });

  it("should not allow non-owner to update implementation", async function () {
    const newImplementation = await Depositor.deploy();
    await newImplementation.waitForDeployment();

    await expect(
      depositorFactory
        .connect(user)
        .updateImplementation(await newImplementation.getAddress()),
    ).to.be.revertedWithCustomError(
      depositorFactory,
      "OwnableUnauthorizedAccount",
    );
  });

  it("should migrate to new depositor implementation", async function () {
    // Deploy new implementation
    const newImplementation = await Depositor.deploy();
    await newImplementation.waitForDeployment();

    // Update implementation in factory
    await depositorFactory.updateImplementation(
      await newImplementation.getAddress(),
    );

    // Migrate the existing depositor
    const tx = await depositorFactory.migrateDepositor(
      await shareToken.getAddress(),
      await depositToken.getAddress(),
      await amlSigner.getAddress(),
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "DepositorMigrated",
    );

    expect(event).to.exist;
    expect(event.args.shareToken).to.equal(await shareToken.getAddress());
    expect(event.args.depositToken).to.equal(await depositToken.getAddress());

    const newDepositorAddress = await depositorFactory.depositors(
      await shareToken.getAddress(),
      await depositToken.getAddress(),
    );

    // Verify the new depositor is using the new implementation
    const newDepositor = Depositor.attach(newDepositorAddress);
    expect(await newDepositor.shareToken()).to.equal(
      await shareToken.getAddress(),
    );
  });

  it("should not allow migrating non-existent depositor", async function () {
    const ownerAddress = await owner.getAddress();

    // Deploy proxy and initialize
    let proxy = await upgrades.deployProxy(
      Token,
      ["New Share", "NSHR", ownerAddress, 18],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await proxy.waitForDeployment();

    const proxyAddress = await proxy.getAddress();
    const newShareToken = await ethers.getContractAt(
      "CustomToken",
      proxyAddress,
    );

    await expect(
      depositorFactory.migrateDepositor(
        await newShareToken.getAddress(),
        await depositToken.getAddress(),
        await amlSigner.getAddress(),
      ),
    ).to.be.revertedWithCustomError(
      depositorFactory,
      "NoExistingDepositorToMigrate",
    );
  });
});
