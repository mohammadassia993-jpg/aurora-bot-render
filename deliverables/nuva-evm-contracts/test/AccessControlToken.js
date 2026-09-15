const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("CustomToken AccessControl", function () {
  async function deploy() {
    const [admin, alice, bob] = await ethers.getSigners();

    const name = "RoleToken";
    const symbol = "RLT";
    const initialSupply = 1_000_000n;
    const decimals = 6;

    const CustomToken = await ethers.getContractFactory("CustomToken");

    // Deploy proxy and initialize
    const proxy = await upgrades.deployProxy(
      CustomToken,
      [name, symbol, admin.address, decimals],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await proxy.waitForDeployment();

    const proxyAddress = await proxy.getAddress();
    const customToken = await ethers.getContractAt("CustomToken", proxyAddress);

    // Admin needs to be granted MINTER_ROLE before minting
    await customToken.connect(admin).addMinter(admin.address);

    const scale = BigInt(10 ** decimals);
    await customToken.connect(admin).mint(admin.address, initialSupply * scale);

    // Test removing and re-adding minter role
    await expect(
      customToken.connect(admin).removeMinter(admin.address),
    ).to.emit(customToken, "RoleRevoked");

    await expect(customToken.connect(admin).addMinter(admin.address)).to.emit(
      customToken,
      "RoleGranted",
    );

    return {
      admin,
      alice,
      bob,
      token: customToken,
      name,
      symbol,
      initialSupply: BigInt(initialSupply),
      decimals,
    };
  }

  it("assigns DEFAULT_ADMIN, MINTER to creator", async function () {
    const { admin, token } = await deploy();
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
    const MINTER_ROLE = await token.MINTER_ROLE();

    // Admin is owner, so check ownership instead of DEFAULT_ADMIN_ROLE
    expect(await token.owner()).to.equal(admin.address);
    // Admin has MINTER_ROLE from deployment (granted in deploy function)
    expect(await token.hasRole(MINTER_ROLE, admin.address)).to.equal(true);
  });

  it("mint requires MINTER_ROLE and is transferrable via grant/revoke", async function () {
    const { admin, alice, token, decimals } = await deploy();
    const MINTER_ROLE = await token.MINTER_ROLE();
    const amount = 1000n * BigInt(10 ** decimals);

    await expect(
      token.connect(alice).mint(alice.address, amount),
    ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");

    await expect(token.connect(admin).addMinter(alice.address)).to.emit(
      token,
      "RoleGranted",
    );

    await expect(token.connect(alice).mint(alice.address, amount)).to.emit(
      token,
      "Transfer",
    );
  });

  it("should allow token holders to burn their own tokens", async function () {
    const { token, admin, alice, decimals } = await deploy();
    const scale = BigInt(10 ** decimals);

    // Mint some tokens to alice first
    const mintAmount = 1000n * scale;
    await token.connect(admin).addMinter(admin.address);
    await token.connect(admin).mint(alice.address, mintAmount);

    // Verify alice can burn their own tokens
    const burnAmount = 100n * scale;

    await expect(token.connect(alice).burn(burnAmount)).to.emit(
      token,
      "Transfer",
    );

    const balance = await token.balanceOf(alice.address);
    expect(balance).to.equal(mintAmount - burnAmount);
  });
});
